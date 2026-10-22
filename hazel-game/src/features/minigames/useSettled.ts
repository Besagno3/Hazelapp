import { useCallback, useLayoutEffect, useRef } from 'react';

/** How long after a step starts its buttons wait: a double tap's second tap (§2.4). */
export const SETTLE_MS = 450;

/**
 * Whether the step (`key`) has settled: false for `SETTLE_MS` after it
 * changes. A step's change can put its next button right where a finger just
 * tapped — a double tap's second tap would press it (PR 4 review round 2: it
 * held up the mirror before a square was painted, and skipped "A perfect
 * match!"). A game checks `settled()` before acting on such a press.
 */
export function useSettled(key: string): () => boolean {
  const at = useRef(0);
  useLayoutEffect(() => {
    at.current = performance.now();
  }, [key]);
  return useCallback(() => performance.now() - at.current >= SETTLE_MS, []);
}
