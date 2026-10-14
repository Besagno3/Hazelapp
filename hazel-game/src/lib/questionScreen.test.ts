import { describe, it, expect } from 'vitest';
// ?raw: the files' TEXT, so the function's inline copy can be compared with
// the canonical one without resolving its Deno `npm:` imports.
import edgeFnSource from '../../supabase/functions/generate-questions/index.ts?raw';
import sharedSource from '../../supabase/functions/_shared/questionScreen.ts?raw';
// The question picker the function reads the bank through (0015, #134), as the
// review migration redefines it with the review rules (0016).
import reviewMigration from '../../supabase/migrations/0016_question_review.sql?raw';
import {
  CHECK_SCHEMA,
  CONTENT_RULES,
  checkPrompt,
  keepChecked,
  screenQuestion,
} from '../../supabase/functions/_shared/questionScreen';
import { TOPIC_PROMPTS } from '../../supabase/functions/_shared/topics';

const block = (src: string) => {
  const m = src.match(/\/\/ --- screen:start[^\n]*\n([\s\S]*?)\/\/ --- screen:end/);
  return m ? m[1] : null;
};

const ok = { text: 'What is 7 + 5?', options: ['12', '11', '13', '10'], correctIndex: 0, explanation: 'Count on 5 from 7.' };

describe('screening questions for kids (B10)', () => {
  it("the edge function's inline copy is the canonical one, word for word (no drift)", () => {
    expect(block(sharedSource), 'markers missing in _shared/questionScreen.ts').not.toBeNull();
    expect(block(edgeFnSource), 'markers missing in generate-questions/index.ts').not.toBeNull();
    expect(block(edgeFnSource)).toBe(block(sharedSource));
  });

  it('the rules go into the writer\'s prompt and the check\'s; every question is screened, saved ones too', () => {
    expect(edgeFnSource).toMatch(/const SYSTEM_PROMPT = `[\s\S]*\$\{CONTENT_RULES\}[\s\S]*Topics:/);
    expect(checkPrompt(8)).toContain(CONTENT_RULES);
    expect(checkPrompt(8)).toContain('8-year-old');
    // Fresh questions, and rows read from the cache.
    expect(edgeFnSource).toMatch(/const why = screenQuestion\(q\)/);
    expect(edgeFnSource).toMatch(/const passes = \(r: CacheRow\) => screenQuestion\(rowToOut\(r\)\) === null/);
    expect(edgeFnSource).toMatch(/pool\.cached\.filter\(passes\)/);
    expect(edgeFnSource).toMatch(/pool\.seenFallback\.filter\(passes\)/);
    // The bank is read through the picker, which serves only active and
    // approved questions, approved first (behaviour: question_review.test.sql).
    expect(edgeFnSource).toMatch(/db\.rpc\('pick_cached_questions'/);
    expect(reviewMigration).toMatch(/create or replace function public\.pick_cached_questions\(/);
    expect(reviewMigration).toMatch(/and q\.status in \('active', 'approved'\)/);
    expect(reviewMigration).toMatch(/\(q\.status <> 'approved'\),/);
    // The second check runs unless switched off, and a failure keeps nothing fresh.
    expect(edgeFnSource).toMatch(/if \(secondCheckOn\(\)\) generated = await checkFresh\(/);
    expect(edgeFnSource).toMatch(/catch \(err\) \{\s*generated = \[\];/);
    // A family's own reports hide a question from that family, not from everyone.
    expect(reviewMigration).toMatch(/and fl\.profile_id in \(select id from family\)/);
  });

  it('the history and creativity lines steer away from what the rules forbid', () => {
    expect(TOPIC_PROMPTS.history).toMatch(/never wars, battles, disasters or religion/);
    expect(TOPIC_PROMPTS.history).not.toMatch(/important people|world history/);
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
      { answer: 0, kidSafe: true },
      { answer: 1, kidSafe: true }, // disagrees
      { answer: 1, kidSafe: false }, // not for kids
    ]);
    expect(kept.map((q) => q.id)).toEqual(['a']);
    expect(keepChecked(qs, [{ answer: 0, kidSafe: true }])).toEqual([]);
    expect(keepChecked(qs, null)).toEqual([]);
    expect(keepChecked([], [])).toEqual([]);
  });

  it("the check's reply is one verdict per question: an answer 0-3 and kidSafe", () => {
    const item = CHECK_SCHEMA.properties.verdicts.items;
    expect(item.required).toEqual(['answer', 'kidSafe']);
    expect(item.properties.answer.enum).toEqual([0, 1, 2, 3]);
  });
});
