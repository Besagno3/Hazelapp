/** Ringwood's Rings' taps: which ring a point on the wood is (pure, so it's tested by itself). */

/** Past the bark (or the core's ends), how near a tap must land to a ring (px) to be that ring. */
export const TAP_REACH_PX = 14;
/** However thin a ring's drawn, it's this wide to hit (px) — where it's thinner than its neighbours, it wins. */
export const RING_MIN_PX = 24;
/** A ring the step wants (the next to count, a wet year, a dry year not found) is this wide to hit (px): UX review round 1. */
export const WANT_PX = 32;

/** A ring along the way out: where it starts and ends, in the wood's units. */
export type Band = { from: number; to: number };

/** Whether the step wants a ring: no; yes; or yes, reaching only outward (the next to count — not back into one counted). */
export type Want = (k: number) => boolean | 'out';

/**
 * The wood's tap: the ring a point (`at`, along the way out, in the bands'
 * units; `unit` of them a px) is on. A ring the step wants is `WANT_PX` wide to
 * hit, and any ring at least `RING_MIN_PX` — where they overlap, the thinner
 * wins (its neighbours are easy to hit elsewhere) — but never reaching into a
 * neighbour's middle third (bench: a dry ring took the tap on the middle of the
 * ring by it, on a core 8 px a year); past the wood's ends, the nearest within
 * `reach` px. Code review round 1: a thin ring was as thin to hit as it's
 * drawn, and a tap just off it went to its neighbour.
 */
export function ringAt(at: number, bands: readonly Band[], unit: number, want: Want, reach: number): number | null {
  const width = (b: Band | undefined) => (b ? b.to - b.from : Infinity);
  const pick = (grow: (b: Band, k: number) => { lo: number; hi: number } | null, better: (a: Band, b: Band) => boolean) => {
    let best: number | null = null;
    bands.forEach((b, k) => {
      const g = grow(b, k);
      if (g === null) return;
      const lo = b.from - Math.min(g.lo, width(bands[k - 1]) / 3);
      const hi = b.to + Math.min(g.hi, width(bands[k + 1]) / 3);
      if (at < lo || at > hi) return;
      if (best === null || better(b, bands[best])) best = k;
    });
    return best;
  };
  const near = (a: Band, b: Band) => Math.abs(at - (a.from + a.to) / 2) < Math.abs(at - (b.from + b.to) / 2);
  // How far past its edges a ring reaches, to be `px` wide to hit (none if it's that wide already).
  const grow = (b: Band, px: number) => Math.max(0, (px * unit - (b.to - b.from)) / 2);
  const wanted = pick((b, k) => {
    const w = want(k);
    if (!w) return null;
    const g = grow(b, WANT_PX);
    // The next to count reaches outward only: a second tap on the ring just counted isn't the next (code review round 2).
    return { lo: w === 'out' ? 0 : g, hi: g };
  }, near);
  if (wanted !== null) return wanted;
  const any = pick(
    (b, k) => ({ lo: want(k) === 'out' ? 0 : grow(b, RING_MIN_PX), hi: grow(b, RING_MIN_PX) }),
    (a, b) => a.to - a.from < b.to - b.from || (a.to - a.from === b.to - b.from && near(a, b)),
  );
  if (any !== null) return any;
  const first = bands[0];
  const last = bands[bands.length - 1];
  if (at < first.from && first.from - at <= reach * unit) return 0;
  if (at > last.to && at - last.to <= reach * unit) return bands.length - 1;
  return null;
}
