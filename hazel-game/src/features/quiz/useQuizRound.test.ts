import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Question } from '../../types';

const q = (id: string): Question => ({ id, topic: 'math', level: 4, text: id, options: ['a', 'b', 'c', 'd'], correctIndex: 0 });

// The battle's loading (#158) runs for real, and so does the carry-over (#163
// review); only the requests are stood in for.
const { quick, more, fresh } = vi.hoisted(() => ({ quick: vi.fn(), more: vi.fn(), fresh: vi.fn() }));
vi.mock('../../lib/questions', async (orig) => ({
  ...(await orig<typeof import('../../lib/questions')>()),
  quickQuestions: quick,
  moreQuestions: more,
  askFreshForNextRound: fresh,
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
const { QUICK_WAIT_MS, clearCarried, carriedCount } = await import('../../lib/questions');
const { isStarterId } = await import('../../content/starterQuestions');
const { useFamilyStore } = await import('../../store/familyStore');

/** `carriedCount` for `kid` (it reads the kid playing). */
function carriedFor(kid: string | null, level = 4) {
  const playing = useFamilyStore.getState().activeKidId;
  useFamilyStore.setState({ activeKidId: kid });
  const n = carriedCount('math', level);
  useFamilyStore.setState({ activeKidId: playing });
  return n;
}

/** Lets the promises and timers due by now run. */
const flush = (ms = 0) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(() => {
  vi.useFakeTimers();
  quick.mockReset();
  more.mockReset();
  fresh.mockReset();
  clearCarried();
  useFamilyStore.setState({ activeKidId: 'kid-1' });
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
    expect(quick).toHaveBeenCalledWith('math', expect.any(Number), 4, 5, { flavor: undefined, have: [], kid: 'kid-1' });
    expect(more).toHaveBeenCalledWith('math', expect.any(Number), 4, 5, [q('s1'), q('s2'), q('s3')], undefined, 'kid-1');
  });

  it('reaching a question before the rest arrives waits, and takes it when it lands — none asked twice', async () => {
    quick.mockResolvedValue(started([q('s1'), q('s2'), q('s3')]));
    const rest = pending<Question[]>();
    more.mockReturnValue(rest.promise);
    const { result } = renderHook(() => useQuizRound('math', 5, 4));
    await flush();
    for (let i = 0; i < 3; i++) act(() => result.current.advance(i));
    expect(result.current.number).toBe(3);
    expect(result.current.waiting).toBe(true);
    expect(result.current.question).toBeNull();

    // The server hands back one the round already asked, then two new ones.
    await act(async () => rest.resolve([q('s2'), q('n1'), q('n2')]));
    expect(result.current.waiting).toBe(false);
    expect(result.current.question?.id).toBe('n1');
    act(() => result.current.advance(3));
    expect(result.current.question?.id).toBe('n2');
    expect(result.current.asked.map((x) => x.id)).toEqual(['s1', 's2', 's3', 'n1', 'n2']);
  });

  it('nothing in time: a starter question after the short wait, never one already asked, so the round finishes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    quick.mockResolvedValue(started([q('s1'), q('s2'), q('s3')]));
    more.mockReturnValue(pending<Question[]>().promise); // a slow (hung) request
    const { result } = renderHook(() => useQuizRound('math', 5, 2));
    await flush();
    for (let i = 0; i < 3; i++) act(() => result.current.advance(i));
    await flush(QUICK_WAIT_MS - 1);
    expect(result.current.waiting).toBe(true);
    await flush(1);
    expect(result.current.waiting).toBe(false);
    const fourth = result.current.question!;
    expect(isStarterId(fourth.id)).toBe(true);
    expect(fourth.options[fourth.correctIndex]).toBeTruthy();

    act(() => result.current.advance(3));
    expect(result.current.waiting).toBe(true);
    await flush(QUICK_WAIT_MS);
    expect(isStarterId(result.current.question!.id)).toBe(true);
    const ids = result.current.asked.map((x) => x.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    // The last question stays the last.
    act(() => result.current.advance(4));
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
    act(() => result.current.advance(0));
    expect(result.current.question?.id).toBe('starter-math-easy-2');
    await act(async () => rest.resolve([q('b1'), q('b2')]));
    // The question on screen stays put; the next one is from the bank.
    expect(result.current.question?.id).toBe('starter-math-easy-2');
    act(() => result.current.advance(1));
    expect(result.current.question?.id).toBe('b1');
    act(() => result.current.advance(2));
    expect(result.current.question?.id).toBe('b2');
    act(() => result.current.advance(3));
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

describe('useQuizRound — review round 1 (#163)', () => {
  it('a second tap on the Next of a question already left does nothing: no question is skipped', async () => {
    quick.mockResolvedValue(started([q('s1'), q('s2'), q('s3'), q('s4'), q('s5')]));
    more.mockResolvedValue([]);
    const { result } = renderHook(() => useQuizRound('math', 5, 4));
    await flush();
    // Both taps come from question 1's Next (the old card is still sliding out).
    act(() => {
      result.current.advance(0);
      result.current.advance(0);
    });
    expect(result.current.number).toBe(1);
    expect(result.current.question?.id).toBe('s2');
    expect(result.current.asked.map((x) => x.id)).toEqual(['s1', 's2']);
  });

  it('the wait fills every empty slot up to the kid\'s, so a slot got past without a question never stalls the round', async () => {
    quick.mockResolvedValue(started([q('s1'), q('s2'), q('s3')]));
    more.mockReturnValue(pending<Question[]>().promise); // hung
    const { result } = renderHook(() => useQuizRound('math', 5, 2));
    await flush();
    for (let i = 0; i < 3; i++) act(() => result.current.advance(i));
    // On past the empty fourth: two slots to fill.
    act(() => result.current.advance(3));
    expect(result.current.number).toBe(4);
    await flush(QUICK_WAIT_MS);
    expect(result.current.waiting).toBe(false);
    const ids = result.current.asked.map((x) => x.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(isStarterId(ids[3]) && isStarterId(ids[4])).toBe(true);
  });

  it('a re-keyed round (a new level mid-round) takes only the new questions, once they are in', async () => {
    const level6 = pending<{ questions: Question[]; late: Promise<Question[]> }>();
    quick.mockImplementation(async (_t: string, _a: number, level: number) => (level === 4 ? started([q('a1'), q('a2'), q('a3'), q('a4'), q('a5')]) : level6.promise));
    more.mockResolvedValue([]);
    const { result, rerender } = renderHook(({ level }) => useQuizRound('math', 5, level), { initialProps: { level: 4 } });
    await flush();
    expect(result.current.question?.id).toBe('a1');
    rerender({ level: 6 });
    act(() => result.current.advance(0));
    // The old pool's a2 isn't taken while the new one loads.
    expect(result.current.waiting).toBe(true);
    await act(async () => level6.resolve(started([q('b1'), q('b2'), q('b3'), q('b4'), q('b5')])));
    expect(result.current.question?.id).toBe('b1');
  });

  it('questions that land once every slot is taken go to the next round of the topic, first (none wasted)', async () => {
    const starters = [1, 2, 3, 4, 5].map((n) => q(`starter-math-easy-${n}`));
    quick.mockResolvedValue(started(starters));
    const rest = pending<Question[]>();
    more.mockReturnValue(rest.promise);
    const first = renderHook(() => useQuizRound('math', 5, 4));
    await flush();
    for (let i = 0; i < 4; i++) act(() => first.result.current.advance(i));
    expect(first.result.current.asked).toHaveLength(5);
    // Claude's questions come in after the round took its five starters.
    await act(async () => rest.resolve([q('b1'), q('b2'), q('b3')]));
    expect(carriedCount('math', 4)).toBe(3);
    first.unmount();

    // The next round starts on them: only the rest are asked for.
    quick.mockImplementation(async (_t: string, _a: number, _l: number, _c: number, { have }: { have: Question[] }) => started([...have, q('s1'), q('s2')]));
    more.mockResolvedValue([]);
    const next = renderHook(() => useQuizRound('math', 5, 5));
    await flush();
    expect(quick.mock.calls.at(-1)![4].have.map((x: Question) => x.id)).toEqual(['b1', 'b2', 'b3']);
    expect(next.result.current.question?.id).toBe('b1');
    expect(carriedCount('math', 5)).toBe(0);
  });

  it('…and so do the ones that land after the kid left, or that the round never got to', async () => {
    quick.mockResolvedValue(started([q('s1'), q('s2'), q('s3'), q('s4')]));
    const rest = pending<Question[]>();
    more.mockReturnValue(rest.promise);
    const { result, unmount } = renderHook(() => useQuizRound('math', 5, 4));
    await flush();
    act(() => result.current.advance(0));
    // Left at question 2 (Switch player): s3 and s4 were never asked.
    unmount();
    expect(carriedCount('math', 4)).toBe(2);
    await act(async () => rest.resolve([q('n1')]));
    expect(carriedCount('math', 4)).toBe(3);
  });

  it('a bank that covers the round asks nothing more for it, and says so — the round\'s end asks for the next one\'s (#30; review round 2)', async () => {
    quick.mockResolvedValue(started([q('s1'), q('s2'), q('s3'), q('s4'), q('s5')]));
    const { result } = renderHook(() => useQuizRound('math', 5, 4));
    await flush();
    expect(result.current.question?.id).toBe('s1');
    expect(more).not.toHaveBeenCalled();
    expect(result.current.covered).toBe(true);
    // Not at the round's start, at the level it started at (review round 2).
    expect(fresh).not.toHaveBeenCalled();
  });

  it('a thin bank asks for the rest as before, and no extra request', async () => {
    quick.mockResolvedValue(started([q('s1'), q('starter-math-easy-1'), q('starter-math-easy-2')]));
    more.mockResolvedValue([]);
    const { result } = renderHook(() => useQuizRound('math', 5, 4));
    await flush();
    expect(more).toHaveBeenCalled();
    expect(result.current.covered).toBe(false);
    expect(fresh).not.toHaveBeenCalled();
  });
});

describe('useQuizRound — review round 2 (#163)', () => {
  it('left mid-round by a switch of player: what the round never asked goes to the kid it was for', async () => {
    quick.mockResolvedValue(started([q('s1'), q('s2'), q('s3'), q('s4')]));
    more.mockReturnValue(pending<Question[]>().promise);
    const { result, unmount } = renderHook(() => useQuizRound('math', 5, 4));
    await flush();
    act(() => result.current.advance(0));
    // switchPlayer: no kid playing, then the quiz unmounts.
    useFamilyStore.setState({ activeKidId: null });
    unmount();
    expect(carriedFor('kid-1')).toBe(2);
    expect(carriedFor(null)).toBe(0);
  });

  it('every slot taken after the kid playing changed: the rest still go to the kid the round was for', async () => {
    quick.mockResolvedValue(started([1, 2, 3, 4, 5, 6, 7].map((n) => q(`s${n}`))));
    const { result } = renderHook(() => useQuizRound('math', 5, 4));
    await flush();
    useFamilyStore.setState({ activeKidId: 'kid-2' });
    for (let i = 0; i < 4; i++) act(() => result.current.advance(i));
    expect(result.current.asked).toHaveLength(5);
    expect(carriedFor('kid-1')).toBe(2);
    expect(carriedFor('kid-2')).toBe(0);
  });
});
