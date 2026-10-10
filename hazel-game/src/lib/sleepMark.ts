/**
 * Where a sleeping critter's "Zz" sits (#112e): a resting critter shows one
 * over it, and it must read as that critter's — never land on a neighbour's
 * face, level or name, which would make a boss look asleep or a villager look
 * like the sleeper. Pure, so the spots are tested on every map.
 */

type Point = { x: number; y: number };
/** A box by its centre and size, px. */
export type Box = Point & { w: number; h: number };

/** The "Zz" plate's size, px. */
export const ZZ_BOX = { w: 30, h: 20 } as const;

/**
 * Its spots, from the critter's centre, best first: over its head to the
 * right or left, then beside it, then under its level label.
 */
export const ZZ_SPOTS: readonly Point[] = [
  { x: 14, y: -30 },
  { x: -14, y: -30 },
  { x: 34, y: -8 },
  { x: -34, y: -8 },
  { x: 0, y: -42 },
  { x: 0, y: 48 },
];

export function overlaps(a: Box, b: Box): boolean {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
}

/** The "Zz" box at `spot` for a critter at `at`. */
export function zzBox(at: Point, spot: Point): Box {
  return { x: at.x + spot.x, y: at.y + spot.y, ...ZZ_BOX };
}

/**
 * The first spot (`ZZ_SPOTS`) whose box covers none of `others` — everyone
 * else's face, level label or name, and the critter's own label — else the
 * one covering fewest.
 */
export function zzSpot(at: Point, others: readonly Box[]): Point {
  const cost = (s: Point) => others.filter((o) => overlaps(zzBox(at, s), o)).length;
  let best = ZZ_SPOTS[0];
  for (const s of ZZ_SPOTS) {
    if (cost(s) === 0) return s;
    if (cost(s) < cost(best)) best = s;
  }
  return best;
}
