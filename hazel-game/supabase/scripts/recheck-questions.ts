// Re-checks the saved question bank against today's rules (#146).
// ----------------------------------------------------------------------------
// The bank is reused for every child, and most questions a kid sees come from
// it. Questions saved before the rules (#133, #146) only ever passed the word
// filter. This runs each saved question through the checks a new one gets —
// the screen, the blind check and the explanation check, the same prompts as
// the question service (`_shared/questionScreen.ts`) — and holds back any that
// fail: status 'review', the reason in `review_note`. The owner finds them in
// `select * from question_review_queue` and decides with
// `select review_question(id, 'approved' | 'retired' | 'active')`.
//
// Run it from hazel-game/ with the project's service-role key (never ship
// that key anywhere else) and an Anthropic key. A dry run first — it prints
// what it would hold back and changes nothing:
//
//   SUPABASE_URL=https://….supabase.co SUPABASE_SERVICE_ROLE_KEY=… ANTHROPIC_API_KEY=… \
//     deno run --allow-env --allow-net supabase/scripts/recheck-questions.ts
//
// then the same with --apply to hold them back. Options:
//   --apply              hold back the questions that fail (default: dry run)
//   --limit N            stop after N questions (default: all)
//   --topic T            only this topic
//   --include-approved   also recheck questions the owner approved
//   --include-reviewed   also recheck questions the owner already reviewed
//   --default-age N      age to check questions saved without one (default 9)
//   --batch N            questions per check call (default 15)
//   --parallel N         check calls at a time (default 4)
//
// Needs migration 0017 (the review_note column). Two Claude calls per batch;
// a batch whose check fails is left as it is and counted, so a rerun picks it
// up. A rerun skips what the owner has reviewed since, unless told not to.
// ----------------------------------------------------------------------------

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js';
import {
  CHECK_EFFORT,
  CHECK_MAX_TOKENS,
  CHECK_PROMPT,
  CHECK_SCHEMA,
  EXPLAIN_EFFORT,
  EXPLAIN_MAX_TOKENS,
  EXPLAIN_PROMPT,
  EXPLAIN_SCHEMA,
  MODEL,
  checkInput,
  explainInput,
  replyJson,
  screenQuestion,
  type CheckVerdict,
  type ExplainVerdict,
} from '../functions/_shared/questionScreen.ts';

interface Row {
  id: string;
  topic: string;
  level: number;
  age: number | null;
  status: string;
  text: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
}

/** Rows read from the bank per round. */
const PAGE = 120;

function fail(message: string): never {
  console.error(message);
  Deno.exit(1);
}

function option(name: string): string | undefined {
  const i = Deno.args.indexOf(`--${name}`);
  return i >= 0 ? Deno.args[i + 1] : undefined;
}
const has = (name: string) => Deno.args.includes(`--${name}`);
function wholeNumber(name: string, fallback: number): number {
  const raw = option(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) fail(`--${name} must be a whole number above 0`);
  return n;
}
function env(name: string): string {
  return Deno.env.get(name) ?? fail(`Set ${name} (see the top of this file).`);
}

const apply = has('apply');
const limit = wholeNumber('limit', Number.MAX_SAFE_INTEGER);
const topic = option('topic');
const defaultAge = wholeNumber('default-age', 9);
const batchSize = wholeNumber('batch', 15);
const parallel = wholeNumber('parallel', 4);
const statuses = has('include-approved') ? ['active', 'approved'] : ['active'];

const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});
const anthropic = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), timeout: 60_000, maxRetries: 3 });

const tokens = { input: 0, cached: 0, output: 0 };
function count(message: Anthropic.Message): Anthropic.Message {
  tokens.input += message.usage.input_tokens;
  tokens.cached += message.usage.cache_read_input_tokens ?? 0;
  tokens.output += message.usage.output_tokens;
  return message;
}

