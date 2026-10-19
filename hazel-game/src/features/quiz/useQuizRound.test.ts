import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Question } from '../../types';

const q = (id: string): Question => ({ id, topic: 'math', level: 4, text: id, options: ['a', 'b', 'c', 'd'], correctIndex: 0 });

// The battle's loading (#158) runs for real; only the two requests are stood in for.
const { quick, more } = vi.hoisted(() => ({ quick: vi.fn(), more: vi.fn() }));
vi.mock('../../lib/questions', async (orig) => ({
  ...(await orig<typeof import('../../lib/questions')>()),
  quickQuestions: quick,
  moreQuestions: more,
}));
/** A quick start with nothing coming late. */
const started = (qs: Question[]) => ({ questions: qs, late: Promise.resolve([]) });
/** A request that answers only when the test says so. */
function pending<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const { useQuizRound } = await import('./useQuizRound');
const { QUICK_WAIT_MS } = await import('../../lib/questions');
const { isStarterId } = await import('../../content/starterQuestions');

/** Lets the promises and timers due by now run. */
const flush = (ms = 0) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(() => {
  vi.useFakeTimers();
  quick.mockReset();
  more.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useQuizRound — a quiz that starts at once (#163)', () => {
  it('asks the first saved question without waiting for the rest of the round', async () => {
    quick.mockResolvedValue(started([q('s1'), q('s2'), q('s3')]));
    const rest = pending<Question[]>();
    more.mockReturnValue(rest.promise);

    const { result } = renderHook(() => useQuizRound('math', 5, 4));
    expect(result.current.waiting).toBe(true);
    await flush();
    expect(result.current.waiting).toBe(false);
    expect(result.current.question?.id).toBe('s1');
    expect(result.current.number).toBe(0);
    // The battle's way: the rest asked for in the background, knowing what's here.
    expect(quick).toHaveBeenCalledWith('math', expect.any(Number), 4, 5, { flavor: undefined });
    expect(more).toHaveBeenCalledWith('math', expect.any(Number), 4, 5, [q('s1'), q('s2'), q('s3')], undefined);
  });

  it('reaching a question before the rest arrives waits, and takes it when it lands — none asked twice', async () => {
    quick.mockResolvedValue(started([q('s1'), q('s2'), q('s3')]));
    const rest = pending<Question[]>();
    more.mockReturnValue(rest.promise);
    const { result } = renderHook(() => useQuizRound('math', 5, 4));
    await flush();
    for (let i = 0; i < 3; i++) act(() => result.current.advance());
    expect(result.current.number).toBe(3);
    expect(result.current.waiting).toBe(true);
    expect(result.current.question).toBeNull();

    // The server hands back one the round already asked, then two new ones.
    await act(async () => rest.resolve([q('s2'), q('n1'), q('n2')]));
    expect(result.current.waiting).toBe(false);
    expect(result.current.question?.id).toBe('n1');
    act(() => result.current.advance());
    expect(result.current.question?.id).toBe('n2');
    expect(result.current.asked.map((x) => x.id)).toEqual(['s1', 's2', 's3', 'n1', 'n2']);
  });

  it('nothing in time: a starter question after the short wait, never one already asked, so the round finishes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    quick.mockResolvedValue(started([q('s1'), q('s2'), q('s3')]));
    more.mockReturnValue(pending<Question[]>().promise); // a slow (hung) request
    const { result } = renderHook(() => useQuizRound('math', 5, 2));
    await flush();
    for (let i = 0; i < 3; i++) act(() => result.current.advance());
    await flush(QUICK_WAIT_MS - 1);
    expect(result.current.waiting).toBe(true);
    await flush(1);
    expect(result.current.waiting).toBe(false);
    const fourth = result.current.question!;
    expect(isStarterId(fourth.id)).toBe(true);
    expect(fourth.options[fourth.correctIndex]).toBeTruthy();

    act(() => result.current.advance());
    expect(result.current.waiting).toBe(true);
    await flush(QUICK_WAIT_MS);
    expect(isStarterId(result.current.question!.id)).toBe(true);
    const ids = result.current.asked.map((x) => x.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    // The last question stays the last.
    act(() => result.current.advance());
    expect(result.current.number).toBe(4);
    warn.mockRestore();
  });

  it('bank questions that arrive go ahead of the starters that filled in (they pay XP and move the level, #153)', async () => {
    const starters = [1, 2, 3, 4, 5].map((n) => q(`starter-math-easy-${n}`));
    quick.mockResolvedValue(started(starters));
    const rest = pending<Question[]>();
    more.mockReturnValue(rest.promise);
    const { result } = renderHook(() => useQuizRound('math', 5, 2));
    await flush();
    expect(result.current.question?.id).toBe('starter-math-easy-1');
    // No wait while starters are waiting their turn.
    act(() => result.current.advance());
    expect(result.current.question?.id).toBe('starter-math-easy-2');
    await act(async () => rest.resolve([q('b1'), q('b2')]));
    // The question on screen stays put; the next one is from the bank.
    expect(result.current.question?.id).toBe('starter-math-easy-2');
    act(() => result.current.advance());
    expect(result.current.question?.id).toBe('b1');
    act(() => result.current.advance());
    expect(result.current.question?.id).toBe('b2');
    act(() => result.current.advance());
    expect(result.current.question?.id).toBe('starter-math-easy-3');
  });

  it('the first wait is the quick start’s own — no spare starter before it ends', async () => {
    const first = pending<{ questions: Question[]; late: Promise<Question[]> }>();
    quick.mockReturnValue(first.promise);
    more.mockResolvedValue([]);
    const { result } = renderHook(() => useQuizRound('math', 5, 4));
    await flush(QUICK_WAIT_MS * 2);
    expect(result.current.waiting).toBe(true);
    expect(result.current.asked).toEqual([]);
    await act(async () => first.resolve(started([q('s1'), q('s2'), q('s3'), q('s4'), q('s5')])));
    expect(result.current.question?.id).toBe('s1');
  });
});
