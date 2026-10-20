import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FunctionsHttpError } from '@supabase/supabase-js';

// Mocked supabase client — replaces the real module (which would throw at
// import time without VITE_SUPABASE_URL / _ANON_KEY set). vi.hoisted lifts
// the mock fns above the vi.mock factory so the factory can reference them.
const { insertMock, fromMock, invokeMock } = vi.hoisted(() => {
  const insertMock = vi.fn();
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  const invokeMock = vi.fn();
  return { insertMock, fromMock, invokeMock };
});

vi.mock('./supabase', () => ({
  supabase: {
    from: fromMock,
    functions: { invoke: invokeMock },
  },
}));

// Import AFTER the mock is registered.
import {
  BATTLE_QUESTION_COUNT,
  HELD_FOR_MS,
  QUIZ_QUESTION_COUNT,
  askFreshForNextRound,
  carriedCount,
  carryOver,
  clearCarried,
  fetchQuestions,
  flagQuestion,
  inQuestionBank,
  moreQuestions,
  nextRoundQuestion,
  prefetchQuestions,
  quickQuestions,
  shuffleAnswers,
  spareStarter,
  takeCarried,
  warmNextRound,
  withSpareStarters,
} from './questions';
import type { Question } from '../types';
import { useFamilyStore } from '../store/familyStore';

beforeEach(() => {
  insertMock.mockReset();
  fromMock.mockClear();
  invokeMock.mockReset();
  useFamilyStore.setState({ activeKidId: 'kid-1' });
  clearCarried();
});

