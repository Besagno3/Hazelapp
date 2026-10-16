import { describe, it, expect } from 'vitest';
// ?raw: the files' TEXT, so the function's inline copy can be compared with
// the canonical one without resolving its Deno `npm:` imports.
import edgeFnSource from '../../supabase/functions/generate-questions/index.ts?raw';
import sharedSource from '../../supabase/functions/_shared/questionScreen.ts?raw';
import recheckSource from '../../supabase/scripts/recheck-questions.ts?raw';
// The question picker the function reads the bank through (0015, #134), as the
// review migration redefines it with the review rules (0016) and the age
// window adds a lower edge (0017, #146).
import reviewMigration from '../../supabase/migrations/0016_question_review.sql?raw';
import ageWindowMigration from '../../supabase/migrations/0017_question_age_window.sql?raw';
import {
  CHECK_PROMPT,
  CHECK_SCHEMA,
  CONTENT_RULES,
  EXPLAIN_PROMPT,
  EXPLAIN_SCHEMA,
  MODEL,
  checkInput,
  explainInput,
  keepChecked,
  keepExplained,
  replyJson,
  screenQuestion,
} from '../../supabase/functions/_shared/questionScreen';
import { TOPIC_PROMPTS } from '../../supabase/functions/_shared/topics';

const block = (src: string) => {
  const m = src.match(/\/\/ --- screen:start[^\n]*\n([\s\S]*?)\/\/ --- screen:end/);
  return m ? m[1] : null;
};

const ok = { text: 'What is 7 + 5?', options: ['12', '11', '13', '10'], correctIndex: 0, explanation: 'Count on 5 from 7.' };

