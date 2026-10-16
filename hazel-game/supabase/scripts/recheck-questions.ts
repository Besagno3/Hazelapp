// Checks the saved question bank against today's rules, once (#147).
// ----------------------------------------------------------------------------
// The bank is reused for every child, and most questions a kid sees come from
// it. Questions saved before the rules (#133, #147) only ever passed the word
// filter. This runs each one through the checks a new question gets — the
// screen, the blind check and the explanation check, the same prompts as the
// question service (`_shared/questionScreen.ts`) — once: a question that
// passes is marked checked under RULES_VERSION (`checked_version`, migration
// 0018) and skipped next time, like every new question (marked when it's
// saved). One that fails is held back: status 'review', the reason in
// `review_note`. The owner finds them in `select * from question_review_queue`
// and decides with `select review_question(id, 'approved' | 'retired' | 'active')`.
//
// `--reported` instead checks questions families reported that the question
// service didn't get to (the app closed first, a family over its daily cap, a
// check that failed): Claude Haiku, then the stronger model if Haiku finds
// nothing — the same `reportReview` the app's report starts.
//
// Run it from hazel-game/ with the project's service-role key (never ship
// that key anywhere else) and an Anthropic key. A dry run first — it prints
// what it would do and changes nothing:
//
//   SUPABASE_URL=https://….supabase.co SUPABASE_SERVICE_ROLE_KEY=… ANTHROPIC_API_KEY=… \
//     deno run --allow-env --allow-net supabase/scripts/recheck-questions.ts
//
// then the same with --apply. Options:
//   --apply              hold back what fails and mark what passes (default: dry run)
//   --reported           check reported questions instead of the unchecked bank
//   --limit N            stop after N questions (default: all)
//   --topic T            only this topic (not with --reported)
//   --include-approved   also check questions the owner approved
//   --include-reviewed   also check questions the owner already reviewed
//   --default-age N      age to check questions saved without one (default 9)
//   --batch N            questions per check call (default 15)
//   --parallel N         check calls at a time (default 4)
//
// Needs migrations 0017 and 0018. Two Claude calls per batch; a batch whose
// check fails is left as it is (unmarked) and counted, so a rerun picks it up.
// ----------------------------------------------------------------------------

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js';
import {
  ESCALATION_MODEL,
  HAIKU_CHECKER,
  RULES_VERSION,
  reportReview,
  runChecks,
  screenQuestion,
  type CallModel,
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
const COLUMNS = 'id, topic, level, age, status, text, options, correct_index, explanation';

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
/** As the question service calls Claude (`modelCaller` there), counting tokens instead of logging each call. */
const call: CallModel = async (req) => {
  const params = {
    model: req.model,
    max_tokens: req.maxTokens,
    thinking: { type: 'adaptive' as const },
    system: [{ type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } }],
    output_config: { effort: req.effort, format: { type: 'json_schema' as const, schema: req.schema } },
    messages: [{ role: 'user' as const, content: req.input }],
  };
  const message =
    req.model === ESCALATION_MODEL
      ? await anthropic.beta.messages.create({
          ...params,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        })
      : await anthropic.messages.create(params);
  tokens.input += message.usage.input_tokens;
  tokens.cached += message.usage.cache_read_input_tokens ?? 0;
  tokens.output += message.usage.output_tokens;
  return message;
};

const asQuestion = (row: Row) => ({
  text: row.text,
  options: row.options,
  correctIndex: row.correct_index,
  explanation: row.explanation,
});
const today = new Date().toISOString().slice(0, 10);
const describe = (row: Row) =>
  `${row.id} [${row.topic} L${row.level}${row.age === null ? '' : `, age ${row.age}`}]`;

/**
 * The screen, then Haiku's two checks in batches (one age per call), `parallel`
 * at a time. Returns why each failing row failed, and the ids of rows in
 * batches that couldn't be checked (they stay unmarked).
 */