describe('flagQuestion', () => {
  it('inserts a flag row as the kid playing, with the chosen reason (#124)', async () => {
    insertMock.mockResolvedValue({ error: null });

    await flagQuestion('q-123', 'wrong_answer');

    expect(fromMock).toHaveBeenCalledWith('question_flags');
    expect(insertMock).toHaveBeenCalledWith({
      question_id: 'q-123',
      profile_id: 'kid-1',
      reason: 'wrong_answer',
    });
  });

  it('asks the question service to check the reported question, without waiting for it (#147)', async () => {
    insertMock.mockResolvedValue({ error: null });
    let finishCheck: (v: unknown) => void = () => {};
    invokeMock.mockReturnValue(new Promise((resolve) => (finishCheck = resolve)));

    // Resolves while the check is still running.
    await flagQuestion('q-123', 'not_for_kids');

    expect(invokeMock).toHaveBeenCalledWith('generate-questions', {
      body: { action: 'check-report', questionId: 'q-123', profileId: 'kid-1' },
    });
    finishCheck({ data: { checked: true }, error: null });
  });

  it('a check that fails to start never fails the report (#147)', async () => {
    insertMock.mockResolvedValue({ error: null });
    invokeMock.mockRejectedValue(new Error('network down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(flagQuestion('q-9', 'confusing')).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalledWith('report check not started:', expect.stringContaining('network down'));
    warn.mockRestore();
  });

  it('no check is asked for when the report itself fails (#147)', async () => {
    insertMock.mockResolvedValue({ error: { message: 'permission denied', code: '42501' } });
    await expect(flagQuestion('q-1', 'difficulty')).rejects.toThrow();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('passes null for reason when none is provided', async () => {
    insertMock.mockResolvedValue({ error: null });

    await flagQuestion('q-7');

    expect(insertMock).toHaveBeenCalledWith({
      question_id: 'q-7',
      profile_id: 'kid-1',
      reason: null,
    });
  });

  it('is a no-op for synthetic fresh- IDs (FK would fail anyway)', async () => {
    await flagQuestion('fresh-123-0', 'wrong_answer');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('is a no-op for starter questions, which aren’t in the bank (B5)', async () => {
    await flagQuestion('starter-math-easy-1', 'confusing');
    expect(insertMock).not.toHaveBeenCalled();
    expect(inQuestionBank('starter-math-easy-1')).toBe(false);
    expect(inQuestionBank('fresh-1-0')).toBe(false);
    expect(inQuestionBank('8f3c2a5e-0000-4000-8000-000000000001')).toBe(true);
  });

  it('throws "sign in" when no kid is playing', async () => {
    useFamilyStore.setState({ activeKidId: null });
    await expect(flagQuestion('q-1', 'confusing')).rejects.toThrow(/sign in/i);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('wraps the underlying DB error in a flag-context message', async () => {
    insertMock.mockResolvedValue({
      error: { message: 'permission denied for table question_flags', code: '42501' },
    });
    await expect(flagQuestion('q-1', 'difficulty')).rejects.toThrow(/permission denied/);
  });
});

/** A seeded random source (mulberry32), so the spread test can't flake. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('shuffleAnswers', () => {
  const q = { options: ['3', '4', '5', '6'], correctIndex: 1 };

  it('keeps the right answer right and every option once', () => {
    const random = seeded(1);
    for (let n = 0; n < 50; n++) {
      const s = shuffleAnswers(q, random);
      expect(s.options[s.correctIndex]).toBe('4');
      expect([...s.options].sort()).toEqual(['3', '4', '5', '6']);
    }
  });

  it('puts the right answer in every position about equally (no more "always B")', () => {
    const random = seeded(42);
    const counts = [0, 0, 0, 0];
    for (let n = 0; n < 400; n++) counts[shuffleAnswers(q, random).correctIndex]++;
    // 100 each on average; a fair shuffle lands well inside this band.
    for (const c of counts) expect(c).toBeGreaterThan(70);
    for (const c of counts) expect(c).toBeLessThan(130);
  });

  it('leaves the input untouched and keeps the other fields', () => {
    const input = { id: 'q-1', text: '2 + 2?', options: ['3', '4', '5', '6'], correctIndex: 1 };
    const s = shuffleAnswers(input, () => 0);
    expect(input.options).toEqual(['3', '4', '5', '6']);
    expect(input.correctIndex).toBe(1);
    expect(s.id).toBe('q-1');
    expect(s.text).toBe('2 + 2?');
  });

  it('leaves a question with a broken correctIndex as it is', () => {
    const bad = { options: ['a', 'b', 'c', 'd'], correctIndex: 7 };
    expect(shuffleAnswers(bad, () => 0)).toBe(bad);
  });
});

describe('fetchQuestions', () => {
  it('shuffles the answers of every question it returns', async () => {
    const api = Array.from({ length: 40 }, (_, i) => ({
      id: `q-${i}`,
      level: 3,
      text: `Question ${i}`,
      options: ['wrong 1', 'right', 'wrong 2', 'wrong 3'],
      correctIndex: 1, // the model's favourite spot
      explanation: '',
      timesAsked: 0,
    }));
    invokeMock.mockResolvedValue({ data: { questions: api }, error: null });
    const out = await fetchQuestions('math', 9, 3, api.length);
    // …and asks as the kid playing, so their seen questions are their own (#124).
    // reportsSeen: this app marks what it shows, so a batch is only held back (#134).
    expect(invokeMock.mock.calls[0][1].body).toMatchObject({ topic: 'math', profileId: 'kid-1', reportsSeen: true });
    expect(out).toHaveLength(api.length);
    for (const question of out) expect(question.options[question.correctIndex]).toBe('right');
    // 40 questions all left in place would be a 1-in-4^40 fluke.
    expect(out.some((question) => question.correctIndex !== 1)).toBe(true);
  });

  it('names its flavour by key and sends no free text (Act I launch review B8)', async () => {
    invokeMock.mockResolvedValue({ data: { questions: [] }, error: null });
    await fetchQuestions('math', 9, 3, 1, 'spire');
    const body = invokeMock.mock.calls[0][1].body;
    expect(body).toMatchObject({ flavor: 'spire' });
    expect(body).not.toHaveProperty('context');
  });

  it("gives starter questions, not an error, when the function doesn't know a topic yet (#135, B5)", async () => {
    // The real path: a FunctionsHttpError whose JSON body carries the function's own 400 text.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = { error: 'topic must be one of: math, science' };
    const response = new Response(JSON.stringify(body), { status: 400, headers: { 'Content-Type': 'application/json' } });
    invokeMock.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) });
    const out = await fetchQuestions('music', 9, 3, 5);
    expect(out).toHaveLength(5);
    for (const q of out) expect(q.id).toMatch(/^starter-music-easy-/);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

/** `n` questions as the function returns them. */
function apiBatch(n: number, from = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `q-${from + i}`,
    level: 5,
    text: `Question ${from + i}`,
    options: ['right', 'wrong 1', 'wrong 2', 'wrong 3'],
    correctIndex: 0,
    explanation: '',
    timesAsked: 0,
  }));
}

describe('fetchQuestions never fails a child (B5)', () => {
  it('fills the whole batch from the starter questions when the server fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const failure of [
      { data: null, error: new Error('Failed to fetch') }, // offline
      { data: null, error: new Error('budget_exhausted') }, // 429
      { data: null, error: new Error('questions_unavailable') }, // 503
    ]) {
      invokeMock.mockResolvedValueOnce(failure);
      const out = await fetchQuestions('science', 9, 8, 5);
      expect(out).toHaveLength(5);
      for (const q of out) {
        expect(q.id).toMatch(/^starter-science-hard-/);
        expect(q.options).toHaveLength(4);
        expect(q.options[q.correctIndex]).toBeTruthy();
      }
    }
    // Thrown, not only returned, errors too.
    invokeMock.mockRejectedValueOnce(new Error('network down'));
    expect(await fetchQuestions('math', 9, 2, 9)).toHaveLength(9);
    warn.mockRestore();
  });

  it("shuffles a starter question's answers, keeping the right one right", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    invokeMock.mockResolvedValue({ data: null, error: new Error('down') });
    const spots = new Set<number>();
    for (let n = 0; n < 12; n++)
      for (const q of await fetchQuestions('math', 9, 2, 6)) {
        expect(q.options[q.correctIndex]).toBe(
          { 'What is 3 + 4?': '7', 'How many sides does a triangle have?': '3', 'What is 10 − 3?': '7', 'Which number is the biggest: 9, 6, 3 or 8?': '9', 'What is 5 + 5?': '10', 'How many legs do 2 dogs have altogether?': '8' }[q.text],
        );
        spots.add(q.correctIndex);
      }
    expect(spots.size).toBeGreaterThan(1);
    warn.mockRestore();
  });

  it('tops a short batch up from the starter questions', async () => {
    invokeMock.mockResolvedValue({ data: { questions: apiBatch(3) }, error: null });
    const out = await fetchQuestions('history', 9, 5, 5);
    expect(out.map((q) => q.id.slice(0, 2))).toEqual(['q-', 'q-', 'q-', 'st', 'st']);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('asks for saved questions only when warming a zone, and finishes a short batch when it is used', async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(4) }, error: null });
    prefetchQuestions('nature', 9, 5, 9, undefined, { cacheOnly: true });
    expect(invokeMock.mock.calls[0][1].body).toMatchObject({ topic: 'nature', count: 9, cacheOnly: true });

    // The battle starts: it asks for the five still missing, normally.
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(5, 4) }, error: null });
    const out = await fetchQuestions('nature', 9, 5, 9);
    expect(out.map((q) => q.id)).toEqual(['q-0', 'q-1', 'q-2', 'q-3', 'q-4', 'q-5', 'q-6', 'q-7', 'q-8']);
    expect(invokeMock).toHaveBeenCalledTimes(2);
    const rest = invokeMock.mock.calls[1][1].body;
    expect(rest).toMatchObject({ count: 5 });
    expect(rest).not.toHaveProperty('cacheOnly');
  });

  it('uses a full warmed batch as it is, and asks again when warming failed', async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(9) }, error: null });
    prefetchQuestions('space', 9, 4, 9, undefined, { cacheOnly: true });
    expect(await fetchQuestions('space', 9, 4, 9)).toHaveLength(9);
    expect(invokeMock).toHaveBeenCalledTimes(1);

    invokeMock.mockReset();
    invokeMock.mockResolvedValueOnce({ data: { questions: [] }, error: null }); // nothing saved yet
    prefetchQuestions('space', 9, 6, 9, undefined, { cacheOnly: true });
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(9) }, error: null });
    expect(await fetchQuestions('space', 9, 6, 9)).toHaveLength(9);
    expect(invokeMock.mock.calls[1][1].body).toMatchObject({ count: 9 });
  });

  it('a warm-up still on its way when the battle starts, which then fails: asked again, no error (review round 1)', async () => {
    let fail!: (e: Error) => void;
    invokeMock.mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));
    prefetchQuestions('math', 9, 4, 9, undefined, { cacheOnly: true });
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(9) }, error: null });
    const battle = fetchQuestions('math', 9, 4, 9);
    fail(new Error('Failed to fetch'));
    expect(await battle).toHaveLength(9);
    expect(invokeMock.mock.calls[1][1].body).toMatchObject({ count: 9 });
    expect(invokeMock.mock.calls[1][1].body).not.toHaveProperty('cacheOnly');
  });

  it('drops a question the warm-up already gave (handed back as a seen one) and tops up instead (review round 1)', async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(4) }, error: null });
    prefetchQuestions('history', 9, 6, 9, undefined, { cacheOnly: true });
    // Out of budget, the battle's own call falls back to seen questions — and
    // the warm-up's are held as seen, so two of them come back.
    invokeMock.mockResolvedValueOnce({ data: { questions: [...apiBatch(2), ...apiBatch(3, 10)] }, error: null });
    const out = await fetchQuestions('history', 9, 6, 9);
    expect(out).toHaveLength(9);
    expect(new Set(out.map((q) => q.id)).size).toBe(9);
    expect(out.filter((q) => q.id.startsWith('starter-'))).toHaveLength(2);
  });

  it('a normal look-ahead never asks for saved questions only', async () => {
    invokeMock.mockResolvedValue({ data: { questions: apiBatch(5) }, error: null });
    prefetchQuestions('words', 9, 3, 5);
    expect(invokeMock.mock.calls[0][1].body).not.toHaveProperty('cacheOnly');
    expect(await fetchQuestions('words', 9, 3, 5)).toHaveLength(5);
  });
});