describe('screening questions for kids (B10, #146)', () => {
  it("the edge function's inline copy is the canonical one, word for word (no drift)", () => {
    expect(block(sharedSource), 'markers missing in _shared/questionScreen.ts').not.toBeNull();
    expect(block(edgeFnSource), 'markers missing in generate-questions/index.ts').not.toBeNull();
    expect(block(edgeFnSource)).toBe(block(sharedSource));
  });

  it('writes and checks with Claude Haiku 5.5, leaving room for its thinking (#146)', () => {
    expect(MODEL).toBe('claude-haiku-5-5');
    expect(edgeFnSource).not.toMatch(/claude-haiku-4-5/);
    // The writer: adaptive thinking, an explicit effort, room for thinking + questions.
    expect(edgeFnSource).toMatch(/max_tokens: WRITE_MAX_TOKENS,\s*\/\/[^\n]*\n[^\n]*\n\s*thinking: \{ type: 'adaptive' \}/);
    expect(edgeFnSource).toMatch(/const WRITE_MAX_TOKENS = 16000;/);
    expect(edgeFnSource).toMatch(/output_config: \{ effort: WRITE_EFFORT, format:/);
    // No sampling parameters (Haiku 5.5 refuses them) and no prefill.
    expect(edgeFnSource).not.toMatch(/temperature|top_p|top_k/);
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
    expect(edgeFnSource).toMatch(/if \(secondCheckOn\(\)\) generated = await checkFresh\(/);
    expect(edgeFnSource).toMatch(/catch \(err\) \{\s*generated = \[\];/);
    // A family's own reports hide a question from that family, not from everyone.
    expect(ageWindowMigration).toMatch(/and fl\.profile_id in \(select id from family\)/);
  });

  it('the blind check and the explanation check run side by side, cached, and both must pass (#146)', () => {
    expect(edgeFnSource).toMatch(/const \[check, explain\] = await Promise\.all\(\[/);
    expect(edgeFnSource).toMatch(/system: \[\{ type: 'text', text: CHECK_PROMPT, cache_control: \{ type: 'ephemeral' \} \}\]/);
    expect(edgeFnSource).toMatch(/system: \[\{ type: 'text', text: EXPLAIN_PROMPT, cache_control: \{ type: 'ephemeral' \} \}\]/);
    expect(edgeFnSource).toMatch(/questions\.filter\(\(q\) => checked\.has\(q\) && explainedOk\.has\(q\)\)/);
    // The blind check never sees the answer or the explanation.
    const input = checkInput(9, [ok]);
    expect(input).not.toMatch(/correctIndex|explanation|Count on/);
    // The explanation check sees the right answer's text (the options get shuffled).
    expect(explainInput(9, [{ ...ok, correctIndex: 2 }])).toContain('"rightAnswer":"13"');
  });

  it('saved questions are reused within a year of the age they were written for, both ways (#146)', () => {
    expect(edgeFnSource).toMatch(/p_min_age: age - AGE_SLACK,\s*p_age: age,\s*p_level: level,/);
    expect(ageWindowMigration).toMatch(/and \(p_min_age is null or q\.age is null or q\.age >= p_min_age\)/);
    expect(ageWindowMigration).toMatch(/q\.age <= p_age or q\.level <= p_level\)/);
    // Before 0017 is applied, the picker is retried without the new arguments.
    expect(edgeFnSource).toMatch(/is migration 0017 applied\?[\s\S]*db\.rpc\('pick_cached_questions', pickArgs\)/);
  });

  it('the bank recheck uses the same prompts and holds back only with --apply (#146)', () => {
    expect(recheckSource).toMatch(/from '\.\.\/functions\/_shared\/questionScreen\.ts'/);
    for (const name of ['CHECK_PROMPT', 'EXPLAIN_PROMPT', 'screenQuestion', 'replyJson', 'MODEL']) {
      expect(recheckSource).toContain(name);
    }
    expect(recheckSource).toMatch(/const apply = has\('apply'\);/);
    expect(recheckSource).toMatch(/if \(!apply\) continue;\s*\/\/[^\n]*\n\s*const \{ error: holdErr \} = await db\s*\.from\('questions'\)\s*\.update\(\{ status: 'review', review_note:/);
    expect(recheckSource).toMatch(/\.eq\('status', row\.status\)/);
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

  it('passes letters that are the options themselves, and words that only look like pointing (#146)', () => {
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
    // Pointing at an option by its place (#146): the options get shuffled.
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

  it('keepChecked keeps only what the blind check agrees with — and nothing when the reply doesn\'t line up', () => {
    const qs = [
      { id: 'a', correctIndex: 0 },
      { id: 'b', correctIndex: 2 },
      { id: 'c', correctIndex: 1 },
    ];
    const kept = keepChecked(qs, [
      { answer: 0, kidSafe: true, problem: '' },
      { answer: 1, kidSafe: true, problem: '' }, // disagrees
      { answer: 1, kidSafe: false, problem: 'scary' }, // not for kids
    ]);
    expect(kept.map((q) => q.id)).toEqual(['a']);
    expect(keepChecked(qs, [{ answer: 0, kidSafe: true }])).toEqual([]);
    expect(keepChecked(qs, null)).toEqual([]);
    expect(keepChecked([], [])).toEqual([]);
  });

  it('keepExplained keeps only explanations that passed — and nothing when the reply doesn\'t line up (#146)', () => {
    const qs = ['a', 'b', 'c'];
    expect(keepExplained(qs, [{ ok: true }, { ok: false, problem: 'unkind' }, { ok: true }])).toEqual(['a', 'c']);
    expect(keepExplained(qs, [{ ok: true }])).toEqual([]);
    expect(keepExplained(qs, undefined)).toEqual([]);
  });

  it('the checks reply one verdict per question, with what is wrong', () => {
    const item = CHECK_SCHEMA.properties.verdicts.items;
    expect(item.required).toEqual(['answer', 'kidSafe', 'problem']);
    expect(item.properties.answer.enum).toEqual([0, 1, 2, 3]);
    expect(EXPLAIN_SCHEMA.properties.verdicts.items.required).toEqual(['ok', 'problem']);
  });

  it('replyJson reads the text block after any thinking, and throws on a cut-off or refused reply (#146)', () => {
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
