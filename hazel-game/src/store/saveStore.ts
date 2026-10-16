import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { upsertSaveKeepalive } from '../lib/saveKeepalive';
import {
  defaultSave,
  migrateLegacy,
  normalizeSave,
  pushLibrary,
  revisionOf,
  saveIsTooNew,
  saveKey,
  saveVersionOf,
  LEGACY_KEY,
  SAVE_REVISION_CONFLICT,
  SAVE_VERSION,
  SAVE_VERSION_CONFLICT,
} from '../lib/save';
import { ROUNDS_TO_UNLOCK } from '../lib/utils';
import type { LibraryEntry, SaveData } from '../types';

/**
 * The player's save file (#37, fixes #12). Write-through persistence:
 * every update lands in localStorage immediately (keyed by user id) and is
 * pushed to the Supabase `saves` table on a debounce; `flush()` forces the
 * push (save crystals, Switch player), and a tab that is hidden or closed
 * pushes what's left at once (`flushOnHide`, a `keepalive` request — #151).
 * A missing server row falls back to the per-user localStorage copy, then the
 * legacy pre-JRPG key, then a fresh save. Supabase errors degrade gracefully
 * to local-only play (e.g. migration 0008 not applied yet) — `remoteError`
 * says why.
 *
 * Which copy wins (#151): every change adds one to the save's `revision`.
 * Loading compares this device's copy with the server's and keeps the higher
 * revision — a local copy ahead of the server's (progress made while the
 * server couldn't be reached, or a tab closed before its save went out) is
 * kept and pushed; otherwise the server's is used (on a tie too, as before
 * revisions). The server refuses a copy that isn't newer than the one it
 * holds (migration 0017), so a tab or device that fell behind can't write
 * over newer progress: it goes 'outdated' (`outdatedReason` 'elsewhere') and
 * the app asks for a refresh, and its copy on this device is marked revision
 * 0 so the refresh loads the server's. A tab also stops when another tab on
 * this browser saves newer progress (`storage`), or when it comes back into
 * view and the server holds a newer copy (`checkForNewer`) — before the kid
 * plays on in a tab that has fallen behind.
 *
 * A save written by a newer version of the game (an old tab still open after
 * an update) is never loaded or overwritten: status goes to 'outdated'
 * (`outdatedReason` 'update') and the app asks for a refresh, so this older
 * code can't strip it. Loads check `saveIsTooNew` on both copies; saves are
 * refused by the server (migration 0011), which `flush` turns into the same
 * 'outdated' state.
 */

const FLUSH_DEBOUNCE_MS = 2000;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** The `flush` push under way: they go one at a time. */
let pushing: Promise<void> | null = null;
/**
 * The newest revision sent for this player. A push on hide can overlap a
 * `flush`, and the newer one may land first and get the older one refused:
 * only the newest push's answer counts.
 */
let sentRevision = -1;
/** The revision a `keepalive` push on hide is sending (null: none) — sent once. */
let hideRevision: number | null = null;
/** Bumped on every load and clear: an answer for an earlier player or load is dropped. */
let epoch = 0;

