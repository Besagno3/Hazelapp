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
    expect(fetchQuestions).toHaveBeenCalledWith('math', 9, 4, 2, 'spire');
    expect(fetchQuestions).toHaveBeenCalledWith('music', 9, 7, 2, 'spire');
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
