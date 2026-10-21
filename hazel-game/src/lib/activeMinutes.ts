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
 * minute); never a minute nobody played.
 */

/** How often a minute is judged, and how recent the last key, pointer or touch must be. */
export const MINUTE_MS = 60_000;

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
 * `App`): every `MINUTE_MS`, one minute for `kid()` when `minuteCounts`.
 * Input is heard on the window before anything else handles it (a focused
 * button, the world's canvas). A tab going out of view forgets the last
 * input, so coming back needs a new one. Returns the clean-up.
 */
export function watchActiveMinutes({
  kid,
  inGame,
  win = window,
}: {
  /** The kid playing on this page, if any. */
  kid: () => string | null;
  /** Whether the game is what's on screen. */
  inGame: () => boolean;
  win?: Window;
}): () => void {
  const doc = win.document;
  let lastInputAt = Number.NEGATIVE_INFINITY;
  const onInput = () => {
    lastInputAt = Date.now();
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
    const check = { inGame: inGame(), visible: doc.visibilityState === 'visible', lastInputAt, now: Date.now() };
    if (minuteCounts(check)) void addDayMinute(id, todayIso());
  }, MINUTE_MS);
  return () => {
    win.clearInterval(timer);
    for (const type of INPUT_EVENTS) win.removeEventListener(type, onInput, listen);
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}