function cancelFlush(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

/** Why the save stopped: a newer version of the game saved it, or it moved on in another tab or device. */
export type OutdatedReason = 'update' | 'elsewhere';

interface SaveStore {
  userId: string | null;
  save: SaveData | null;
  status: 'idle' | 'loading' | 'ready' | 'outdated';
  /** Why `status` is 'outdated' (#151); null otherwise. */
  outdatedReason: OutdatedReason | null;
  /** The revision the server is known to hold for this player (null: no row yet, or it couldn't be read). */
  syncedRevision: number | null;
  /** Set when remote persistence is failing (local play still works). */
  remoteError: string | null;

  load: (userId: string) => Promise<void>;
  /** Applies a change locally (and localStorage) as the next revision, and schedules a remote push. */
  update: (mutate: (s: SaveData) => SaveData) => void;
  /** Pushes the current save to Supabase now — unless the server already has it. */
  flush: () => Promise<void>;
  /**
   * The tab is being hidden or closed: pushes what the server hasn't got, in a
   * request that can outlive the page. If it fails (not a refusal), the normal
   * debounced push tries again while the page lives on.
   */
  flushOnHide: () => void;
  /** The tab is back in view: asks the server whether a newer copy was saved elsewhere meanwhile. */
  checkForNewer: () => Promise<void>;
  /**
   * A copy of this player's save at `revision` was seen elsewhere (another
   * tab, the server). Ahead of this one → this tab has fallen behind: stop and
   * ask for a refresh.
   */
  noticeCopy: (revision: number | null) => void;
  /** Records a finished training-grounds round (#37 quiz gate + library). */
  recordQuizRound: (passed: boolean, misses: LibraryEntry[]) => void;
  /** Sets a story/world flag — the most common save mutation. */
  setFlag: (flag: string) => void;
  /** Consumes one Hint Feather (no-op at zero). */
  spendHint: () => void;
  clear: () => void;
}

/** The raw localStorage copy of a user's save (null when missing or unreadable). */
function readLocalRaw(userId: string): unknown {
  try {
    const raw = localStorage.getItem(saveKey(userId));
    return raw ? JSON.parse(raw) : null;
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

export const useSaveStore = create<SaveStore>((set, get) => {
  /**
   * This tab's save lost to a newer one: stop saving and ask for a refresh.
   * After a refused push, the copy this tab left on this device is marked
   * revision 0, so the refresh loads the server's copy rather than this one
   * (another tab's newer copy there is left alone).
   */
  const stop = (reason: OutdatedReason, remoteError: string | null, demoteLocal: boolean) => {
    const { save, userId } = get();
    cancelFlush();
    if (demoteLocal && save && userId && revisionOf(readLocalRaw(userId)) === save.revision) {
      writeLocal(userId, { ...save, revision: 0 });
    }
    set({ save: null, status: 'outdated', outdatedReason: reason, remoteError });
  };

  /** Upserts `save` (with `keepalive` on hide) and acts on the answer. Never throws. */
  const push = async (userId: string, save: SaveData, keepalive = false): Promise<void> => {
    const mine = epoch;
    sentRevision = Math.max(sentRevision, save.revision);
    const row = { profile_id: userId, data: save, updated_at: new Date().toISOString() };
    let error: unknown;
    try {
      const beacon = keepalive ? upsertSaveKeepalive(row) : null;
      ({ error } = beacon ? await beacon : await supabase.from('saves').upsert(row));
    } catch (e) {
      error = e;
    }
    if (mine !== epoch) return; // the game was put away, or loaded again, meanwhile
    if (!error) {
      set((s) => ({ remoteError: null, syncedRevision: Math.max(s.syncedRevision ?? -1, save.revision) }));
      return;
    }
    const message = errorMessage(error);
    if (!message.includes(SAVE_VERSION_CONFLICT)) {
      set({ remoteError: message });
      // A save on hide that didn't get through (a dropped keepalive request, a
      // token the server refused) is sent again the normal way if the page
      // lives on: hiding cancelled the debounce that would have sent it.
      if (keepalive && !flushTimer) flushTimer = setTimeout(() => void get().flush(), FLUSH_DEBOUNCE_MS);
      return;
    }
    // Refused (migration 0011 / 0017): the server holds a newer save. Unless a
    // newer push of ours is out — then its answer decides.
    if (save.revision < sentRevision) return;
    stop(message.includes(SAVE_REVISION_CONFLICT) ? 'elsewhere' : 'update', message, true);
  };

  return {
    userId: null,
    save: null,
    status: 'idle',
    outdatedReason: null,
    syncedRevision: null,
    remoteError: null,

    load: async (userId) => {
      cancelFlush();
      const mine = ++epoch;
      sentRevision = -1;
      hideRevision = null;
      set({ userId, save: null, status: 'loading', outdatedReason: null, syncedRevision: null, remoteError: null });

      let remoteError: string | null = null;
      let serverRaw: unknown = null;
      const { data, error } = await supabase
        .from('saves')
        .select('data')
        .eq('profile_id', userId)
        .maybeSingle();
      if (mine !== epoch) return; // another kid was picked (or the game put away) meanwhile
      if (error) remoteError = errorMessage(error);
      else serverRaw = data?.data ?? null;
      const localRaw = readLocalRaw(userId);

      // Newer than this code understands — either copy: touch nothing, ask for a refresh.
      if ((serverRaw && saveIsTooNew(serverRaw)) || (localRaw && saveIsTooNew(localRaw))) {
        set({ status: 'outdated', outdatedReason: 'update', remoteError });
        return;
      }

      const server = serverRaw ? normalizeSave(serverRaw) : null;
      const local = localRaw ? normalizeSave(localRaw) : null;
      let save: SaveData | null = null;
      if (server && !(local && local.revision > server.revision)) {
        // The server's copy is as new as this device's, or newer: play on from it.
        save = server;
        // Written back only if it needs it — an older shape, or a save from
        // before revisions — and then as a new revision, like any change.
        if (saveVersionOf(serverRaw) < SAVE_VERSION || revisionOf(serverRaw) === null) {
          save = { ...save, revision: save.revision + 1 };
        }
      } else if (local) {
        // Ahead of the server's copy (progress it never got), or the only copy.
        save = local;
      }
      if (!save) {
        save = migrateLegacy(localStorage.getItem(LEGACY_KEY));
        // Consume the pre-JRPG key either way: it belongs to whoever played
        // before per-user saves existed, and must not seed the NEXT account
        // that signs in on this browser (#12).
        try {
          localStorage.removeItem(LEGACY_KEY);
        } catch {
          /* non-fatal */
        }
      }
      if (!save) save = defaultSave();

      writeLocal(userId, save);
      set({ save, status: 'ready', remoteError, syncedRevision: server ? server.revision : null });
      // Send the server what it hasn't got (a new row, a newer local copy, an
      // upgraded one) so the save follows the player to other devices.
      if (!remoteError) void get().flush();
    },

    update: (mutate) => {
      const { save, userId } = get();
      if (!save) return;
      const changed = mutate(save);
      if (changed === save) return; // nothing changed: nothing to save
      const next = { ...changed, revision: save.revision + 1 };
      set({ save: next });
      if (userId) writeLocal(userId, next);
      cancelFlush();
      flushTimer = setTimeout(() => void get().flush(), FLUSH_DEBOUNCE_MS);
    },

    flush: async () => {
      cancelFlush();
      while (pushing) await pushing;
      const { save, userId, syncedRevision } = get();
      if (!save || !userId) return;
      // The server has this copy already (saving it again would change nothing).
      if (syncedRevision !== null && save.revision <= syncedRevision) return;
      const run = push(userId, save);
      pushing = run;
      try {
        await run;
      } finally {
        if (pushing === run) pushing = null;
      }
    },

    flushOnHide: () => {
      const { save, userId, status, syncedRevision } = get();
      if (status !== 'ready' || !save || !userId) return;
      if (syncedRevision !== null && save.revision <= syncedRevision) return;
      if (hideRevision === save.revision) return; // already on its way
      cancelFlush();
      hideRevision = save.revision;
      const mine = epoch;
      void push(userId, save, true).finally(() => {
        if (mine === epoch && hideRevision === save.revision) hideRevision = null;
      });
    },

    checkForNewer: async () => {
      const { save, userId, status } = get();
      if (status !== 'ready' || !save || !userId) return;
      const mine = epoch;
      const { data, error } = await supabase
        .from('saves')
        .select('revision:data->revision')
        .eq('profile_id', userId)
        .maybeSingle();
      if (mine !== epoch || error || !data) return;
      // `data` is `{ revision }`, read the way the trigger reads it.
      get().noticeCopy(revisionOf(data));
    },

    noticeCopy: (revision) => {
      const { save, status } = get();
      if (status !== 'ready' || !save || revision === null || revision <= save.revision) return;
      // Its copy (another tab's, or the server's) is the newer one: leave it be.
      stop('elsewhere', null, false);
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

    setFlag: (flag) => {
      get().update((s) => ({ ...s, flags: { ...s.flags, [flag]: true } }));
    },

    spendHint: () => {
      get().update((s) => ({ ...s, items: { ...s.items, hint: Math.max(0, s.items.hint - 1) } }));
    },

    clear: () => {
      cancelFlush();
      epoch++;
      sentRevision = -1;
      hideRevision = null;
      set({ userId: null, save: null, status: 'idle', outdatedReason: null, syncedRevision: null, remoteError: null });
    },
  };
});

/**
 * Ties the save to the page's lifecycle (#151). Call once, at the app root;
 * returns the unsubscribe.
 * - hidden (`visibilitychange`) or leaving (`pagehide`): push what the server
 *   hasn't got (`flushOnHide`) — localStorage has it already;
 * - back in view, or restored from the back-forward cache: `checkForNewer`;
 * - another tab on this browser saved this player (`storage`): `noticeCopy`.
 */
export function watchPageForSaves(win: Window = window): () => void {
  const doc = win.document;
  const store = () => useSaveStore.getState();
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') store().flushOnHide();
    else void store().checkForNewer();
  };
  const onPageHide = () => store().flushOnHide();
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) void store().checkForNewer();
  };
  const onStorage = (e: StorageEvent) => {
    const { userId } = store();
    if (!userId || e.key !== saveKey(userId) || e.newValue === null) return;
    let theirs: unknown;
    try {
      theirs = JSON.parse(e.newValue);
    } catch {
      return;
    }
    store().noticeCopy(revisionOf(theirs));
  };
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', onPageHide);
  win.addEventListener('pageshow', onPageShow);
  win.addEventListener('storage', onStorage);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pagehide', onPageHide);
    win.removeEventListener('pageshow', onPageShow);
    win.removeEventListener('storage', onStorage);
  };
}
