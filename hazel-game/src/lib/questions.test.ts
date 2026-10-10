import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { fetchQuestions, flagQuestion, shuffleAnswers } from './questions';
import { useFamilyStore } from '../store/familyStore';

beforeEach(() => {
  insertMock.mockReset();
  fromMock.mockClear();
  invokeMock.mockReset();
  useFamilyStore.setState({ activeKidId: 'kid-1' });
});

describe('flagQuestion', () => {
  it('inserts a flag row as the kid playing, with the chosen reason (#118)', async () => {
    insertMock.mockResolvedValue({ error: null });

    await flagQuestion('q-123', 'wrong_answer');

    expect(fromMock).toHaveBeenCalledWith('question_flags');
    expect(insertMock).toHaveBeenCalledWith({
      question_id: 'q-123',
      profile_id: 'kid-1',
      reason: 'wrong_answer',
    });
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
    // …and asks as the kid playing, so their seen questions are their own (#118).
    expect(invokeMock.mock.calls[0][1].body).toMatchObject({ topic: 'math', profileId: 'kid-1' });
    expect(out).toHaveLength(api.length);
    for (const question of out) expect(question.options[question.correctIndex]).toBe('right');
    // 40 questions all left in place would be a 1-in-4^40 fluke.
    expect(out.some((question) => question.correctIndex !== 1)).toBe(true);
  });
});
