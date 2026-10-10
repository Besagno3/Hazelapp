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

/** Each letter's box over its whole rise. */
export function sweptBoxes(at: Point, path: ZzPath): Box[] {
  return path.glyphs.map((g) => {
    const a = glyphBox(at, g, path.drift, 0);
    const b = glyphBox(at, g, path.drift, 1);
    const x0 = Math.min(a.x - a.w / 2, b.x - b.w / 2);
    const x1 = Math.max(a.x + a.w / 2, b.x + b.w / 2);
    const y0 = Math.min(a.y - a.h / 2, b.y - b.h / 2);
    const y1 = Math.max(a.y + a.h / 2, b.y + b.h / 2);
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  });
}

/** Something a sleeper's letters keep clear of, and how much crossing it costs (`zzPath`). */
export type Mark = Box & { boss?: boolean; weight?: number };

/** What covering one costs: a boss's face or level 100, anyone else's (or a roof) 10, or its own `weight`. */
export const markCost = (m: Mark) => m.weight ?? (m.boss ? 100 : 10);
/**
 * The hero costs less than a neighbour (letters on them can't make a foe look
 * asleep); where Ember stands, less again; the room kept round the hero,
 * least.
 */
export const HERO_COST = 5;
export const EMBER_COST = 3;
export const HERO_ROOM_COST = 1;

/** Only coming within the gap of one costs a twentieth of covering it. */
const NEAR_MISS = 0.05;

/**
 * The way up (`ZZ_PATHS`) whose letters read most surely as this sleeper's:
 * covering a boss is worst, then covering anyone else or a roof (`others`;
 * `markCost` — coming within `gap` px of one a twentieth of that), then a letter nearer someone else's face
 * (`faces` — the hero's, Ember's, a neighbour's) than its own sleeper's. Ties
 * go to the ways leading away from `away` (the hero) first, then `ZZ_PATHS`'
 * order.
 */
export function zzPath(
  at: Point,
  others: readonly Mark[],
  opts: { gap?: number; faces?: readonly Point[]; away?: Point } = {},
): ZzPath {
  const gap = opts.gap ?? 4;
  const faces = opts.faces ?? [];
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const cost = (path: ZzPath) => {
    const swept = sweptBoxes(at, path);
    const wide = swept.map((b) => ({ ...b, w: b.w + 2 * gap, h: b.h + 2 * gap }));
    const covering = others.reduce(
      (n, o) => n + (swept.some((b) => overlaps(b, o)) ? markCost(o) : wide.some((b) => overlaps(b, o)) ? markCost(o) * NEAR_MISS : 0),
      0,
    );
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

/**
 * The roofs drawn over a map's buildings (all but the facade row), which hide
 * anything under them — but not the one the hero is inside, whose roof is off.
 */
export function roofBoxes(buildings: readonly { id: string; x: number; y: number; w: number; h: number }[], insideId: string | undefined, tile: number): Mark[] {
  return buildings
    .filter((b) => b.id !== insideId && b.h > 1)
    .map((b) => ({ x: (b.x + b.w / 2) * tile, y: (b.y + (b.h - 1) / 2) * tile, w: b.w * tile, h: (b.h - 1) * tile }));
}

/**
 * Where Ember starts, back beside a sleeper (#112e): on its far side from the
 * hero, else either side — on ground she can stand on (`ok`: walkable, or sea
 * when sailing; outdoors) and clear of everyone's face (`faces`, 20 px) —
 * else her usual spot. `dir` is the way she then trails (`lastDir`).
 */
export function emberSpot(
  hero: Point,
  sleeper: Point | null,
  ok: (x: number, y: number) => boolean,
  faces: readonly Point[],
): { dir: Point | null; at: Point } {
  const fallback = { dir: null, at: { x: hero.x - 24, y: hero.y + 8 } };
  const gap = sleeper ? Math.hypot(sleeper.x - hero.x, sleeper.y - hero.y) : 0;
  if (!sleeper || gap < 4) return fallback;
  const d = { x: (sleeper.x - hero.x) / gap, y: (sleeper.y - hero.y) / gap };
  for (const dir of [d, { x: -d.y, y: d.x }, { x: d.y, y: -d.x }]) {
    const at = { x: hero.x - dir.x * 26, y: hero.y - dir.y * 26 + 8 };
    if (ok(at.x, at.y) && !faces.some((f) => Math.hypot(f.x - at.x, f.y - at.y) < 20)) return { dir, at };
  }
  return fallback;
}
