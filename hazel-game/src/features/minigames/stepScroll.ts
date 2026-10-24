/** The gap kept between what's kept in sight and what covers it, in px. */
const GAP = 8;

/**
 * How far a scroller moves as a step starts (UX review rounds 1 and 2): the
 * gold button wholly in sight, and what's kept (`keep`: the job line, or the
 * crank's gears under a stuck one) never under what sticks at the top
 * (`cover` px of the view: a stuck job line, or a phone's sticky board) — and
 * as little as that takes, so nothing moves that needn't. Where both can't be
 * in sight, `keepWins` says which gives way: the button, or what's kept. In
 * px, from the rects as they stand; positive scrolls down.
 */
export function stepScroll(p: {
  go: { top: number; bottom: number };
  keep: { top: number } | null;
  view: { top: number; bottom: number };
  cover: number;
  keepWins: boolean;
}): number {
  // At least this far down for the button's foot; at most this far for its top, and for what's kept.
  const lo = p.go.bottom + GAP - p.view.bottom;
  let hi = p.go.top - p.view.top - p.cover - GAP;
  if (p.keep) hi = Math.min(hi, p.keep.top - p.view.top - p.cover - GAP);
  if (lo <= hi) return Math.min(Math.max(0, lo), hi);
  return p.keepWins && p.keep ? hi : lo;
}
