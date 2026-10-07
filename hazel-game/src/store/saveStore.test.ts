import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSaveStore } from './saveStore';
import { defaultSave, saveKey, SAVE_VERSION, SAVE_VERSION_CONFLICT } from '../lib/save';

// The Supabase `saves` table, faked: one row to read back, the upserts made,
// and the error the next upserts fail with (null = they succeed).
const remote = vi.hoisted(() => ({
  row: null as unknown,
  upserts: [] as unknown[],
  upsertError: null as unknown,
}));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: remote.row, error: null }) }) }),
      upsert: async (r: unknown) => {
        remote.upserts.push(r);
        return { error: remote.upsertError };
      },
    }),
  },
}));
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

describe('saveStore.load', () => {
  beforeEach(() => {
    remote.row = null;
    remote.upserts = [];
    remote.upsertError = null;
    localStorage.clear();
  });

  it('upgrades a v1 save from the server and saves it back as v2 (#75 item 8)', async () => {
    remote.row = { data: { version: 1, zoneId: 'lumina-field', pos: { x: 5, y: 5 }, coins: 7, sageEquipped: 'math' } };
    await useSaveStore.getState().load('u1');
    const { save, status } = useSaveStore.getState();
    expect(status).toBe('ready');
    expect(save).toMatchObject({ version: 2, zoneId: 'lumina-village', pos: null, coins: 7 });
    expect(JSON.parse(localStorage.getItem(saveKey('u1'))!).version).toBe(2);
    expect(remote.upserts).toHaveLength(1);
  });

  it('refuses a save from a newer version: nothing loaded, nothing written back', async () => {
    const newer = { version: SAVE_VERSION + 1, zoneId: 'somewhere-new', coins: 999 };
    remote.row = { data: newer };
    await useSaveStore.getState().load('u2');
    expect(useSaveStore.getState().status).toBe('outdated');
    expect(useSaveStore.getState().save).toBeNull();
    expect(localStorage.getItem(saveKey('u2'))).toBeNull();
    expect(remote.upserts).toHaveLength(0);
  });

  it('refuses a newer local copy too (no server row)', async () => {
    const newer = JSON.stringify({ version: SAVE_VERSION + 1, coins: 5 });
    localStorage.setItem(saveKey('u3'), newer);
    await useSaveStore.getState().load('u3');
    expect(useSaveStore.getState().status).toBe('outdated');
    expect(localStorage.getItem(saveKey('u3'))).toBe(newer);
    expect(remote.upserts).toHaveLength(0);
  });
});

describe('saveStore.flush', () => {
  beforeEach(() => {
    remote.row = null;
    remote.upserts = [];
    remote.upsertError = null;
    localStorage.clear();
  });

  it('a newer save on the server (migration 0011 refuses ours) stops saving and asks for a refresh (#101h)', async () => {
    await useSaveStore.getState().load('u4');
    remote.upsertError = {
      message: `${SAVE_VERSION_CONFLICT}: this save was written by a newer version of the game (v${SAVE_VERSION + 1}), refusing v${SAVE_VERSION}`,
      code: 'P0001',
      hint: 'Refresh the page to update the game.',
    };
    useSaveStore.getState().setFlag('after-the-update');
    await useSaveStore.getState().flush();
    expect(useSaveStore.getState().status).toBe('outdated');
    expect(useSaveStore.getState().save).toBeNull();
    // Nothing more to push: later changes are dropped, not retried over the newer save.
    const pushed = remote.upserts.length;
    useSaveStore.getState().setFlag('another');
    await useSaveStore.getState().flush();
    expect(remote.upserts).toHaveLength(pushed);
  });

  it('any other server error keeps local play going and just reports it', async () => {
    await useSaveStore.getState().load('u5');
    remote.upsertError = { message: 'relation "public.saves" does not exist', code: '42P01' };
    await useSaveStore.getState().flush();
    expect(useSaveStore.getState().status).toBe('ready');
    expect(useSaveStore.getState().save).not.toBeNull();
    expect(useSaveStore.getState().remoteError).toContain('does not exist');
  });
});
