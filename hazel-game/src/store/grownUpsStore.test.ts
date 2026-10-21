import { describe, it, expect, beforeEach, vi } from 'vitest';
import { asGrownUp, askToUnlock, noteGrownUpsOpen, resetGrownUps, unlockCancelled, unlockedAgain, useGrownUpsStore } from './grownUpsStore';
import { GrownUpsLockedError } from '../lib/grownUpsGate';

const locked = () => Object.assign(new Error('grown_ups_locked: open 👪 Grown-ups first'), { code: 'HQ001' });
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => resetGrownUps());

describe('asking for 👪 Grown-ups again mid-action (#167)', () => {
  it('a step that goes through asks for nothing; any other refusal is passed on as it is', async () => {
    await expect(asGrownUp(async () => 7)).resolves.toBe(7);
    const other = Object.assign(new Error('pin_format'), { code: 'P0001' });
    await expect(asGrownUp(async () => Promise.reject(other))).rejects.toBe(other);
    expect(useGrownUpsStore.getState().asked).toBe(false);
  });

  it('locked: asks for the gate, waits, and runs the same step again once it opens', async () => {
    const step = vi.fn().mockRejectedValueOnce(locked()).mockResolvedValueOnce('saved');
    const done = asGrownUp(step);
    await tick();
    expect(useGrownUpsStore.getState().asked).toBe(true);
    expect(step).toHaveBeenCalledTimes(1);
    unlockedAgain();
    await expect(done).resolves.toBe('saved');
    expect(step).toHaveBeenCalledTimes(2);
    expect(useGrownUpsStore.getState().asked).toBe(false);
    expect(useGrownUpsStore.getState().openedAt).toBeGreaterThan(0);
  });

  it('"Not now" ends it locked, and the step is never run again', async () => {
    const step = vi.fn().mockRejectedValue(locked());
    const done = asGrownUp(step);
    await tick();
    unlockCancelled();
    await expect(done).rejects.toBeInstanceOf(GrownUpsLockedError);
    expect(step).toHaveBeenCalledTimes(1);
    expect(useGrownUpsStore.getState().asked).toBe(false);
  });

  it('"Not now" carries the words the dialog chose for its page (#167 review round 1)', async () => {
    const done = asGrownUp(vi.fn().mockRejectedValue(locked()));
    await tick();
    unlockCancelled('Nothing changed — a grown-up needs to unlock this.');
    await expect(done).rejects.toMatchObject({ words: 'Nothing changed — a grown-up needs to unlock this.' });
  });

  it('asks twice at most: a third refusal is passed on', async () => {
    const step = vi.fn().mockRejectedValue(locked());
    const done = asGrownUp(step);
    for (let i = 0; i < 2; i += 1) {
      await tick();
      expect(useGrownUpsStore.getState().asked).toBe(true);
      unlockedAgain();
    }
    await expect(done).rejects.toMatchObject({ code: 'HQ001' });
    expect(step).toHaveBeenCalledTimes(3);
  });

  it('two steps refused at once share one ask', async () => {
    const a = vi.fn().mockRejectedValueOnce(locked()).mockResolvedValueOnce('a');
    const b = vi.fn().mockRejectedValueOnce(locked()).mockResolvedValueOnce('b');
    const both = Promise.all([asGrownUp(a), asGrownUp(b)]);
    await tick();
    unlockedAgain();
    await expect(both).resolves.toEqual(['a', 'b']);
  });

  it('signing out ends a waiting step and forgets it was ever open', async () => {
    noteGrownUpsOpen();
    const waiting = askToUnlock();
    resetGrownUps();
    await expect(waiting).rejects.toBeInstanceOf(GrownUpsLockedError);
    expect(useGrownUpsStore.getState()).toEqual({ asked: false, openedAt: null });
  });
});
