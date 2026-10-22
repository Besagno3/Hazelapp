import { addDayMinute } from './playDays';
import { todayIso } from './streak';

/**
 * Active minutes played (#172), for 👪 Grown-ups → 📈 Progress: a tab can
 * sit open for hours, so a minute counts only when someone is really
 * playing — the game on screen (not sign-in, the family screens or 👪
 * Grown-ups), the tab in view, and a key, a pointer or a touch within the
 * minute. Each one goes into the kid's day on this device
 * (`lib/playDays.ts`, `addDayMinute`), sent with the day. An undercount at
 * worst (a kid reading a long question without touching anything for a
 * minute); never a minute nobody played — nor one minute twice: two windows
 * of the game on this device, both in view and used in turn, share a stamp
 * of the kid's last minute counted, and a minute counts only when none was
 * counted in the last `MINUTE_GAP_MS` (review round 1). A key, pointer or
 * touch counts only on a game screen and only for the kid playing as it came
 * (review round 2: a minute went to whoever was playing at the tick, so
 * across Switch player the outgoing kid's last part-minute — or the PIN
 * typed on "Who's playing?" — became the incoming kid's minute).
 */

/** How often a minute is judged, and how recent the last key, pointer or touch must be. */
export const MINUTE_MS = 60_000;

/** A minute counts for a kid only if this device counted none for them in this long (another window's timer runs out of step). */
export const MINUTE_GAP_MS = 55_000;

/** Where a kid's last minute counted on this device is stamped (ms), for every window of the game to see. */
export function minuteStampKey(kidId: string): string {
  return `hazel-last-minute-${kidId}`;
}

/**
 * Take the minute for `kidId` at `now` unless another window of the game on
 * this device counted one in the last `MINUTE_GAP_MS` — then it's that
 * window's minute. A stamp ahead of `now` is a clock set back: it doesn't
 * hold the minute up. Storage that can't be read or written: counted here.
 */
export function claimMinute(kidId: string, now: number): boolean {
  try {
    const last = Number(localStorage.getItem(minuteStampKey(kidId)));
    if (Number.isFinite(last) && last <= now && now - last < MINUTE_GAP_MS) return false;
    localStorage.setItem(minuteStampKey(kidId), String(now));
  } catch {
    // No storage: this window alone counts.
  }
  return true;
}

/** What a minute is judged on. */
export interface MinuteCheck {
  /** The game is what's on screen. */
  inGame: boolean;
  /** The tab is in view. */
  visible: boolean;
  /** When the last key, pointer or touch came (ms; -Infinity for none yet). */
  lastInputAt: number;
  now: number;
}

/** Whether the minute just gone counts as played. */
export function minuteCounts({ inGame, visible, lastInputAt, now }: MinuteCheck): boolean {
  return inGame && visible && now - lastInputAt <= MINUTE_MS;
}

/** A key, a pointer or a touch: someone is there. */
const INPUT_EVENTS = ['keydown', 'pointerdown', 'touchstart'] as const;

/**
 * Count the kid's active minutes while the page is open (wired once in
 * `App`): every `MINUTE_MS`, one minute for `kid()` when `minuteCounts`
 * and no other window of the game counted it (`claimMinute`).
 * Input is heard on the window before anything else handles it (a focused
 * button, the world's canvas), and stamped with the kid playing as it came
 * — only while the game is on screen (not the PIN pad, the family screens or
 * 👪 Grown-ups): a minute counts only for the kid whose input it was. A tab
 * going out of view forgets the last input, so coming back needs a new one.
 * `played`: whether the profile already counts that day as played, so the
 * minute goes up like a played day's play (`lib/playDays`, review round 2).
 * Returns the clean-up.
 */
export function watchActiveMinutes({
  kid,
  inGame,
  played,
  win = window,
}: {
  /** The kid playing on this page, if any. */
  kid: () => string | null;
  /** Whether the game is what's on screen. */
  inGame: () => boolean;
  /** Whether the profile already counts `day` as played for the kid (`profileStore.dayPlayed`). */
  played?: (kidId: string, day: string) => boolean;
  win?: Window;
}): () => void {
  const doc = win.document;
  let lastInputAt = Number.NEGATIVE_INFINITY;
  /** Whose input `lastInputAt` was. */
  let inputBy: string | null = null;
  const onInput = () => {
    if (!inGame()) return; // the PIN pad, "Who's playing?", 👪: not play
    lastInputAt = Date.now();
    inputBy = kid();
  };
  const onVisibility = () => {
    if (doc.visibilityState !== 'visible') lastInputAt = Number.NEGATIVE_INFINITY;
  };
  const listen = { capture: true, passive: true } as const;
  for (const type of INPUT_EVENTS) win.addEventListener(type, onInput, listen);
  doc.addEventListener('visibilitychange', onVisibility);
  const timer = win.setInterval(() => {
    const id = kid();
    if (!id) return;
    // Another kid's input (before a Switch player) says nothing about this kid's minute.
    const check = { inGame: inGame(), visible: doc.visibilityState === 'visible', lastInputAt: inputBy === id ? lastInputAt : Number.NEGATIVE_INFINITY, now: Date.now() };
    if (!minuteCounts(check) || !claimMinute(id, check.now)) return;
    const day = todayIso();
    void addDayMinute(id, day, { played: played?.(id, day) ?? false });
  }, MINUTE_MS);
  return () => {
    win.clearInterval(timer);
    for (const type of INPUT_EVENTS) win.removeEventListener(type, onInput, listen);
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}
