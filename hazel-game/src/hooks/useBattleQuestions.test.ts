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
import { carriedCount, clearCarried } from '../lib/questions';

beforeEach(() => {
  quick.mockReset();
  more.mockReset();
  clearCarried();
});

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
    expect(more).toHaveBeenCalledWith('math', expect.any(Number), 4, 9, [q('s1'), q('s2'), q('s3')], undefined);

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
    expect(quick).toHaveBeenCalledWith('math', expect.any(Number), 7, 4, { flavor: 'spell' });
    expect(more.mock.calls[0][5]).toBe('spell');
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
