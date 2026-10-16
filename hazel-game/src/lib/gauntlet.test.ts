import { describe, it, expect, vi } from 'vitest';

const fetchQuestions = vi.fn();
vi.mock('./questions', () => ({ fetchQuestions: (...a: unknown[]) => fetchQuestions(...a) }));
const { loadGauntlet, candleLine } = await import('./gauntlet');

const qs = (topic: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${topic}-${i}`, topic }));

describe('the question gauntlet (pulled out of the Spire, #75 item 16e)', () => {
  it('asks each topic at its own level, shuffles them together and keeps just enough', async () => {
    fetchQuestions.mockImplementation(async (t: string, _age: number, _level: number, n: number) => qs(t, n));
    const pool = await loadGauntlet({ topics: ['math', 'music'], count: 3, age: 9, levelFor: (t) => (t === 'math' ? 4 : 7), flavor: 'spire' });
    expect(pool).toHaveLength(3);
    // …with one spare each, so one topic coming back short doesn't sink it.
    expect(fetchQuestions).toHaveBeenCalledWith('math', 9, 4, 3, 'spire');
    expect(fetchQuestions).toHaveBeenCalledWith('music', 9, 7, 3, 'spire');
  });

  it('every topic gets its share before any spare is used — five topics, five questions, all five asked (16e code review round 3)', async () => {
    fetchQuestions.mockImplementation(async (t: string, _a: number, _l: number, n: number) => qs(t, n));
    const topics = ['math', 'music', 'words', 'space', 'nature'];
    for (let run = 0; run < 50; run++) {
      const pool = await loadGauntlet({ topics: topics as never, count: 5, age: 9, levelFor: () => 3, flavor: 'spire' });
      expect(new Set(pool.map((q) => q.topic)).size).toBe(5);
    }
    // A topic that comes back short is topped up from the others' spares.
    fetchQuestions.mockImplementation(async (t: string, _a: number, _l: number, n: number) => qs(t, t === 'music' ? 0 : n));
    const short = await loadGauntlet({ topics: topics as never, count: 5, age: 9, levelFor: () => 3, flavor: 'spire' });
    expect(short).toHaveLength(5);
    expect(short.some((q) => q.topic === 'music')).toBe(false);
  });

  it('fewer questions than topics: which topics are asked changes run to run (the throne floor: 5 of 7)', async () => {
    fetchQuestions.mockImplementation(async (t: string, _a: number, _l: number, n: number) => qs(t, n));
    const topics = ['math', 'science', 'engineering', 'creativity', 'nature', 'space', 'history'];
    const seen = new Set<string>();
    for (let run = 0; run < 50; run++) {
      const pool = await loadGauntlet({ topics: topics as never, count: 5, age: 9, levelFor: () => 3, flavor: 'spire' });
      expect(new Set(pool.map((q) => q.topic)).size).toBe(5);
      for (const q of pool) seen.add(q.topic);
    }
    expect(seen.size).toBe(7);
  });

  it('a short pool is an error to retry — never a step with no question', async () => {
    fetchQuestions.mockImplementation(async (t: string) => qs(t, 1));
    await expect(loadGauntlet({ topics: ['math'], count: 3, age: 9, levelFor: () => 3, flavor: 'spire' })).rejects.toThrow(/only 1 of 3/);
  });

  it('says how many candles are left', () => {
    expect(candleLine(1)).toMatch(/1 light left!$/);
    expect(candleLine(2)).toMatch(/2 lights left!$/);
  });
});
