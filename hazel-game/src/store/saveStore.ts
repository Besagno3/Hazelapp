import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import {
  defaultSave,
  migrateLegacy,
  normalizeSave,
  pushLibrary,
  saveKey,
  LEGACY_KEY,
} from '../lib/save';
import { ROUNDS_TO_UNLOCK } from '../lib/utils';
import type { LibraryEntry, SaveData } from '../types';

/**
 * The player's save file (#37, fixes #12). Write-through persistence:
 * every update lands in localStorage immediately (keyed by user id) and is
 * pushed to the Supabase `saves` table on a debounce; `flush()` forces the
 * push (save crystals, sign-out). Loading prefers Supabase; a missing row
 * falls back to the per-user localStorage copy, then the legacy pre-JRPG
 * key, then a fresh save. Supabase errors degrade gracefully to local-only
 * play (e.g. migration 0008 not applied yet) — `remoteError` says why.
 */

const FLUSH_DEBOUNCE_MS = 2000;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

interface SaveStore {
  userId: string | null;
  save: SaveData | null;
  status: 'idle' | 'loading' | 'ready';
  /** Set when remote persistence is failing (local play still works). */
  remoteError: string | null;

  load: (userId: string) => Promise<void>;
  /** Applies a change locally (and localStorage) and schedules a remote push. */
  update: (mutate: (s: SaveData) => SaveData) => void;
  /** Pushes the current save to Supabase immediately. */
  flush: () => Promise<void>;
  /** Records a finished training-grounds round (#37 quiz gate + library). */
  recordQuizRound: (passed: boolean, misses: LibraryEntry[]) => void;
  clear: () => void;
}

function readLocal(userId: string): SaveData | null {
  try {
    const raw = localStorage.getItem(saveKey(userId));
    return raw ? normalizeSave(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(userId: string, save: SaveData): void {
  try {
    localStorage.setItem(saveKey(userId), JSON.stringify(save));
  } catch {
    // Quota/private-mode failures are non-fatal — Supabase still persists.
  }
}

export const useSaveStore = create<SaveStore>((set, get) => ({
  userId: null,
  save: null,
  status: 'idle',
  remoteError: null,

  load: async (userId) => {
    set({ userId, status: 'loading', remoteError: null });

    let save: SaveData | null = null;
    let remoteError: string | null = null;
    const { data, error } = await supabase
      .from('saves')
      .select('data')
      .eq('profile_id', userId)
      .maybeSingle();
    if (error) {
      remoteError = errorMessage(error);
    } else if (data?.data) {
      save = normalizeSave(data.data);
    }

    if (!save) save = readLocal(userId);
    if (!save) save = migrateLegacy(localStorage.getItem(LEGACY_KEY));
    if (!save) save = defaultSave();

    writeLocal(userId, save);
    set({ save, status: 'ready', remoteError });
    // Seed the remote row so the save follows the player to other devices.
    if (!remoteError) void get().flush();
  },

  update: (mutate) => {
    const { save, userId } = get();
    if (!save) return;
    const next = mutate(save);
    set({ save: next });
    if (userId) writeLocal(userId, next);
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => void get().flush(), FLUSH_DEBOUNCE_MS);
  },

  flush: async () => {
    const { save, userId } = get();
    if (!save || !userId) return;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const { error } = await supabase
      .from('saves')
      .upsert({ profile_id: userId, data: save, updated_at: new Date().toISOString() });
    set({ remoteError: error ? errorMessage(error) : null });
  },

  recordQuizRound: (passed, misses) => {
    get().update((s) => {
      const passedRounds = s.passedRounds + (passed ? 1 : 0);
      return {
        ...s,
        passedRounds,
        worldUnlocked: s.worldUnlocked || passedRounds >= ROUNDS_TO_UNLOCK,
        library: pushLibrary(s.library, misses),
      };
    });
  },

  clear: () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    set({ userId: null, save: null, status: 'idle', remoteError: null });
  },
}));
