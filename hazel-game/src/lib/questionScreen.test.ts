import { describe, it, expect } from 'vitest';
// ?raw: the files' TEXT, so the function's inline copy can be compared with
// the canonical one without resolving its Deno `npm:` imports.
import edgeFnSource from '../../supabase/functions/generate-questions/index.ts?raw';
import sharedSource from '../../supabase/functions/_shared/questionScreen.ts?raw';
import recheckSource from '../../supabase/scripts/recheck-questions.ts?raw';
// The question picker the function reads the bank through (0015, #134), as the
// review migration redefines it with the review rules (0016) and the age
// window adds a lower edge (0017, #147).
import reviewMigration from '../../supabase/migrations/0016_question_review.sql?raw';
import ageWindowMigration from '../../supabase/migrations/0017_question_age_window.sql?raw';
import checksMigration from '../../supabase/migrations/0018_question_checks.sql?raw';
import {
  CHECK_PROMPT,
  CHECK_SCHEMA,
  CONTENT_RULES,
  ESCALATION_MODEL,
  EXPLAIN_PROMPT,
  EXPLAIN_SCHEMA,
  HAIKU_CHECKER,
  MODEL,
  RULES_VERSION,
  checkInput,
  explainInput,
  replyJson,
  reportReview,
  runChecks,
  screenQuestion,
  type CallModel,
} from '../../supabase/functions/_shared/questionScreen';
import { TOPIC_PROMPTS } from '../../supabase/functions/_shared/topics';

const block = (src: string) => {
  const m = src.match(/\/\/ --- screen:start[^\n]*\n([\s\S]*?)\/\/ --- screen:end/);
  return m ? m[1] : null;
};

const ok = { text: 'What is 7 + 5?', options: ['12', '11', '13', '10'], correctIndex: 0, explanation: 'Count on 5 from 7.' };

