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

/** The hero's sprite, as a box round their position (px) — and Ember's spot, kept to the same size. */
export const HERO_BOX = { w: 28, h: 36 } as const;
/** …and sailing, with the boat round them (its hull is drawn over critters). */
export const HERO_AFLOAT_BOX = { w: 48, h: 48 } as const;
/** A critter's level on the map: 11 px text on a plate 8 px wider and 4 px taller (`WorldCanvas`). */
export const LEVEL_TEXT_PX = 11;
export const levelPlate = (text: string) => ({ w: [...text].length * 7 + 8, h: LEVEL_TEXT_PX + 4 });

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
/** A face a letter shouldn't come nearer than its own sleeper's; `weight` is what that costs (default 1). */
export type Face = Point & { weight?: number };

/** What covering one costs: a boss's face or level 100, anyone else's (or a roof) 10, or its own `weight`. */
export const markCost = (m: Mark) => m.weight ?? (m.boss ? 100 : 10);
/**
 * The hero costs less than a neighbour (letters on them can't make a foe look
 * asleep); where an awake critter roams (`patchBox`), a little less; where
 * Ember stands, less again; the room kept round the hero, least.
 */
export const HERO_COST = 5;
export const PATCH_COST = 4;
export const EMBER_COST = 3;
export const HERO_ROOM_COST = 1;

/**
 * Where an awake critter roams (#112e): everywhere its leash lets it wander,
 * with its face, and its level plate riding 26 px below it. Letters rising
 * there would sit by it whenever it came by.
 */
export function patchBox(home: Point, leash: number): Mark {
  const top = home.y - leash - 16;
  const bottom = home.y + leash + 26 + LEVEL_TEXT_PX;
  return { x: home.x, y: (top + bottom) / 2, w: 2 * leash + 32, h: bottom - top, weight: PATCH_COST };
}

/** Only coming within the gap of one costs a twentieth of covering it. */
const NEAR_MISS = 0.05;
/**
 * A boss's face and level are kept this much clearer (px): letters a few px
 * under its crown label still read as its, and the boss looks asleep.
 */
export const BOSS_MARGIN = 8;
/** A letter nearer an awake critter's face than its own costs this (it could look asleep), anyone else's 1. */
export const FOE_FACE = 2;

/**
 * The way up (`ZZ_PATHS`) whose letters read most surely as this sleeper's:
 * covering a boss (or coming within `BOSS_MARGIN` of it) is worst, then
 * covering anyone else, a roof or the map's edge (`others`; `markCost` —
 * coming within `gap` px of one a twentieth of that), then a letter nearer
 * someone else's face (`faces` — an awake critter's `FOE_FACE`, the hero's,
 * Ember's, a person's 1) than its own sleeper's. Ties go to the ways leading
 * away from `away` (the hero) first, then `ZZ_PATHS`' order.
 */
export function zzPath(
  at: Point,
  others: readonly Mark[],
  opts: { gap?: number; faces?: readonly Face[]; away?: Point } = {},
): ZzPath {
  const gap = opts.gap ?? 4;
  const faces = opts.faces ?? [];
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const kept = others.map((o) => (o.boss ? { ...o, w: o.w + 2 * BOSS_MARGIN, h: o.h + 2 * BOSS_MARGIN } : o));
  const cost = (path: ZzPath) => {
    const swept = sweptBoxes(at, path);
    const wide = swept.map((b) => ({ ...b, w: b.w + 2 * gap, h: b.h + 2 * gap }));
    const covering = others.reduce(
      (n, o, i) =>
        n + (swept.some((b) => overlaps(b, kept[i])) ? markCost(o) : wide.some((b) => overlaps(b, kept[i])) ? markCost(o) * NEAR_MISS : 0),
      0,
    );
    const strays = path.glyphs
      .flatMap((g) => [glyphBox(at, g, path.drift, 0), glyphBox(at, g, path.drift, 1)])
      .reduce((n, c) => n + Math.max(0, ...faces.filter((f) => dist(c, f) < dist(c, at)).map((f) => f.weight ?? 1)), 0);
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
 * The map's edges (px), where letters rising past them are cut off: costed
 * like a roof (`zzPath`).
 */
export function edgeBoxes(cols: number, rows: number, tile: number): Mark[] {
  const w = cols * tile;
  const h = rows * tile;
  const t = 64;
  return [
    { x: w / 2, y: -t / 2, w: w + 2 * t, h: t },
    { x: w / 2, y: h + t / 2, w: w + 2 * t, h: t },
    { x: -t / 2, y: h / 2, w: t, h },
    { x: w + t / 2, y: h / 2, w: t, h },
  ];
}

/**
 * Where Ember starts, back beside a sleeper (#112e), and the way she then
 * trails (`lastDir`): on its far side from the hero, else either side — on
 * ground she can stand on (`ok`: walkable, or sea when sailing; outdoors), her
 * box (`HERO_BOX`) off everyone's face and label (`crowd`, the sleeper's too)
 * — else where she trails anyway (`trailing`, the way the hero last went). With
 * no sleeper, her usual first spot.
 */
export function emberSpot(
  hero: Point,
  sleeper: Point | null,
  ok: (x: number, y: number) => boolean,
  crowd: readonly Box[],
  trailing: Point = { x: 0, y: 1 },
): { dir: Point; at: Point } {
  if (!sleeper) return { dir: trailing, at: { x: hero.x - 24, y: hero.y + 8 } };
  const spot = (dir: Point) => ({ x: hero.x - dir.x * 26, y: hero.y - dir.y * 26 + 8 });
  const gap = Math.hypot(sleeper.x - hero.x, sleeper.y - hero.y);
  if (gap >= 4) {
    const d = { x: (sleeper.x - hero.x) / gap, y: (sleeper.y - hero.y) / gap };
    for (const dir of [d, { x: -d.y, y: d.x }, { x: d.y, y: -d.x }]) {
      const at = spot(dir);
      if (ok(at.x, at.y) && !crowd.some((b) => overlaps({ ...at, ...HERO_BOX }, b))) return { dir, at };
    }
  }
  return { dir: trailing, at: spot(trailing) };
}