describe('a battle that starts at once (#158)', () => {
  it('starts on the warmed saved questions without asking the server again', async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(4) }, error: null });
    prefetchQuestions('nature', 9, 5, 9, undefined, { cacheOnly: true });
    const { questions, late } = await quickQuestions('nature', 9, 5, 9);
    expect(questions.map((q) => q.id)).toEqual(['q-0', 'q-1', 'q-2', 'q-3']);
    expect(await late).toEqual([]);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("uses the zone's look-ahead exactly as WorldScreen warms it (review fix: the keys must match)", async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(9) }, error: null });
    // WorldScreen's call, word for word: no flavour, saved questions only.
    prefetchQuestions('math', 9, 4, BATTLE_QUESTION_COUNT, undefined, { cacheOnly: true });
    const { questions } = await quickQuestions('math', 9, 4, BATTLE_QUESTION_COUNT);
    expect(questions).toHaveLength(9);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('with nothing warmed, asks for saved questions only — never a Claude call', async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(9) }, error: null });
    const { questions } = await quickQuestions('space', 9, 4, 9);
    expect(questions).toHaveLength(9);
    expect(invokeMock.mock.calls[0][1].body).toMatchObject({ topic: 'space', count: 9, cacheOnly: true });
  });

  it('a spell pool asks with its flavour', async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(4) }, error: null });
    await quickQuestions('space', 9, 7, 4, { flavor: 'spell' });
    expect(invokeMock.mock.calls[0][1].body).toMatchObject({ count: 4, cacheOnly: true, flavor: 'spell' });
  });

  it('with fewer than three saved, starter questions fill the pool to six', async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(1) }, error: null });
    const { questions } = await quickQuestions('math', 9, 4, 9);
    expect(questions.map((q) => q.id.slice(0, 2))).toEqual(['q-', 'st', 'st', 'st', 'st', 'st']);
    // Never past the batch: a spell pool of four fills to four.
    invokeMock.mockResolvedValueOnce({ data: { questions: [] }, error: null });
    expect((await quickQuestions('math', 9, 4, 4)).questions).toHaveLength(4);
  });

  it('starts on starter questions when the bank is down or slow — and a slow batch still arrives (review fix)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    invokeMock.mockResolvedValueOnce({ data: null, error: new Error('Failed to fetch') });
    expect((await quickQuestions('math', 9, 4, 9)).questions.every((q) => q.id.startsWith('starter-'))).toBe(true);

    vi.useFakeTimers();
    try {
      let answer!: (v: unknown) => void;
      invokeMock.mockReturnValueOnce(new Promise((r) => (answer = r)));
      const slow = quickQuestions('math', 9, 4, 9, { waitMs: 3000 });
      await vi.advanceTimersByTimeAsync(3000);
      const { questions, late } = await slow;
      expect(questions).toHaveLength(6);
      expect(questions.every((q) => q.id.startsWith('starter-'))).toBe(true);
      // The server already handed this batch over: it isn't thrown away.
      answer({ data: { questions: apiBatch(5) }, error: null });
      expect((await late).map((q) => q.id)).toEqual(['q-0', 'q-1', 'q-2', 'q-3', 'q-4']);
    } finally {
      vi.useRealTimers();
      warn.mockRestore();
    }
  });

  it('the rest come from a normal request (Claude may write them), none repeated', async () => {
    const have = apiBatch(3).map((q) => ({ ...q, topic: 'nature' as const }));
    // The server hands back one the battle already has, as a seen question.
    invokeMock.mockResolvedValueOnce({ data: { questions: [...apiBatch(1), ...apiBatch(6, 10)] }, error: null });
    const rest = await moreQuestions('nature', 9, 5, 9, have, 'spell');
    const body = invokeMock.mock.calls[0][1].body;
    expect(body).toMatchObject({ count: 6, flavor: 'spell' });
    expect(body).not.toHaveProperty('cacheOnly');
    expect(rest).toHaveLength(6);
    expect(rest.map((q) => q.id)).not.toContain('q-0');
  });

  it('starter questions that only filled in are asked for again from the bank', async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: [] }, error: null });
    const { questions: first } = await quickQuestions('math', 9, 4, 9);
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(9) }, error: null });
    const rest = await moreQuestions('math', 9, 4, 9, first);
    expect(invokeMock.mock.calls[1][1].body).toMatchObject({ count: 9 });
    expect(rest).toHaveLength(9);
  });

  it('what the server cannot give comes from starters, none already in the pool; a full pool asks nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    invokeMock.mockResolvedValueOnce({ data: null, error: new Error('questions_unavailable') });
    const { questions: first } = await quickQuestions('math', 9, 2, 9);
    invokeMock.mockReset();
    invokeMock.mockResolvedValueOnce({ data: null, error: new Error('questions_unavailable') });
    const rest = await moreQuestions('math', 9, 2, 9, first);
    expect(first.length + rest.length).toBe(9);
    expect(new Set([...first, ...rest].map((q) => q.id)).size).toBe(9);

    invokeMock.mockReset();
    const bank = apiBatch(3).map((q) => ({ ...q, topic: 'math' as const }));
    expect(await moreQuestions('math', 9, 2, 3, bank)).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('a quiz round that starts at once (#163)', () => {
  const q = (id: string): Question => ({ id, topic: 'math', level: 3, text: id, options: ['a', 'b', 'c', 'd'], correctIndex: 0 });

  it('asks the next bank question first, then a starter, never one already asked', () => {
    const pool = [q('starter-math-easy-1'), q('starter-math-easy-2'), q('b1'), q('b2')];
    expect(nextRoundQuestion(pool, [])?.id).toBe('b1');
    expect(nextRoundQuestion(pool, [q('b1')])?.id).toBe('b2');
    expect(nextRoundQuestion(pool, [q('b1'), q('b2')])?.id).toBe('starter-math-easy-1');
    expect(nextRoundQuestion(pool, [q('b1'), q('b2'), q('starter-math-easy-1')])?.id).toBe('starter-math-easy-2');
  });

  it('has nothing to ask while the rest are on their way', () => {
    expect(nextRoundQuestion([], [])).toBeNull();
    expect(nextRoundQuestion([q('b1')], [q('b1')])).toBeNull();
  });

  it('a spare starter is never one the round asked, and keeps its right answer right', () => {
    for (let run = 0; run < 50; run++) {
      const asked: Question[] = [q('b1')];
      for (let i = 0; i < QUIZ_QUESTION_COUNT - 1; i++) {
        const spare = spareStarter('math', 2, asked);
        expect(spare.id.startsWith('starter-math-')).toBe(true);
        expect(asked.map((x) => x.id)).not.toContain(spare.id);
        asked.push(spare);
      }
    }
    // Shuffled like any starter: the right answer moves with its index.
    const spare = spareStarter('science', 8, []);
    expect(spare.options).toHaveLength(4);
    expect(spare.options[spare.correctIndex]).toBeTruthy();
  });

  it("the next round's look-ahead is saved questions only, and the round starts on it", async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(5) }, error: null });
    // QuizRound's call, word for word.
    warmNextRound('words', 9, 4, QUIZ_QUESTION_COUNT);
    expect(invokeMock.mock.calls[0][1].body).toMatchObject({ topic: 'words', count: 5, cacheOnly: true });
    const { questions } = await quickQuestions('words', 9, 4, QUIZ_QUESTION_COUNT);
    expect(questions).toHaveLength(5);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});