/** Why each question in a batch fails both checks' rules (none → it passed). */
async function checkBatch(age: number, rows: Row[]): Promise<Map<string, string>> {
  const questions = rows.map((r) => ({
    text: r.text,
    options: r.options,
    correctIndex: r.correct_index,
    explanation: r.explanation,
  }));
  // Questions saved with no explanation show none, so there's nothing to check.
  const explained = questions.filter((q) => (q.explanation ?? '').trim() !== '');
  const [check, explain] = await Promise.all([
    anthropic.messages
      .create({
        model: MODEL,
        max_tokens: CHECK_MAX_TOKENS,
        thinking: { type: 'adaptive' },
        system: [{ type: 'text', text: CHECK_PROMPT, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: CHECK_EFFORT, format: { type: 'json_schema', schema: CHECK_SCHEMA } },
        messages: [{ role: 'user', content: checkInput(age, questions) }],
      })
      .then(count),
    explained.length === 0
      ? null
      : anthropic.messages
          .create({
            model: MODEL,
            max_tokens: EXPLAIN_MAX_TOKENS,
            thinking: { type: 'adaptive' },
            system: [{ type: 'text', text: EXPLAIN_PROMPT, cache_control: { type: 'ephemeral' } }],
            output_config: { effort: EXPLAIN_EFFORT, format: { type: 'json_schema', schema: EXPLAIN_SCHEMA } },
            messages: [{ role: 'user', content: explainInput(age, explained) }],
          })
          .then(count),
  ]);
  const { verdicts } = replyJson<{ verdicts: CheckVerdict[] }>(check, 'The question check');
  const explainVerdicts = explain
    ? replyJson<{ verdicts: ExplainVerdict[] }>(explain, 'The explanation check').verdicts
    : [];
  if (!Array.isArray(verdicts) || verdicts.length !== rows.length) {
    throw new Error(`the question check gave ${verdicts?.length ?? 0} verdicts for ${rows.length} questions`);
  }
  if (!Array.isArray(explainVerdicts) || explainVerdicts.length !== explained.length) {
    throw new Error(`the explanation check gave ${explainVerdicts?.length ?? 0} verdicts for ${explained.length}`);
  }
  const explainOf = new Map(explained.map((q, i) => [q, explainVerdicts[i]]));

  const reasons = new Map<string, string>();
  rows.forEach((row, i) => {
    const v = verdicts[i];
    const e = explainOf.get(questions[i]);
    const problems: string[] = [];
    if (v.answer !== row.correct_index) {
      problems.push(`check picked "${row.options[v.answer]}", saved answer "${row.options[row.correct_index]}"`);
    }
    if (v.kidSafe !== true) problems.push(`check: ${v.problem || 'not kid-safe'}`);
    if (e && e.ok !== true) problems.push(`explanation: ${e.problem || 'not passed'}`);
    if (problems.length > 0) reasons.set(row.id, problems.join('; '));
  });
  return reasons;
}

/** The screen, then the two checks in batches (one age per call), `parallel` at a time. */
async function recheck(rows: Row[]): Promise<{ reasons: Map<string, string>; failedBatches: number }> {
  const reasons = new Map<string, string>();
  const byAge = new Map<number, Row[]>();
  for (const row of rows) {
    const why = screenQuestion({
      text: row.text,
      options: row.options,
      correctIndex: row.correct_index,
      explanation: row.explanation,
    });
    if (why) {
      reasons.set(row.id, `screen: ${why}`);
      continue;
    }
    const age = row.age ?? defaultAge;
    byAge.set(age, [...(byAge.get(age) ?? []), row]);
  }
  const batches: { age: number; rows: Row[] }[] = [];
  for (const [age, list] of byAge) {
    for (let i = 0; i < list.length; i += batchSize) batches.push({ age, rows: list.slice(i, i + batchSize) });
  }
  let failedBatches = 0;
  for (let i = 0; i < batches.length; i += parallel) {
    await Promise.all(
      batches.slice(i, i + parallel).map(async (batch) => {
        try {
          for (const [id, why] of await checkBatch(batch.age, batch.rows)) reasons.set(id, why);
        } catch (err) {
          failedBatches += 1;
          console.error(
            `couldn't check a batch of ${batch.rows.length} (left as they are):`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }),
    );
  }
  return { reasons, failedBatches };
}

// The review_note column comes with migration 0017.
{
  const { error } = await db.from('questions').select('review_note').limit(1);
  if (error) fail(`Can't read questions.review_note — is migration 0017 applied? (${error.message})`);
}

console.log(
  apply
    ? 'Holding back the questions that fail (--apply).'
    : 'Dry run: nothing changes. Run again with --apply to hold back what fails.',
);
const today = new Date().toISOString().slice(0, 10);
let lastId = '00000000-0000-0000-0000-000000000000';
let checked = 0;
let held = 0;
let failedBatches = 0;
while (checked < limit) {
  // Keyset paging by id: a question moved to review drops out of the filter
  // without shifting the pages after it.
  let query = db
    .from('questions')
    .select('id, topic, level, age, status, text, options, correct_index, explanation')
    .in('status', statuses)
    .gt('id', lastId)
    .order('id')
    .limit(Math.min(PAGE, limit - checked));
  if (!has('include-reviewed')) query = query.is('reviewed_at', null);
  if (topic) query = query.eq('topic', topic);
  const { data, error } = await query;
  if (error) fail(`Reading the bank failed: ${error.message}`);
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) break;
  lastId = rows[rows.length - 1].id;
  checked += rows.length;

  const result = await recheck(rows);
  failedBatches += result.failedBatches;
  for (const row of rows) {
    const why = result.reasons.get(row.id);
    if (!why) continue;
    held += 1;
    console.log(
      `HOLD ${row.id} [${row.topic} L${row.level}${row.age === null ? '' : `, age ${row.age}`}] ${why} — ` +
        JSON.stringify(row.text).slice(0, 140),
    );
    if (!apply) continue;
    // Only if nobody changed it meanwhile (the owner may be reviewing too).
    const { error: holdErr } = await db
      .from('questions')
      .update({ status: 'review', review_note: `${today} recheck: ${why}`.slice(0, 500) })
      .eq('id', row.id)
      .eq('status', row.status);
    if (holdErr) console.error(`couldn't hold back ${row.id}:`, holdErr.message);
  }
  console.log(`… ${checked} checked, ${held} ${apply ? 'held back' : 'would be held back'}`);
}

console.log(
  `\nDone: ${checked} checked, ${held} ${apply ? 'held back' : 'would be held back'}, ` +
    `${failedBatches} batch(es) not checked (rerun to retry). ` +
    `Claude tokens: ${tokens.input} in + ${tokens.cached} cached, ${tokens.output} out.`,
);
