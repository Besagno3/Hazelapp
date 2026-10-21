import { create } from 'zustand';
import { GrownUpsLockedError, grownUpsLocked } from '../lib/grownUpsGate';

/**
 * 👪 Grown-ups locked mid-action (#167): when the database refuses a grown-up
 * action because the window shut (15 minutes, or never opened on this
 * sign-in), the action waits — `asGrownUp` asks for the gate (`asked`), the
 * screen shows `RelockDialog` over the page (so nothing typed is lost), and
 * once the grown-up's PIN or password opens it again the same step runs
 * again. "Not now" ends it with `GrownUpsLockedError`, carrying the words
 * the dialog chose for that screen (`grownUpsLockedMessage`).
 */
interface GrownUpsStore {
  /** A refused grown-up action is waiting for the gate. */
  asked: boolean;
  /**
   * When 👪 Grown-ups was last opened in this tab (the gate, the dialog, a
   * password typed again), so its home can go back to the gate once the
   * window has run out (`GROWN_UP_UNLOCK_MINUTES`); null when it hasn't been.
   */
  openedAt: number | null;
}

export const useGrownUpsStore = create<GrownUpsStore>(() => ({ asked: false, openedAt: null }));

let pending: { promise: Promise<void>; resolve: () => void; reject: (err: Error) => void } | null = null;

/** Ask for the gate; resolves once it's open again, rejects with `GrownUpsLockedError` on "Not now". One ask at a time. */
export function askToUnlock(): Promise<void> {
  if (!pending) {
    let resolve!: () => void;
    let reject!: (err: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    pending = { promise, resolve, reject };
    useGrownUpsStore.setState({ asked: true });
  }
  return pending.promise;
}

/** 👪 Grown-ups was opened just now (the area's gate, the dialog, a password typed again). */
export function noteGrownUpsOpen(): void {
  useGrownUpsStore.setState({ openedAt: Date.now() });
}

/** The dialog opened it again: the waiting action runs again. */
export function unlockedAgain(): void {
  noteGrownUpsOpen();
  const p = pending;
  pending = null;
  useGrownUpsStore.setState({ asked: false });
  p?.resolve();
}

/** "Not now" (or the dialog went away): the waiting action ends, locked, with `words` for its page. */
export function unlockCancelled(words?: string): void {
  const p = pending;
  pending = null;
  useGrownUpsStore.setState({ asked: false });
  p?.reject(new GrownUpsLockedError(words));
}

/** Signed out: nothing waits, and the next login starts fresh. */
export function resetGrownUps(): void {
  unlockCancelled();
  useGrownUpsStore.setState({ asked: false, openedAt: null });
}

/**
 * Run a grown-up step; if the database says 👪 Grown-ups is shut, ask for the
 * gate and run the same step again once it's open (twice at most — a third
 * refusal is passed on). Each step should be one database call, so a step
 * that did go through is never repeated.
 */
export async function asGrownUp<T>(step: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await step();
    } catch (err) {
      if (!grownUpsLocked(err) || attempt >= 2) throw err;
      await askToUnlock();
    }
  }
}