describe('a quiz round — review round 1 (#163)', () => {
  const q = (id: string, level = 5): Question => ({ id, topic: 'math', level, text: id, options: ['a', 'b', 'c', 'd'], correctIndex: 0 });
  const ids = (qs: Question[]) => qs.map((x) => x.id);

  it('the wait fills the kid\'s slot, and any empty one before it — and nothing when a question already came for it', () => {
    const asked = [q('b1'), q('b2'), q('b3'), q('b4')];
    // A bank question landed in the same tick as the timer: slot 3 is taken.
    expect(withSpareStarters(asked, 3, 'math', 5)).toBe(asked);
    const one = withSpareStarters(asked.slice(0, 3), 3, 'math', 5);
    expect(ids(one).slice(0, 3)).toEqual(['b1', 'b2', 'b3']);
    expect(one).toHaveLength(4);
    // Two slots empty (one got past without a question): both filled, none twice.
    const two = withSpareStarters(asked.slice(0, 3), 4, 'math', 5);
    expect(two).toHaveLength(5);
    expect(two.slice(3).every((x) => x.id.startsWith('starter-math-'))).toBe(true);
    expect(new Set(ids(two)).size).toBe(5);
  });

  it('a quick start with questions in hand starts on them at once and asks only for the rest, none twice', async () => {
    const have = [q('c1'), q('c2'), q('c3')];
    let answer!: (v: unknown) => void;
    invokeMock.mockReturnValueOnce(new Promise((r) => (answer = r)));
    // In before the saved ones answer — no wait at all.
    let started: Awaited<ReturnType<typeof quickQuestions>> | null = null;
    void quickQuestions('math', 9, 5, 5, { have }).then((r) => (started = r));
    await new Promise((r) => setTimeout(r, 0));
    expect(started).not.toBeNull();
    const { questions, late } = started!;
    expect(ids(questions)).toEqual(['c1', 'c2', 'c3']);
    expect(invokeMock.mock.calls[0][1].body).toMatchObject({ count: 2, cacheOnly: true });
    // The server hands back one already here (held for another screen), and two new.
    answer({ data: { questions: [{ ...apiBatch(1)[0], id: 'c2' }, ...apiBatch(2)] }, error: null });
    expect(ids(await late)).toEqual(['q-0', 'q-1']);
  });

  it('…with fewer than three in hand it waits for the saved ones as usual, and with the whole round in hand asks nothing', async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(4) }, error: null });
    const { questions } = await quickQuestions('math', 9, 5, 5, { have: [q('c1')] });
    expect(invokeMock.mock.calls[0][1].body).toMatchObject({ count: 4 });
    expect(ids(questions)).toEqual(['c1', 'q-0', 'q-1', 'q-2', 'q-3']);

    invokeMock.mockReset();
    const all = [q('c1'), q('c2'), q('c3'), q('c4'), q('c5')];
    const start = await quickQuestions('math', 9, 5, 5, { have: all });
    expect(start.questions).toEqual(all);
    expect(await start.late).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('carries over bank questions only, none twice, for that kid and topic alone', () => {
    carryOver('kid-1', 'math', [q('b1'), q('starter-math-middle-1'), q('b2')]);
    carryOver('kid-1', 'math', [q('b2'), q('b3')]);
    expect(carriedCount('math', 5)).toBe(3);
    expect(carriedCount('science', 5)).toBe(0);
    // A sibling never gets them.
    useFamilyStore.setState({ activeKidId: 'kid-2' });
    expect(takeCarried('math', 5, 5)).toEqual([]);
    useFamilyStore.setState({ activeKidId: 'kid-1' });
    // Oldest first, taken once.
    expect(ids(takeCarried('math', 5, 2))).toEqual(['b1', 'b2']);
    expect(ids(takeCarried('math', 5, 5))).toEqual(['b3']);
    expect(takeCarried('math', 5, 5)).toEqual([]);
  });

  it('a carried question is used only near its level, and dropped once the server\'s hold may have lapsed; at most ten a topic', () => {
    vi.useFakeTimers();
    try {
      carryOver('kid-1', 'math', [q('lvl3', 3), q('lvl8', 8)]);
      // Within two levels, the band the server reuses from.
      expect(ids(takeCarried('math', 5, 5))).toEqual(['lvl3']);
      expect(carriedCount('math', 7)).toBe(1);
      vi.advanceTimersByTime(HELD_FOR_MS);
      expect(carriedCount('math', 7)).toBe(0);
      carryOver('kid-1', 'math', Array.from({ length: 12 }, (_, i) => q(`b${i}`)));
      expect(carriedCount('math', 5)).toBe(10);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a round's fresh request asks the way a round always did — normally, five — and its questions go to the next round", async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(5) }, error: null });
    askFreshForNextRound('math', 9, 5, QUIZ_QUESTION_COUNT);
    // One at a time a topic.
    askFreshForNextRound('math', 9, 5, QUIZ_QUESTION_COUNT);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const body = invokeMock.mock.calls[0][1].body;
    expect(body).toMatchObject({ topic: 'math', count: 5 });
    expect(body).not.toHaveProperty('cacheOnly');
    await vi.waitFor(() => expect(carriedCount('math', 5)).toBe(5));
    // The next round is covered: none asked for it.
    askFreshForNextRound('math', 9, 5, QUIZ_QUESTION_COUNT);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('a fresh request that fails is logged in words, and nothing else happens', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    invokeMock.mockResolvedValueOnce({ data: null, error: new Error('Failed to fetch') });
    askFreshForNextRound('math', 9, 5, 5);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith("The next round's questions didn't come:", expect.stringContaining('Failed to fetch')));
    expect(carriedCount('math', 5)).toBe(0);
    // …and the next can go.
    invokeMock.mockResolvedValueOnce({ data: { questions: [] }, error: null });
    askFreshForNextRound('math', 9, 5, 5);
    expect(invokeMock).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("the next round's look-ahead asks only for what its carried questions leave missing — none when they cover it, or a fresh request is bringing them", async () => {
    carryOver('kid-1', 'history', [q('c1'), q('c2')]);
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(3) }, error: null });
    warmNextRound('history', 9, 5, 5);
    expect(invokeMock.mock.calls[0][1].body).toMatchObject({ topic: 'history', count: 3, cacheOnly: true });
    // The round finds it under its own count, and starts on the carried two first.
    const { questions } = await quickQuestions('history', 9, 5, 5, { have: takeCarried('history', 5, 5) });
    expect(ids(questions)).toEqual(['c1', 'c2', 'q-0', 'q-1', 'q-2']);
    expect(invokeMock).toHaveBeenCalledTimes(1);

    invokeMock.mockReset();
    carryOver('kid-1', 'history', [1, 2, 3, 4, 5].map((n) => q(`d${n}`)));
    warmNextRound('history', 9, 5, 5);
    expect(invokeMock).not.toHaveBeenCalled();

    invokeMock.mockReturnValueOnce(new Promise(() => {})); // being written
    askFreshForNextRound('words', 9, 5, 5);
    warmNextRound('words', 9, 5, 5);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('a look-ahead warmed longer ago than the server holds its questions is asked for again (#163 review, also noted)', async () => {
    vi.useFakeTimers();
    try {
      invokeMock.mockResolvedValue({ data: { questions: apiBatch(9) }, error: null });
      prefetchQuestions('geography', 9, 4, 9, undefined, { cacheOnly: true });
      vi.advanceTimersByTime(HELD_FOR_MS);
      // Warming again replaces it…
      prefetchQuestions('geography', 9, 4, 9, undefined, { cacheOnly: true });
      expect(invokeMock).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(HELD_FOR_MS);
      // …and an old one isn't used: the battle asks afresh.
      await quickQuestions('geography', 9, 4, 9);
      expect(invokeMock).toHaveBeenCalledTimes(3);
      prefetchQuestions('geography', 9, 4, 9, undefined, { cacheOnly: true });
      vi.advanceTimersByTime(HELD_FOR_MS);
      await fetchQuestions('geography', 9, 4, 9);
      expect(invokeMock).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a quiz round — review round 2 (#163)', () => {
  const q = (id: string, level = 5): Question => ({ id, topic: 'math', level, text: id, options: ['a', 'b', 'c', 'd'], correctIndex: 0 });
  const ids = (qs: Question[]) => qs.map((x) => x.id);
  /** The server's answer: saved questions from the ±2 band around the level asked, the fresh one at it. */
  const band = (level: number, from = 0) => [-2, -1, 0, 1, 2].map((d, i) => ({ ...apiBatch(1, from + i)[0], level: level + d }));

  it("the next round's fresh request goes out as the round ends, at the level it is played at, and all it brings fits that round", async () => {
    invokeMock.mockImplementation(async (_n: string, { body }: { body: { skillLevel: number } }) => ({ data: { questions: band(body.skillLevel) }, error: null }));
    // A round at level 5 aced: the next is at 7.
    warmNextRound('math', 9, 7, 5, { fresh: true });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const body = invokeMock.mock.calls[0][1].body;
    expect(body).toMatchObject({ topic: 'math', skillLevel: 7, count: 5 });
    expect(body).not.toHaveProperty('cacheOnly');
    // None stranded: all five within two levels of 7.
    await vi.waitFor(() => expect(carriedCount('math', 7)).toBe(5));
    // The next round's covered: the one after asks nothing more, either way.
    warmNextRound('math', 9, 7, 5, { fresh: true });
    warmNextRound('math', 9, 7, 5);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("…for the kid it was asked for, even after a switch of player; and it holds back only that kid's look-ahead for that topic", async () => {
    let answer!: (v: unknown) => void;
    invokeMock.mockReturnValueOnce(new Promise((r) => (answer = r)));
    warmNextRound('words', 9, 5, 5, { fresh: true });
    // Another topic, or a sibling, warms as usual (saved questions only).
    invokeMock.mockResolvedValue({ data: { questions: [] }, error: null });
    warmNextRound('history', 9, 5, 5);
    useFamilyStore.setState({ activeKidId: 'kid-2' });
    warmNextRound('words', 9, 5, 5);
    expect(invokeMock).toHaveBeenCalledTimes(3);
    expect(invokeMock.mock.calls.slice(1).map((c) => c[1].body)).toEqual([
      expect.objectContaining({ topic: 'history', cacheOnly: true, profileId: 'kid-1' }),
      expect.objectContaining({ topic: 'words', cacheOnly: true, profileId: 'kid-2' }),
    ]);
    // It lands while the sibling plays: it's still kid-1's.
    answer({ data: { questions: band(5) }, error: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(carriedCount('words', 5)).toBe(0);
    useFamilyStore.setState({ activeKidId: 'kid-1' });
    expect(carriedCount('words', 5)).toBe(5);
  });

  it('a carried question lasts until 45 min after the server handed it over — carrying it, putting it back or carrying it again never resets that', async () => {
    vi.useFakeTimers();
    try {
      invokeMock.mockResolvedValue({ data: { questions: apiBatch(3) }, error: null });
      askFreshForNextRound('math', 9, 5, 5);
      await vi.advanceTimersByTimeAsync(0);
      expect(carriedCount('math', 5)).toBe(3);
      // Taken into a round 30 min on, which used one and was left: two back.
      vi.advanceTimersByTime(30 * 60 * 1000);
      const taken = takeCarried('math', 5, 5);
      carryOver('kid-1', 'math', taken.slice(1));
      carryOver('kid-1', 'math', taken.slice(1));
      vi.advanceTimersByTime(HELD_FOR_MS - 30 * 60 * 1000 - 1);
      expect(carriedCount('math', 5)).toBe(2);
      vi.advanceTimersByTime(1);
      expect(carriedCount('math', 5)).toBe(0);
      // Handed over that long ago, it isn't kept at all.
      carryOver('kid-1', 'math', taken);
      expect(carriedCount('math', 5)).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('at the cap the oldest carried go — never the newest, which fit the next round', () => {
    vi.useFakeTimers();
    try {
      // Ten left behind at level 3 by a kid who has since climbed…
      carryOver('kid-1', 'math', Array.from({ length: 10 }, (_, i) => q(`old${i}`, 3)));
      vi.advanceTimersByTime(60 * 1000);
      // …and five for the round at level 7.
      carryOver('kid-1', 'math', [1, 2, 3, 4, 5].map((n) => q(`new${n}`, 7)));
      expect(ids(takeCarried('math', 7, 5))).toEqual(['new1', 'new2', 'new3', 'new4', 'new5']);
      expect(ids(takeCarried('math', 3, 10))).toEqual(['old5', 'old6', 'old7', 'old8', 'old9']);
    } finally {
      vi.useRealTimers();
    }
  });
});
