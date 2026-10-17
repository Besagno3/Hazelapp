import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { Question } from '../types';

const q = (id: string): Question => ({ id, topic: 'math', level: 4, text: id, options: ['a', 'b', 'c', 'd'], correctIndex: 0 });

const { quick, more } = vi.hoisted(() => ({ quick: vi.fn(), more: vi.fn() }));
vi.mock('../lib/questions', () => ({ quickQuestions: quick, moreQuestions: more }));

import { useBattleQuestions } from './useBattleQuestions';

beforeEach(() => {
  quick.mockReset();
  more.mockReset();
});

describe('useBattleQuestions (#158)', () => {
  it('starts on the first saved questions, then adds the rest when they arrive', async () => {
    quick.mockResolvedValue([q('s1'), q('s2'), q('s3')]);
    let finish!: (qs: Question[]) => void;
    more.mockReturnValue(new Promise<Question[]>((resolve) => (finish = resolve)));

    const { result } = renderHook(() => useBattleQuestions('math', 9, 4));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    // The battle is on with three, while the rest are still being written.
    expect(result.current.questions.map((x) => x.id)).toEqual(['s1', 's2', 's3']);
    expect(more).toHaveBeenCalledWith('math', expect.any(Number), 4, 9, [q('s1'), q('s2'), q('s3')]);

    await act(async () => finish([q('n1'), q('n2'), q('n3'), q('n4'), q('n5'), q('n6')]));
    expect(result.current.questions.map((x) => x.id)).toEqual(['s1', 's2', 's3', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6']);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('a late batch for an earlier fight is dropped', async () => {
    quick.mockResolvedValueOnce([q('a1'), q('a2'), q('a3')]).mockResolvedValueOnce([q('b1'), q('b2'), q('b3')]);
    let finishA!: (qs: Question[]) => void;
    more.mockReturnValueOnce(new Promise<Question[]>((resolve) => (finishA = resolve))).mockResolvedValueOnce([]);

    const { result, rerender } = renderHook(({ level }) => useBattleQuestions('math', 9, level), { initialProps: { level: 4 } });
    await waitFor(() => expect(result.current.questions[0]?.id).toBe('a1'));
    rerender({ level: 6 });
    await waitFor(() => expect(result.current.questions[0]?.id).toBe('b1'));
    await act(async () => finishA([q('late')]));
    expect(result.current.questions.map((x) => x.id)).toEqual(['b1', 'b2', 'b3']);
  });
});
