/**
 * Index's Timeline's scroll as a step starts (pure, so it's table-tested —
 * code review round 2: the effect's maths was untested, and it scrolled the
 * line out of sight). Every position is in the scroller's content (the page
 * on a phone, the board on a split screen), px.
 */
export interface StartView {
  step: 'place' | 'span' | 'done';
  /** The scroller's height. */
  view: number;
  /** The board's top (0 where the board's the scroller). */
  top: number;
  /** The foot of what must be in sight as the step starts: Check, the box under the answers, Next. */
  go: number;
  /** The furthest the board's foot may come up: no higher than the screen's. */
  foot: number;
  /** A bar kept at the screen's foot: its height (else 0). */
  bar: number;
  /** The timeline, its ends to its last place. */
  line?: { top: number; bottom: number };
  /** The washed-up cards — their grid, not their group's words (code review round 2: the how-to under them scrolled it 80 px). */
  cards?: { top: number; bottom: number };
}

/** How far to scroll as a step starts. */
export function startScroll(v: StartView): number {
  // Scrolled at least this far, a box's foot clears the bar.
  const clear = (r: { bottom: number }) => r.bottom + v.bar + 8 - v.view;
  let to: number;
  if (v.step === 'place') {
    to = Math.min(v.top, v.go + 12 - v.view);
    // The cards' last row in sight (clear of a bar), their first's top too, the board's foot no higher than the screen's —
    // and where the line's above them, its top in sight (code review round 2: at 800 × 600 the line went off the top, a
    // card tapped landing unseen).
    const above = v.line && v.cards && v.line.bottom <= v.cards.top ? v.line.top : Infinity;
    if (v.cards) to = Math.max(to, Math.min(v.cards.top, clear(v.cards), v.foot, above));
  } else if (v.bar && v.line) {
    // The years and the filed drawer on a short screen: the line's years clear of the bar kept at the foot, its top in sight
    // (UX and code review round 2: at 568 × 320 all seven under the bar).
    to = Math.min(Math.max(v.top, clear(v.line)), v.line.top);
  } else to = Math.max(v.top, v.go + 12 - v.view);
  return Math.max(0, to);
}
