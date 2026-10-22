import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { Question } from '../types';

const q = (id: string): Question => ({ id, topic: 'math', level: 4, text: id, options: ['a', 'b', 'c', 'd'], correctIndex: 0 });

const { quick, more } = vi.hoisted(() => ({ quick: vi.fn(), more: vi.fn() }));
vi.mock('../lib/questions', async (orig) => ({
  ...(await orig<typeof import('../lib/questions')>()),
  quickQuestions: quick,
  moreQuestions: more,
}));
/** A quick start with nothing coming late. */
const started = (qs: Question[]) => ({ questions: qs, late: Promise.resolve([]) });

import { useBattleQuestions } from './useBattleQuestions';
import { carriedCount, carryOver, clearCarried } from '../lib/questions';
import { useFamilyStore } from '../store/familyStore';

beforeEach(() => {
  quick.mockReset();
  more.mockReset();
  clearCarried();
  useFamilyStore.setState({ activeKidId: 'kid-1' });
});

/** `carriedCount` for `kid` (it reads the kid playing). */
function carriedFor(kid: string | null, level = 4) {
  const playing = useFamilyStore.getState().activeKidId;
  useFamilyStore.setState({ activeKidId: kid });
  const n = carriedCount('math', level);
  useFamilyStore.setState({ activeKidId: playing });
  return n;
}

describe('useBattleQuestions (#158)', () => {
  it('starts on the first saved questions, then adds the rest when they arrive', async () => {
    quick.mockResolvedValue(started([q('s1'), q('s2'), q('s3')]));
    let finish!: (qs: Question[]) => void;
    more.mockReturnValue(new Promise<Question[]>((resolve) => (finish = resolve)));

    const { result } = renderHook(() => useBattleQuestions('math', 9, 4));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    // The battle is on with three, while the rest are still being written.
    expect(result.current.questions.map((x) => x.id)).toEqual(['s1', 's2', 's3']);
    // Asked for as the kid playing (#186: a duel's Player 2 names their own).
    expect(more).toHaveBeenCalledWith('math', expect.any(Number), 4, 9, [q('s1'), q('s2'), q('s3')], undefined, 'kid-1');

    await act(async () => finish([q('n1'), q('n2'), q('n3'), q('n4'), q('n5'), q('n6')]));
    expect(result.current.questions.map((x) => x.id)).toEqual(['s1', 's2', 's3', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6']);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('a late batch for an earlier fight is dropped', async () => {
    quick.mockResolvedValueOnce(started([q('a1'), q('a2'), q('a3')])).mockResolvedValueOnce(started([q('b1'), q('b2'), q('b3')]));
    let finishA!: (qs: Question[]) => void;
    more.mockReturnValueOnce(new Promise<Question[]>((resolve) => (finishA = resolve))).mockResolvedValueOnce([]);

    const { result, rerender } = renderHook(({ level }) => useBattleQuestions('math', 9, level), { initialProps: { level: 4 } });
    await waitFor(() => expect(result.current.questions[0]?.id).toBe('a1'));
    rerender({ level: 6 });
    await waitFor(() => expect(result.current.questions[0]?.id).toBe('b1'));
    await act(async () => finishA([q('late')]));
    expect(result.current.questions.map((x) => x.id)).toEqual(['b1', 'b2', 'b3']);
  });

  it('a saved batch too slow to start with is still used, and the rest are asked for after it (review fix)', async () => {
    let land!: (qs: Question[]) => void;
    quick.mockResolvedValue({ questions: [q('st1'), q('st2'), q('st3')], late: new Promise<Question[]>((r) => (land = r)) });
    more.mockResolvedValue([q('n1')]);

    const { result } = renderHook(() => useBattleQuestions('math', 9, 4));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(more).not.toHaveBeenCalled();
    await act(async () => land([q('s1'), q('st2'), q('s2')]));
    await waitFor(() => expect(more).toHaveBeenCalled());
    // The late saved ones join (none twice), and the rest are asked for knowing about them.
    expect(more.mock.calls[0][4].map((x: Question) => x.id)).toEqual(['st1', 'st2', 'st3', 's1', 's2']);
    await waitFor(() => expect(result.current.questions.map((x) => x.id)).toEqual(['st1', 'st2', 'st3', 's1', 's2', 'n1']));
  });

  it('passes the flavour on, for the spell pool', async () => {
    quick.mockResolvedValue(started([q('x1')]));
    more.mockResolvedValue([]);
    renderHook(() => useBattleQuestions('math', 4, 7, 'spell'));
    await waitFor(() => expect(more).toHaveBeenCalled());
    expect(quick).toHaveBeenCalledWith('math', expect.any(Number), 7, 4, { flavor: 'spell', kid: 'kid-1' });
    expect(more.mock.calls[0][5]).toBe('spell');
  });

  it("a seat's pool is asked for as that kid, at their age and level, and takes their carried questions (#186)", async () => {
    carryOver('kid-2', 'math', [q('c1')]);
    carryOver('kid-1', 'math', [q('mine')]);
    quick.mockResolvedValue(started([q('x1'), q('x2'), q('x3')]));
    more.mockResolvedValue([]);
    const { result } = renderHook(() => useBattleQuestions('math', 5, undefined, undefined, { carry: true, seat: { kid: 'kid-2', age: 12, skillLevel: 4 } }));
    await waitFor(() => expect(more).toHaveBeenCalled());
    expect(quick).toHaveBeenCalledWith('math', 12, 4, 5, { flavor: undefined, have: [q('c1')], kid: 'kid-2' });
    expect(more.mock.calls[0][1]).toBe(12);
    expect(more.mock.calls[0][6]).toBe('kid-2');
    expect(result.current.age).toBe(12);
    expect(result.current.skillLevel).toBe(4);
    // Player 2's carried question was theirs to take; the kid playing's stays.
    expect(carriedFor('kid-2')).toBe(0);
    expect(carriedFor('kid-1')).toBe(1);
  });
});

describe('useBattleQuestions — a failure is logged in words, never shown (#163)', () => {
  it('logs the reason as text, not the raw error, and never errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    quick.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useBattleQuestions('math', 5, 4));
    await waitFor(() => expect(warn).toHaveBeenCalledWith('Questions failed to load:', 'boom'));
    expect(result.current.error).toBeNull();
    warn.mockRestore();
  });

  it('…and never waits for ever: with no pool yet, starter questions (#163 review)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    quick.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useBattleQuestions('math', 5, 4));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.questions).toHaveLength(5);
    expect(result.current.questions.every((x) => x.id.startsWith('starter-math-'))).toBe(true);
    warn.mockRestore();
  });
});

