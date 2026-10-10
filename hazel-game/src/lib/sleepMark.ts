/**
 * A sleeping critter's "z Z" (#112e): which way they rise from its head. They
 * must read as its own — never cross someone else's face or label, a boss's
 * above all, or that one looks asleep and a child walks into a fight. Pure, so
 * every map's sleepers are tested.
 */

type Point = { x: number; y: number };
/** A box by its centre and size, px. */
export type Box = Point & { w: number; h: number };
/** A letter: what, how big, and where it starts rising from, off the sleeper's centre. */
export type Glyph = { text: string; size: number; x: number; y: number };
/** A way up: its two letters, and how far they drift sideways as they rise. */
export type ZzPath = { glyphs: readonly Glyph[]; drift: number };

/** How far a letter rises before it fades, px. */
export const ZZ_RISE_PX = 12;

/** Up and to the right, up and to the left, straight up, or out to either side — in that order. */
export const ZZ_PATHS: readonly ZzPath[] = [
  {
    glyphs: [
      { text: 'z', size: 20, x: 10, y: -20 },
      { text: 'Z', size: 27, x: 18, y: -27 },
    ],
    drift: 3,
  },
  {
    glyphs: [
      { text: 'z', size: 20, x: -10, y: -20 },
      { text: 'Z', size: 27, x: -18, y: -27 },
    ],
    drift: -3,
  },
  {
    glyphs: [
      { text: 'z', size: 20, x: -6, y: -30 },
      { text: 'Z', size: 27, x: 6, y: -38 },
    ],
    drift: 0,
  },
  // …or, with a neighbour just above, out to the side.
  {
    glyphs: [
      { text: 'z', size: 20, x: 22, y: -2 },
      { text: 'Z', size: 27, x: 32, y: -8 },
    ],
    drift: 3,
  },
  {
    glyphs: [
      { text: 'z', size: 20, x: -22, y: -2 },
      { text: 'Z', size: 27, x: -32, y: -8 },
    ],
    drift: -3,
  },
];

export function overlaps(a: Box, b: Box): boolean {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
}

/** A letter's box, `p` of the way up its rise (0–1), for a sleeper at `at`. */
export function glyphBox(at: Point, g: Glyph, drift: number, p: number): Box {
  return { x: at.x + g.x + drift * p, y: at.y + g.y - ZZ_RISE_PX * p, w: g.size * 0.6, h: g.size };
}

/** Everything a path's letters cover over a whole rise. */
export function pathBox(at: Point, path: ZzPath): Box {
  const boxes = path.glyphs.flatMap((g) => [glyphBox(at, g, path.drift, 0), glyphBox(at, g, path.drift, 1)]);
  const x0 = Math.min(...boxes.map((b) => b.x - b.w / 2));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w / 2));
  const y0 = Math.min(...boxes.map((b) => b.y - b.h / 2));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h / 2));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}

/**
 * The way up (`ZZ_PATHS`) whose letters read most surely as this sleeper's:
 * covering a boss is worst, then covering anyone else (`others`, within
 * `gap` px), then a letter nearer someone else's face (`faces` — the hero's,
 * Ember's, a neighbour's) than its own sleeper's. Ties go to the ways leading
 * away from `away` (the hero) first, then `ZZ_PATHS`' order.
 */
export function zzPath(
  at: Point,
  others: readonly (Box & { boss?: boolean })[],
  opts: { gap?: number; faces?: readonly Point[]; away?: Point } = {},
): ZzPath {
  const gap = opts.gap ?? 4;
  const faces = opts.faces ?? [];
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const cost = (path: ZzPath) => {
    const b = pathBox(at, path);
    const wide = { ...b, w: b.w + 2 * gap, h: b.h + 2 * gap };
    const covering = others.reduce((n, o) => n + (overlaps(wide, o) ? (o.boss ? 100 : 10) : 0), 0);
    const strays = path.glyphs
      .flatMap((g) => [glyphBox(at, g, path.drift, 0), glyphBox(at, g, path.drift, 1)])
      .filter((c) => faces.some((f) => dist(c, f) < dist(c, at))).length;
    return covering + strays;
  };
  const away = opts.away;
  const heading = (path: ZzPath) => {
    if (!away) return 0;
    const b = pathBox(at, path);
    return (b.x - at.x) * (away.x - at.x) + (b.y - at.y) * (away.y - at.y);
  };
  const order = [...ZZ_PATHS].sort((a, b) => heading(a) - heading(b));
  let best = order[0];
  for (const path of order) if (cost(path) < cost(best)) best = path;
  return best;
}
