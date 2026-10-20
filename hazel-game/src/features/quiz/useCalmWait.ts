import { useEffect, useState } from 'react';

/**
 * Whether a wait that may end at once is shown (#163 review): only once it
 * has lasted `delayMs`, and then for at least `minMs` — so a quick arrival
 * never shows it, and a slower one never cuts it off mid-fade. While it's
 * true after `waiting` ends, the screen keeps the wait up a moment longer.
 * `waiting` is true only while the wait's place is on screen (the quiz's
 * isn't while the last question slides out, #163 review round 2), so the
 * clock runs from when it could be seen.
 */
export function useCalmWait(waiting: boolean, delayMs: number, minMs: number): boolean {
  const [shownAt, setShownAt] = useState<number | null>(null);

  useEffect(() => {
    if (!waiting || shownAt !== null) return;
    const t = setTimeout(() => setShownAt(Date.now()), delayMs);
    return () => clearTimeout(t);
  }, [waiting, shownAt, delayMs]);

  useEffect(() => {
    if (waiting || shownAt === null) return;
    const t = setTimeout(() => setShownAt(null), Math.max(0, shownAt + minMs - Date.now()));
    return () => clearTimeout(t);
  }, [waiting, shownAt, minMs]);

  return shownAt !== null;
}

/** The quiz's first question: a saved-questions request often takes most of a second, so its wait shows only after this long. */
export const FIRST_WAIT_DELAY_MS = 800;
/** A question later in the round is in at once or after a few seconds: its wait shows after this long. */
export const WAIT_DELAY_MS = 250;
/** Once shown, the wait stays at least this long. */
export const WAIT_MIN_MS = 400;
/** A wait this long is a bug (a round's longest is `QUICK_WAIT_MS`): the way back to the topics shows. */
export const LONG_WAIT_MS = 8000;
/** What the card and the status line say then, over "Back to Topics" (#163 review round 2). */
export const LONG_WAIT_WORDS = 'This is taking a while. You can go back and pick again.';