describe('screening questions for kids (B10, #147)', () => {
  it("the edge function's inline copy is the canonical one, word for word (no drift)", () => {
    expect(block(sharedSource), 'markers missing in _shared/questionScreen.ts').not.toBeNull();
    expect(block(edgeFnSource), 'markers missing in generate-questions/index.ts').not.toBeNull();
    expect(block(edgeFnSource)).toBe(block(sharedSource));
  });

  it('writes and checks with Claude Haiku 5.5, escalates reports to Opus, leaving room for thinking (#147)', () => {
    expect(MODEL).toBe('claude-haiku-5-5');
    expect(ESCALATION_MODEL).toBe('claude-opus-5-5');
    expect(edgeFnSource).not.toMatch(/claude-haiku-4-5/);
    // Every call: adaptive thinking, the system prompt cached, an explicit effort;
    // the stronger model with the server-side refusal fallback. The function and
    // the recheck script call Claude the same way.
    for (const src of [edgeFnSource, recheckSource]) {
      expect(src).toMatch(/thinking: \{ type: 'adaptive' as const \}/);
      expect(src).toMatch(/system: \[\{ type: 'text' as const, text: req\.system, cache_control: \{ type: 'ephemeral' as const \} \}\]/);
      expect(src).toMatch(/output_config: \{ effort: req\.effort, format: \{ type: 'json_schema' as const, schema: req\.schema \} \}/);
      expect(src).toMatch(/req\.model === ESCALATION_MODEL\s*\?\s*await anthropic\.beta\.messages\.create\(\{[\s\S]*?betas: \['server-side-fallback-2026-07-01'\],\s*fallbacks: 'default',/);
      // No sampling parameters (Haiku 5.5 and Opus 5.5 refuse them) and no prefill.
      expect(src).not.toMatch(/temperature|top_p|top_k/);
    }
    expect(edgeFnSource).toMatch(/const WRITE_MAX_TOKENS = 16000;/);
    expect(edgeFnSource).toMatch(/label: 'question writer',\s*model: MODEL,\s*effort: WRITE_EFFORT,\s*maxTokens: WRITE_MAX_TOKENS,/);
  });

  it("the rules go into the writer's prompt and both checks'; every question is screened, saved ones too", () => {
    expect(edgeFnSource).toMatch(/const SYSTEM_PROMPT = `[\s\S]*\$\{CONTENT_RULES\}[\s\S]*Topics \(write only/);
    expect(CHECK_PROMPT).toContain(CONTENT_RULES);
    expect(EXPLAIN_PROMPT).toContain(CONTENT_RULES);
    // The checks' prompts are the same for every child (cached); the age is in the message.
    expect(CHECK_PROMPT).not.toMatch(/\d+-year-old|\d+ years old/);
    expect(checkInput(8, [ok])).toMatch(/^The child is 8 years old\.\n\n/);
    expect(explainInput(8, [ok])).toMatch(/^The child is 8 years old\.\n\n/);
    // Fresh questions, and rows read from the cache.
    expect(edgeFnSource).toMatch(/const why = screenQuestion\(q\)/);
    expect(edgeFnSource).toMatch(/const passes = \(r: CacheRow\) => screenQuestion\(rowToOut\(r\)\) === null/);
    expect(edgeFnSource).toMatch(/pool\.cached\.filter\(passes\)/);
    expect(edgeFnSource).toMatch(/pool\.seenFallback\.filter\(passes\)/);
    // The bank is read through the picker, which serves only active and
    // approved questions, approved first (behaviour: question_review.test.sql).
    expect(edgeFnSource).toMatch(/db\.rpc\('pick_cached_questions'/);
    expect(reviewMigration).toMatch(/and q\.status in \('active', 'approved'\)/);
    expect(ageWindowMigration).toMatch(/and q\.status in \('active', 'approved'\)/);
    expect(ageWindowMigration).toMatch(/\(q\.status <> 'approved'\),/);
    // The checks run unless switched off, and a failure keeps nothing fresh.
    expect(edgeFnSource).toMatch(/const checksOn = secondCheckOn\(\);/);
    expect(edgeFnSource).toMatch(/catch \(err\) \{\s*generated = \[\];/);
    // A family's own reports hide a question from that family, not from everyone.
    expect(ageWindowMigration).toMatch(/and fl\.profile_id in \(select id from family\)/);
  });

  it('new questions get both checks once, before they\'re saved, and are saved as checked (#147)', () => {
    expect(edgeFnSource).toMatch(/const problems = await runChecks\(call, HAIKU_CHECKER, age, questions\);/);
    expect(edgeFnSource).toMatch(/return questions\.filter\(\(q\) => !problems\.has\(q\)\);/);
    expect(edgeFnSource).toMatch(/if \(checksOn\) generated = await checkFresh\(call, age, generated\);/);
    expect(edgeFnSource).toMatch(/checked_version: RULES_VERSION, checked_at:/);
    // Only when the checks ran; without migration 0018 they're saved unmarked.
    expect(edgeFnSource).toMatch(/const marked = checksOn\s*\?/);
    expect(edgeFnSource).toMatch(/is migration 0018 applied\?\) — saving without it/);
    expect(RULES_VERSION).toBeGreaterThanOrEqual(1);
    expect(checksMigration).toMatch(/add column if not exists checked_version smallint/);
  });

  it('a report starts a check of that question: claimed once per report, under a daily cap (#147)', () => {
    expect(edgeFnSource).toMatch(/if \(body\.action === 'check-report'\) return await checkReport\(req, body, apiKey\);/);
    // The same sign-in and kid checks as a question request.
    expect(edgeFnSource).toMatch(/async function checkReport[\s\S]*?const who = await identifyKid\(req, body\.profileId\);/);
    expect(edgeFnSource).toMatch(/db\.rpc\('claim_report_check', \{\s*p_question: body\.questionId,\s*p_parent: callerId,\s*p_daily_cap: REPORT_CHECKS_PER_FAMILY_PER_DAY,/);
    expect(edgeFnSource).toMatch(/const verdict = await reportReview\(modelCaller\(newClaude\(apiKey\)\), age,/);
    // A problem holds the question back; nothing ever puts one back.
    expect(edgeFnSource).toMatch(/\.update\(verdict\.hold \? \{ status: 'review', review_note: note \} : \{ review_note: note \}\)/);
    expect(edgeFnSource).not.toMatch(/status: 'active'/);
  });

  it('the blind check and the explanation check: what each sees (#147)', () => {
    // The blind check never sees the answer or the explanation.
    const input = checkInput(9, [ok]);
    expect(input).not.toMatch(/correctIndex|explanation|Count on/);
    // The explanation check sees the right answer's text (the options get shuffled).
    expect(explainInput(9, [{ ...ok, correctIndex: 2 }])).toContain('"rightAnswer":"13"');
  });

  it('saved questions are reused within a year of the age they were written for, both ways (#147)', () => {
    expect(edgeFnSource).toMatch(/p_min_age: age - AGE_SLACK,\s*p_age: age,\s*p_level: level,/);
    expect(ageWindowMigration).toMatch(/and \(p_min_age is null or q\.age is null or q\.age >= p_min_age\)/);
    expect(ageWindowMigration).toMatch(/q\.age <= p_age or q\.level <= p_level\)/);
    // Before 0017 is applied, the picker is retried without the new arguments.
    expect(edgeFnSource).toMatch(/is migration 0017 applied\?[\s\S]*db\.rpc\('pick_cached_questions', pickArgs\)/);
  });

  it('the bank recheck checks each saved question once, and acts only with --apply (#147)', () => {
    expect(recheckSource).toMatch(/from '\.\.\/functions\/_shared\/questionScreen\.ts'/);
    for (const name of ['runChecks(call, HAIKU_CHECKER', 'reportReview(call', 'screenQuestion(']) {
      expect(recheckSource).toContain(name);
    }
    // Skips what's already checked under the current rules; marks what it checks.
    expect(recheckSource).toMatch(/\.or\(`checked_version\.is\.null,checked_version\.lt\.\$\{RULES_VERSION\}`\)/);
    expect(recheckSource).toMatch(/checked_version: RULES_VERSION,\s*checked_at: checkedAt,/);
    expect(recheckSource).toMatch(/const apply = has\('apply'\);/);
    expect(recheckSource).toMatch(/if \(!apply\) continue;\s*\/\/[^\n]*\n\s*const \{ error: saveErr \} = await db/);
    expect(recheckSource).toMatch(/\.eq\('status', row\.status\)/);
    // --reported claims each question the way the app's check does, so a report is checked once.
    expect(recheckSource).toMatch(/db\.rpc\('claim_report_check', \{\s*p_question: id,\s*p_parent: null,/);
  });

  it('the history and geography lines steer away from what the rules forbid', () => {
    expect(TOPIC_PROMPTS.history).toMatch(/never wars, battles, conquest, slavery, disasters or religion/);
    expect(TOPIC_PROMPTS.history).not.toMatch(/important people|world history/);
    expect(TOPIC_PROMPTS.geography).toMatch(/never disputed borders, territories or capitals, or how many countries there are/);
    expect(TOPIC_PROMPTS.creativity).toMatch(/facts only/);
  });

  it('passes a good question (and one saved without an explanation)', () => {
    expect(screenQuestion(ok)).toBeNull();
    expect(screenQuestion({ ...ok, explanation: null })).toBeNull();
    // Words that only look like blocked ones.
    expect(screenQuestion({ ...ok, text: 'Which animal is also called a killer whale?' })).toBeNull();
    expect(screenQuestion({ ...ok, text: 'What do you find inside a shell?' })).toBeNull();
    expect(screenQuestion({ ...ok, text: 'Is a grape a fruit?' })).toBeNull();
    expect(screenQuestion({ ...ok, text: 'Where is the Hoover Dam?' })).toBeNull();
  });

  it('passes letters that are the options themselves, and words that only look like pointing (#147)', () => {
    // A music question whose options are notes: "the answer is C" names an option.
    const notes = { text: 'Which note comes after B?', options: ['C', 'D', 'E', 'F'], correctIndex: 0, explanation: 'The answer is C!' };
    expect(screenQuestion(notes)).toBeNull();
    const letters = { text: 'Which letter does "apple" start with?', options: ['A', 'B', 'C', 'D'], correctIndex: 0, explanation: 'Apple starts with the letter A.' };
    expect(screenQuestion(letters)).toBeNull();
    expect(screenQuestion({ ...ok, explanation: 'Whales and dolphins: both of these animals are mammals.' })).toBeNull();
    expect(screenQuestion({ ...ok, text: 'Can you answer a riddle about 7 + 5?' })).toBeNull();
    expect(screenQuestion({ ...ok, explanation: 'Oranges are full of vitamin C, like plan B.' })).toBeNull();
  });

  it.each([
    [{ ...ok, text: '' }, 'no question text'],
    [{ ...ok, text: 'x'.repeat(221) }, 'question too long'],
    [{ ...ok, options: ['1', '2', '3'] }, 'not 4 options'],
    [{ ...ok, options: ['12', ' ', '13', '10'] }, 'an empty option'],
    [{ ...ok, options: ['12', 'y'.repeat(81), '13', '10'] }, 'an option too long'],
    [{ ...ok, options: ['12', '12 ', '13', '10'] }, 'two options the same'],
    [{ ...ok, options: ['Red', 'red', 'Blue', 'Green'] }, 'two options the same'],
    [{ ...ok, correctIndex: 4 }, 'no right answer'],
    [{ ...ok, correctIndex: 1.5 }, 'no right answer'],
    [{ ...ok, explanation: 'z'.repeat(281) }, 'explanation too long'],
    [{ ...ok, explanation: 'Learn more at www.example.com' }, 'a link, email or phone number'],
    [{ ...ok, text: 'Visit https://x.io to learn?' }, 'a link, email or phone number'],
    [{ ...ok, explanation: 'Write to us at hi@example.org' }, 'a link, email or phone number'],
    [{ ...ok, text: 'Call 555-123-4567 to answer?' }, 'a link, email or phone number'],
    [{ ...ok, text: 'Which war ended in 1918?' }, 'a word not for kids'],
    [{ ...ok, options: ['12', 'guns', '13', '10'] }, 'a word not for kids'],
    [{ ...ok, explanation: 'That was a stupid guess!' }, 'a word not for kids'],
    // Pointing at an option by its place (#147): the options get shuffled.
    [{ ...ok, options: ['12', '11', '13', 'All of the above'] }, 'points at an option by its place'],
    [{ ...ok, options: ['12', '11', '13', 'None of these.'] }, 'points at an option by its place'],
    [{ ...ok, options: ['12', '11', '13', 'Both A and B'] }, 'points at an option by its place'],
    [{ ...ok, options: ['B) 12', 'A) 11', 'C) 13', 'D) 10'] }, 'points at an option by its place'],
    [{ ...ok, explanation: 'The answer is B because 7 + 5 = 12.' }, 'points at an option by its place'],
    [{ ...ok, explanation: 'Option (A) is right.' }, 'points at an option by its place'],
    [{ ...ok, explanation: 'The first answer is the one!' }, 'points at an option by its place'],
  ])('drops %j (%s)', (q, why) => {
    expect(screenQuestion(q as never)).toBe(why);
  });

  /** A stand-in Claude: answers by the system prompt and model, recording every call. */
  function fakeClaude(answer: (req: Parameters<CallModel>[0]) => unknown) {
    const calls: Parameters<CallModel>[0][] = [];
    const call: CallModel = async (req) => {
      calls.push(req);
      const out = answer(req);
      if (out instanceof Error) throw out;
      return { stop_reason: 'end_turn', content: [{ type: 'thinking' }, { type: 'text', text: JSON.stringify(out) }] };
    };
    return { call, calls };
  }
  const isBlind = (req: Parameters<CallModel>[0]) => req.system === CHECK_PROMPT;

  it('runChecks: the blind check must pick the saved answer and call it kid-safe, the explanation must pass (#147)', async () => {
    const qs = [
      { ...ok }, // passes both
      { ...ok, text: 'Q2' }, // the check picks another answer
      { ...ok, text: 'Q3' }, // not for kids
      { ...ok, text: 'Q4' }, // unkind explanation
      { ...ok, text: 'Q5', explanation: null }, // no explanation: blind check only
    ];
    const { call, calls } = fakeClaude((req) =>
      isBlind(req)
        ? {
            verdicts: [
              { answer: 0, kidSafe: true, problem: '' },
              { answer: 1, kidSafe: true, problem: '' },
              { answer: 0, kidSafe: false, problem: 'scary' },
              { answer: 0, kidSafe: true, problem: '' },
              { answer: 0, kidSafe: true, problem: '' },
            ],
          }
        : { verdicts: [{ ok: true, problem: '' }, { ok: true, problem: '' }, { ok: true, problem: '' }, { ok: false, problem: 'unkind' }] },
    );
    const problems = await runChecks(call, HAIKU_CHECKER, 9, qs);
    expect([...problems.keys()].map((q) => q.text)).toEqual(['Q2', 'Q3', 'Q4']);
    expect(problems.get(qs[1])).toBe('check picked "11", the saved answer is "12"');
    expect(problems.get(qs[2])).toBe('check: scary');
    expect(problems.get(qs[3])).toBe('explanation: unkind');
    // Side by side, Haiku's settings; the explanation check gets the four with explanations.
    expect(calls.map((c) => [c.model, c.effort, c.maxTokens])).toEqual([
      [MODEL, 'medium', 8000],
      [MODEL, 'low', 4000],
    ]);
    expect((calls[1].input.match(/"number"/g) ?? []).length).toBe(4);
  });

  it("runChecks throws when a reply doesn't line up, or a call fails — nothing is kept then (#147)", async () => {
    const short = fakeClaude((req) => (isBlind(req) ? { verdicts: [] } : { verdicts: [{ ok: true }] }));
    await expect(runChecks(short.call, HAIKU_CHECKER, 9, [ok])).rejects.toThrow('gave 0 verdicts for 1');
    const down = fakeClaude(() => new Error('529 overloaded'));
    await expect(runChecks(down.call, HAIKU_CHECKER, 9, [ok])).rejects.toThrow('529');
    expect(await runChecks(down.call, HAIKU_CHECKER, 9, [])).toEqual(new Map());
  });

  /** Haiku's and Opus's verdicts for one question: true = passes. */
  function verdictsBy(haiku: boolean | Error, opus: boolean | Error) {
    return fakeClaude((req) => {
      const pass = req.model === MODEL ? haiku : opus;
      if (pass instanceof Error) return pass;
      return isBlind(req)
        ? { verdicts: [{ answer: 0, kidSafe: pass, problem: pass ? '' : 'two answers fit' }] }
        : { verdicts: [{ ok: true, problem: '' }] };
    });
  }

  it('reportReview: Haiku finds a problem → held back, and Opus is never asked (#147)', async () => {
    const { call, calls } = verdictsBy(false, true);
    expect(await reportReview(call, 9, ok)).toEqual({ hold: true, note: 'report check (Haiku): check: two answers fit' });
    expect(calls.every((c) => c.model === MODEL)).toBe(true);
  });

  it('reportReview: Haiku finds nothing → Opus decides, at higher effort (#147)', async () => {
    const held = verdictsBy(true, false);
    expect(await reportReview(held.call, 9, ok)).toEqual({
      hold: true,
      note: 'report check (Opus, after Haiku passed it): check: two answers fit',
    });
    expect(held.calls.filter((c) => c.model === ESCALATION_MODEL).map((c) => c.effort)).toEqual(['high', 'medium']);
    const kept = verdictsBy(true, true);
    expect(await reportReview(kept.call, 9, ok)).toEqual({
      hold: false,
      note: 'report check: Haiku and Opus found no problem',
    });
  });

  it("reportReview: a check that can't run holds the question back (#147)", async () => {
    expect((await reportReview(verdictsBy(new Error('timeout'), true).call, 9, ok)).hold).toBe(true);
    const opusDown = await reportReview(verdictsBy(true, new Error('stopped early (stop_reason: refusal, bio)')).call, 9, ok);
    expect(opusDown).toEqual({
      hold: true,
      note: "report check: Haiku passed it; Opus couldn't check it (stopped early (stop_reason: refusal, bio))",
    });
  });

  it('the checks reply one verdict per question, with what is wrong', () => {
    const item = CHECK_SCHEMA.properties.verdicts.items;
    expect(item.required).toEqual(['answer', 'kidSafe', 'problem']);
    expect(item.properties.answer.enum).toEqual([0, 1, 2, 3]);
    expect(EXPLAIN_SCHEMA.properties.verdicts.items.required).toEqual(['ok', 'problem']);
  });

  it('replyJson reads the text block after any thinking, and throws on a cut-off or refused reply (#147)', () => {
    const thinking = { type: 'thinking', thinking: '' };
    expect(
      replyJson<{ n: number }>({ stop_reason: 'end_turn', content: [thinking, { type: 'text', text: '{"n":3}' }] }, 'X'),
    ).toEqual({ n: 3 });
    expect(() => replyJson({ stop_reason: 'max_tokens', content: [thinking] }, 'The writer')).toThrow(
      'The writer stopped early (stop_reason: max_tokens)',
    );
    expect(() =>
      replyJson({ stop_reason: 'refusal', stop_details: { category: 'general_harms' }, content: [] }, 'The check'),
    ).toThrow('stop_reason: refusal, general_harms');
    expect(() => replyJson({ stop_reason: 'end_turn', content: [thinking] }, 'The check')).toThrow(
      'No content returned from The check',
    );
  });
});
