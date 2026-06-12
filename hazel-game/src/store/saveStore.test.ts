import { describe, it, expect, beforeEach } from 'vitest';
import { useSaveStore } from './saveStore';
import { defaultSave } from '../lib/save';
import { ROUNDS_TO_UNLOCK } from '../lib/utils';
import type { Question } from '../types';

const q: Question = {
  id: 'q1',
  topic: 'math',
  level: 3,
  text: '?',
  options: ['a', 'b', 'c', 'd'],
  correctIndex: 0,
};

// userId stays null in these tests → no localStorage/Supabase writes,
// pure in-memory behavior.
beforeEach(() => {
  useSaveStore.setState({ userId: null, save: defaultSave(), status: 'ready', remoteError: null });
});

describe('saveStore.update', () => {
  it('applies a mutation to the save', () => {
    useSaveStore.getState().update((s) => ({ ...s, coins: 99 }));
    expect(useSaveStore.getState().save?.coins).toBe(99);
  });
});

describe('saveStore.recordQuizRound', () => {
  it('counts passed rounds and unlocks the world at the threshold', () => {
    const store = useSaveStore.getState();
    for (let i = 0; i < ROUNDS_TO_UNLOCK; i++) {
      expect(useSaveStore.getState().save?.worldUnlocked).toBe(false);
      store.recordQuizRound(true, []);
    }
    expect(useSaveStore.getState().save?.passedRounds).toBe(ROUNDS_TO_UNLOCK);
    expect(useSaveStore.getState().save?.worldUnlocked).toBe(true);
  });

  it('failed rounds do not count toward the unlock', () => {
    for (let i = 0; i < ROUNDS_TO_UNLOCK; i++) {
      useSaveStore.getState().recordQuizRound(false, []);
    }
    expect(useSaveStore.getState().save?.worldUnlocked).toBe(false);
  });

  it('queues misses into the library', () => {
    useSaveStore.getState().recordQuizRound(false, [{ question: q, picked: 2 }]);
    expect(useSaveStore.getState().save?.library).toHaveLength(1);
    expect(useSaveStore.getState().save?.library[0].question.id).toBe('q1');
  });
});

describe('saveStore.clear', () => {
  it('drops the save and user', () => {
    useSaveStore.getState().clear();
    expect(useSaveStore.getState().save).toBeNull();
    expect(useSaveStore.getState().status).toBe('idle');
  });
});
