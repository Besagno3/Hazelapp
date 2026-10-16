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
import { fetchQuestions, flagQuestion, shuffleAnswers, TOPIC_NOT_READY } from './questions';
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

  it("says a topic isn't ready yet, not the server's whitelist, when the function doesn't know it (#135)", async () => {
    // The real path: a FunctionsHttpError whose JSON body carries the function's own 400 text.
    const body = { error: 'topic must be one of: math, science' };
    const response = new Response(JSON.stringify(body), { status: 400, headers: { 'Content-Type': 'application/json' } });
    invokeMock.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) });
    await expect(fetchQuestions('music', 9, 3, 5)).rejects.toThrow(TOPIC_NOT_READY);
    // Any other failure keeps its real reason.
    invokeMock.mockResolvedValue({ data: null, error: new Error('rate limited') });
    await expect(fetchQuestions('math', 9, 3, 5)).rejects.toThrow('Question generation failed — rate limited');
  });
});
