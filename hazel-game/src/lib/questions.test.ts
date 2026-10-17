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
import { fetchQuestions, flagQuestion, inQuestionBank, moreQuestions, prefetchQuestions, quickQuestions, shuffleAnswers } from './questions';
import { useFamilyStore } from '../store/familyStore';

beforeEach(() => {
  insertMock.mockReset();
  fromMock.mockClear();
  invokeMock.mockReset();
  useFamilyStore.setState({ activeKidId: 'kid-1' });
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

  it('a normal look-ahead (the next quiz round) never asks for saved questions only', async () => {
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
    const first = await quickQuestions('nature', 9, 5, 9);
    expect(first.map((q) => q.id)).toEqual(['q-0', 'q-1', 'q-2', 'q-3']);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('with nothing warmed, asks for saved questions only — never a Claude call', async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(9) }, error: null });
    const first = await quickQuestions('space', 9, 4, 9);
    expect(first).toHaveLength(9);
    expect(invokeMock.mock.calls[0][1].body).toMatchObject({ topic: 'space', count: 9, cacheOnly: true });
  });

  it('never starts on fewer than three: the starter questions fill a thin bank', async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: apiBatch(1) }, error: null });
    const first = await quickQuestions('math', 9, 4, 9);
    expect(first.map((q) => q.id.slice(0, 2))).toEqual(['q-', 'st', 'st']);
  });

  it('starts on starter questions when the bank is down or slow', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    invokeMock.mockResolvedValueOnce({ data: null, error: new Error('Failed to fetch') });
    expect((await quickQuestions('math', 9, 4, 9)).every((q) => q.id.startsWith('starter-'))).toBe(true);

    vi.useFakeTimers();
    try {
      invokeMock.mockReturnValueOnce(new Promise(() => {})); // never answers
      const slow = quickQuestions('math', 9, 4, 9, { waitMs: 3000 });
      await vi.advanceTimersByTimeAsync(3000);
      const first = await slow;
      expect(first).toHaveLength(3);
      expect(first.every((q) => q.id.startsWith('starter-'))).toBe(true);
    } finally {
      vi.useRealTimers();
      warn.mockRestore();
    }
  });

  it('the rest come from a normal request (Claude may write them), none repeated', async () => {
    const have = apiBatch(3).map((q) => ({ ...q, topic: 'nature' as const }));
    // The server hands back one the battle already has, as a seen question.
    invokeMock.mockResolvedValueOnce({ data: { questions: [...apiBatch(1), ...apiBatch(6, 10)] }, error: null });
    const rest = await moreQuestions('nature', 9, 5, 9, have);
    const body = invokeMock.mock.calls[0][1].body;
    expect(body).toMatchObject({ count: 6 });
    expect(body).not.toHaveProperty('cacheOnly');
    expect(rest).toHaveLength(6);
    expect(rest.map((q) => q.id)).not.toContain('q-0');
  });

  it('what the server cannot give comes from starters, none already in the pool; a full pool asks nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    invokeMock.mockResolvedValueOnce({ data: null, error: new Error('questions_unavailable') });
    const first = await quickQuestions('math', 9, 2, 9, { start: 3 }).catch(() => []);
    invokeMock.mockReset();
    invokeMock.mockResolvedValueOnce({ data: null, error: new Error('questions_unavailable') });
    const rest = await moreQuestions('math', 9, 2, 9, first);
    expect(rest).toHaveLength(6);
    expect(new Set([...first, ...rest].map((q) => q.id)).size).toBe(9);

    invokeMock.mockReset();
    expect(await moreQuestions('math', 9, 2, 3, first)).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