async function checkRows(rows: Row[]): Promise<{ reasons: Map<string, string>; unchecked: Set<string> }> {
  const reasons = new Map<string, string>();
  const unchecked = new Set<string>();
  const byAge = new Map<number, Row[]>();
  for (const row of rows) {
    const why = screenQuestion(asQuestion(row));
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
  for (let i = 0; i < batches.length; i += parallel) {
    await Promise.all(
      batches.slice(i, i + parallel).map(async (batch) => {
        const questions = batch.rows.map(asQuestion);
        try {
          const problems = await runChecks(call, HAIKU_CHECKER, batch.age, questions);
          questions.forEach((q, k) => {
            const why = problems.get(q);
            if (why) reasons.set(batch.rows[k].id, why);
          });
        } catch (err) {
          for (const row of batch.rows) unchecked.add(row.id);
          console.error(
            `couldn't check a batch of ${batch.rows.length} (left unmarked):`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }),
    );
  }
  return { reasons, unchecked };
}

/** The unchecked bank: every active question not checked under RULES_VERSION, once. */
async function checkBank(): Promise<string> {
  let lastId = '00000000-0000-0000-0000-000000000000';
  let seen = 0;
  let held = 0;
  let passed = 0;
  let unchecked = 0;
  while (seen < limit) {
    // Keyset paging by id: a row held back or marked drops out of the filter
    // without shifting the pages after it.
    let query = db
      .from('questions')
      .select(COLUMNS)
      .in('status', statuses)
      .or(`checked_version.is.null,checked_version.lt.${RULES_VERSION}`)
      .gt('id', lastId)
      .order('id')
      .limit(Math.min(PAGE, limit - seen));
    if (!has('include-reviewed')) query = query.is('reviewed_at', null);
    if (topic) query = query.eq('topic', topic);
    const { data, error } = await query;
    if (error) fail(`Reading the bank failed: ${error.message}`);
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;
    seen += rows.length;

    const result = await checkRows(rows);
    unchecked += result.unchecked.size;
    const checkedAt = new Date().toISOString();
    for (const row of rows) {
      if (result.unchecked.has(row.id)) continue;
      const why = result.reasons.get(row.id);
      if (why) {
        held += 1;
        console.log(`HOLD ${describe(row)} ${why} — ${JSON.stringify(row.text).slice(0, 140)}`);
      } else {
        passed += 1;
      }
      if (!apply) continue;
      // Only if nobody changed it meanwhile (the owner may be reviewing too).
      const { error: saveErr } = await db
        .from('questions')
        .update({
          checked_version: RULES_VERSION,
          checked_at: checkedAt,
          ...(why ? { status: 'review', review_note: `${today} recheck: ${why}`.slice(0, 500) } : {}),
        })
        .eq('id', row.id)
        .eq('status', row.status);
      if (saveErr) console.error(`couldn't save ${row.id}:`, saveErr.message);
    }
    console.log(`… ${seen} read, ${passed} passed, ${held} ${apply ? 'held back' : 'would be held back'}`);
  }
  return (
    `${seen} read: ${passed} passed${apply ? ' (marked checked)' : ''}, ` +
    `${held} ${apply ? 'held back' : 'would be held back'}, ${unchecked} not checked (rerun to retry)`
  );
}

/** Reported questions no check has covered yet: Haiku, then the stronger model. */
async function checkReported(): Promise<string> {
  const { data, error } = await db.rpc('pending_report_checks', { p_limit: Math.min(limit, 10_000) });
  if (error) fail(`Listing reported questions failed (is migration 0018 applied?): ${error.message}`);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  let held = 0;
  for (const id of ids) {
    let row: Row | null;
    if (apply) {
      // Claimed like the app's check, so the two never check the same report twice.
      const { data: claimed, error: claimErr } = await db.rpc('claim_report_check', {
        p_question: id,
        p_parent: null,
        p_daily_cap: 0,
      });
      if (claimErr) fail(`Claiming ${id} failed: ${claimErr.message}`);
      const first = (Array.isArray(claimed) ? claimed[0] : claimed) as Omit<Row, 'topic' | 'level' | 'status'> | null;
      if (!first) continue; // checked meanwhile
      row = { ...first, topic: '?', level: 0, status: '?' };
    } else {
      const { data: found } = await db.from('questions').select(COLUMNS).eq('id', id).maybeSingle();
      row = found as Row | null;
      if (!row) continue;
    }
    const verdict = await reportReview(call, row.age ?? defaultAge, asQuestion(row));
    if (verdict.hold) held += 1;
    console.log(`${verdict.hold ? 'HOLD' : 'KEEP'} ${row.id} ${verdict.note} — ${JSON.stringify(row.text).slice(0, 140)}`);
    if (!apply) continue;
    const note = `${today} ${verdict.note}`.slice(0, 500);
    const { error: saveErr } = await db
      .from('questions')
      .update(verdict.hold ? { status: 'review', review_note: note } : { review_note: note })
      .eq('id', row.id)
      .neq('status', 'retired');
    if (saveErr) console.error(`couldn't save ${row.id}:`, saveErr.message);
  }
  return `${ids.length} reported question(s) waiting: ${held} ${apply ? 'held back' : 'would be held back'}`;
}

// Both columns come with migrations 0017 and 0018.
{
  const { error } = await db.from('questions').select('review_note, checked_version').limit(1);
  if (error) fail(`Can't read the new columns — are migrations 0017 and 0018 applied? (${error.message})`);
}
console.log(
  apply ? 'Applying (--apply).' : 'Dry run: nothing changes. Run again with --apply to act on what it finds.',
);
const summary = has('reported') ? await checkReported() : await checkBank();
console.log(
  `\nDone: ${summary}. Claude tokens: ${tokens.input} in + ${tokens.cached} cached, ${tokens.output} out.`,
);