describe('useBattleQuestions — carry (the quiz, #163 review)', () => {
  it('a battle drops what lands after it is done with; the quiz keeps it for its next round', async () => {
    for (const carry of [false, true]) {
      clearCarried();
      quick.mockResolvedValue(started([q('s1'), q('s2'), q('s3')]));
      let finish!: (qs: Question[]) => void;
      more.mockReturnValue(new Promise<Question[]>((resolve) => (finish = resolve)));
      const { result, unmount } = renderHook(() => useBattleQuestions('math', 5, 4, undefined, { carry }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await waitFor(() => expect(more).toHaveBeenCalled());
      unmount();
      await act(async () => finish([q('n1'), q('n2')]));
      expect(carriedCount('math', 4)).toBe(carry ? 2 : 0);
    }
  });

  it('a quick start that lands after the quiz left is kept too', async () => {
    let land!: (v: { questions: Question[]; late: Promise<Question[]> }) => void;
    quick.mockReturnValue(new Promise((r) => (land = r)));
    const { unmount } = renderHook(() => useBattleQuestions('math', 5, 4, undefined, { carry: true }));
    unmount();
    await act(async () => land(started([q('s1'), q('s2'), q('starter-math-middle-1')])));
    expect(carriedCount('math', 4)).toBe(2);
  });
});

describe('useBattleQuestions — carry, review round 2 (#163)', () => {
  it('what lands once the quiz is gone goes to the kid it was for, even after a switch of player', async () => {
    quick.mockResolvedValue(started([q('s1'), q('s2'), q('s3')]));
    let finish!: (qs: Question[]) => void;
    more.mockReturnValue(new Promise<Question[]>((resolve) => (finish = resolve)));
    const { result, unmount } = renderHook(() => useBattleQuestions('math', 5, 4, undefined, { carry: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(more).toHaveBeenCalled());
    // Switch player: no kid for a moment, the quiz unmounts.
    useFamilyStore.setState({ activeKidId: null });
    unmount();
    await act(async () => finish([q('n1'), q('n2')]));
    expect(carriedFor('kid-1')).toBe(2);
    expect(carriedFor(null)).toBe(0);
  });

  it('a quick start that fails keeps the carried questions: first in the pool, or carried again once the quiz is gone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    carryOver('kid-1', 'math', [q('c1'), q('c2')]);
    quick.mockRejectedValue(new Error('boom'));
    const on = renderHook(() => useBattleQuestions('math', 5, 4, undefined, { carry: true }));
    await waitFor(() => expect(on.result.current.loading).toBe(false));
    const pool = on.result.current.questions.map((x) => x.id);
    expect(pool.slice(0, 2)).toEqual(['c1', 'c2']);
    expect(pool.slice(2).every((id) => id.startsWith('starter-math-'))).toBe(true);
    on.unmount();

    clearCarried();
    carryOver('kid-1', 'math', [q('c1'), q('c2')]);
    let fail!: (e: Error) => void;
    quick.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    const gone = renderHook(() => useBattleQuestions('math', 5, 4, undefined, { carry: true }));
    expect(carriedCount('math', 4)).toBe(0); // taken for this round
    gone.unmount();
    await act(async () => fail(new Error('boom')));
    expect(carriedCount('math', 4)).toBe(2);
    warn.mockRestore();
  });

  it("says when the quiz's bank covered its round, so nothing more was asked — never for a battle", async () => {
    quick.mockResolvedValue(started([q('s1'), q('s2'), q('s3'), q('s4'), q('s5')]));
    more.mockResolvedValue([]);
    const quiz = renderHook(() => useBattleQuestions('math', 5, 4, undefined, { carry: true }));
    await waitFor(() => expect(quiz.result.current.covered).toBe(true));
    expect(more).not.toHaveBeenCalled();
    quiz.unmount();

    const battle = renderHook(() => useBattleQuestions('math', 5, 4));
    await waitFor(() => expect(more).toHaveBeenCalled());
    expect(battle.result.current.covered).toBe(false);
  });
});
