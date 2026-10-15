import { WALKABLE_CHARS, buildingAt, type TravelMode, type ZoneDef } from '../content/zones';
import { reach, reachPath, type Cell, type ReachOptions } from './reach';

/**
 * Using things in the world (#127): chests, gates, the save crystal, Spire
 * seals and stairs, shop counters and people all wait for the hero to press
 * to use them — Space, Enter, a click or tap on the world, or the ✋ button —
 * instead of going off the moment they're bumped. Pure helpers, unit-tested
 * in interact.test.ts; `WorldCanvas` wires them to KaPlay. Also here: the
 * doorway corner assist and the way a person steps aside for a hero who
 * keeps walking into them.
 */

export type Dir = { x: number; y: number };

/** Space and Enter use whatever the hero faces (a click or tap on the world and the ✋ button do too). */
export function isInteractKey(e: Pick<KeyboardEvent, 'key' | 'code'>): boolean {
  return e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter' || e.code === 'Space';
}

/**
 * Is a key press aimed at something that keeps it for itself — a focused
 * button, link or field, or anything in an open dialog? Then Space / Enter
 * work it, as they should, and don't also use what the hero faces.
 */
export function ownsKeys(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el || typeof el.closest !== 'function') return false;
  return (
    el.closest(
      'button, a[href], input, textarea, select, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="dialog"]',
    ) !== null
  );
}

/** How far (px) past the hero's box a chest, gate or crystal can be and still be used. */
export const USE_REACH = 10;
/** How far (px) past touching a person can be and still be talked to. */
export const TALK_REACH = 10;
/** A person counts as in front of the hero within about ±53° of the way they face. */
const FRONT_COS = 0.6;

const CARDINALS: readonly Dir[] = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

/**
 * The four ways to look for something to use: the way the hero faces first
 * (both ways of a diagonal, the stronger first), then to either side, then
 * behind — so the thing in front always wins, but a chest beside them still
 * opens.
 */
export function probeDirs(last: Dir): Dir[] {
  const first: Dir[] = [];
  const sx = Math.sign(last.x);
  const sy = Math.sign(last.y);
  if (sx !== 0 && Math.abs(last.x) >= Math.abs(last.y)) {
    first.push({ x: sx, y: 0 });
    if (sy !== 0) first.push({ x: 0, y: sy });
  } else if (sy !== 0) {
    first.push({ x: 0, y: sy });
    if (sx !== 0) first.push({ x: sx, y: 0 });
  } else {
    first.push({ x: 0, y: 1 }); // never moved: facing the camera, as they spawn
  }
  const facing = first[0];
  const rest = CARDINALS.filter((d) => !first.some((f) => f.x === d.x && f.y === d.y));
  // To the sides before behind.
  rest.sort((a, b) => Number(a.x === -facing.x && a.y === -facing.y) - Number(b.x === -facing.x && b.y === -facing.y));
  return [...first, ...rest];
}

/**
 * Points just past the side of the hero's box (`half` from its centre) that
 * faces `dir`: the middle first, then by each corner — whatever tile is
 * there is what they'd use.
 */
export function probePoints(x: number, y: number, dir: Dir, half: number, reachPx = USE_REACH): Dir[] {
  const edge = half + reachPx;
  const side = half - 2;
  if (dir.x !== 0) {
    const px = x + dir.x * edge;
    return [
      { x: px, y },
      { x: px, y: y - side },
      { x: px, y: y + side },
    ];
  }
  const py = y + dir.y * edge;
  return [
    { x, y: py },
    { x: x - side, y: py },
    { x: x + side, y: py },
  ];
}

/** Is someone at `a` within `reachPx` of the hero at `h`, and on the `dir` side of them? */
export function inFront(h: Dir, a: Dir, dir: Dir, reachPx: number): boolean {
  const dx = a.x - h.x;
  const dy = a.y - h.y;
  const d = Math.hypot(dx, dy);
  if (d >= reachPx) return false;
  if (d === 0) return true;
  return (dx * dir.x + dy * dir.y) / d > FRONT_COS;
}

/** What the prompt over the thing says: "Space: Open chest", or on a touch screen "Tap: Open chest". */
export function promptText(label: string, touch: boolean): string {
  return `${touch ? 'Tap' : 'Space'}: ${label}`;
}

/** How far (px) off an opening's middle the hero can be and still slide into it (`cornerTarget`). */
export const CORNER_ASSIST = 20;

/**
 * Doorway corner assist (#127). The hero's box (22 px) is narrower than a
 * tile (32 px), so a one-tile door, gate or corridor only lets them through
 * while they're within ±5 px of its middle — a few frames of a held arrow
 * key, and a corner clipping the frame stopped them dead. Walking straight
 * into a wall with an opening just off to the side, they now slide over into
 * it: this is the centre (px, along the wall) of the open cell nearest
 * `centre` within `reachPx`, or null when there's none that near. `open(c)`
 * says whether cell `c` (counted along the wall, in the row they're walking
 * into) lets them in.
 */
export function cornerTarget(centre: number, open: (cell: number) => boolean, tile: number, reachPx = CORNER_ASSIST): number | null {
  const c0 = Math.floor(centre / tile);
  let best: number | null = null;
  for (const c of [c0, c0 - 1, c0 + 1]) {
    if (!open(c)) continue;
    const mid = c * tile + tile / 2;
    if (Math.abs(mid - centre) > reachPx) continue;
    if (best === null || Math.abs(mid - centre) < Math.abs(best - centre)) best = mid;
  }
  return best;
}

/** The step (px) to slide this frame towards `target`, at most `max` — 0 when there. */
export function slideStep(centre: number, target: number, max: number): number {
  const d = target - centre;
  return Math.sign(d) * Math.min(Math.abs(d), max);
}

/** Walking into the same person this long (seconds) and they step out of the way (#127). */
export const SCOOT_AFTER_S = 1.5;
/** How fast they step aside (px/s) — quicker than the hero walks (170). */
export const SCOOT_SPEED = 260;
/** The fewest, best and most steps they take getting out of the way. */
const SCOOT_MIN = 2;
const SCOOT_IDEAL = 3;
const SCOOT_MAX = 5;

/**
 * Who walking into counts as pushing (#127): a person, never a thing — a
 * quest board, a lantern, a signpost (`isThing`, 15c review round 4).
 */
export function pushTarget<T extends { kind: string; npcId?: string }>(into: T | null, isThingId: (id: string) => boolean): T | null {
  return into && into.kind === 'npc' && !(into.npcId && isThingId(into.npcId)) ? into : null;
}

/** Who the hero is walking into now, and for how long — null once they stop or turn away. */
export type Push<T> = { who: T; t: number } | null;
export function pushOn<T>(push: Push<T>, who: T | null, dt: number): Push<T> {
  if (who === null) return null;
  return push && push.who === who ? { who, t: push.t + dt } : { who, t: dt };
}

const NOT_FOR_PEOPLE = new Set(['H', 'D', 'E', 'P', '>', '<']);
/**
 * Where a person may step or stand: walkable ground on foot — never a hidden
 * passage (stepping into one would give it away), a door, an exit, stairs or a
 * place icon, where they'd be in everyone's way again.
 */
export function personPassable(ch: string, mode: TravelMode): boolean {
  return mode === 'foot' && WALKABLE_CHARS.has(ch) && !NOT_FOR_PEOPLE.has(ch);
}

const manhattan = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const chebyshev = (a: Cell, b: Cell) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/**
 * The way a person steps aside for a hero who keeps walking into them
 * (#127): cell by cell (start included) to a spot a few steps away — off the
 * line the hero is walking (`push`, from their cell `hero`) if there is one,
 * at least two cells from them, never past a wall, into or out of a building
 * (`buildingAt` stays the same), onto an exit or into fog. Cells `blocked`
 * says (other people) are kept off. Hemmed in — a dead-end corridor — they
 * squeeze past the hero (through `heroCells`) to the other side. Null when
 * there's nowhere to go.
 */
export function scootPath(
  z: ZoneDef,
  o: {
    from: Cell;
    hero: Cell;
    heroCells: readonly Cell[];
    push: Dir;
    flags: Record<string, boolean>;
    blocked?: (x: number, y: number) => boolean;
  },
): Cell[] | null {
  const key = (x: number, y: number) => `${x},${y}`;
  const heroAt = new Set(o.heroCells.map((c) => key(c.x, c.y)));
  heroAt.add(key(o.hero.x, o.hero.y));
  const exits = new Set(z.exits.map((e) => key(e.x, e.y)));
  const inside = buildingAt(z, o.from.x, o.from.y)?.id ?? null;
  const kept = (x: number, y: number) =>
    exits.has(key(x, y)) || (buildingAt(z, x, y)?.id ?? null) !== inside || o.blocked?.(x, y) === true;
  const cost = (c: Cell) => {
    const ahead = (c.x - o.hero.x) * o.push.x + (c.y - o.hero.y) * o.push.y;
    const off = o.push.x !== 0 ? Math.abs(c.y - o.hero.y) : Math.abs(c.x - o.hero.x);
    const inTheWay = off === 0 && ahead > 0;
    return (inTheWay ? 8 : 0) + Math.abs(manhattan(c, o.from) - SCOOT_IDEAL) - Math.min(chebyshev(c, o.hero), 4) * 0.25;
  };
  for (const squeeze of [false, true]) {
    const opts: ReachOptions = {
      from: o.from,
      flags: o.flags,
      gates: 'flags',
      passable: personPassable,
      blocked: (x, y) => kept(x, y) || (!squeeze && heroAt.has(key(x, y))),
    };
    const spots = [...reach(z, opts)]
      .map((s) => {
        const [x, y] = s.split(',').map(Number);
        return { x, y };
      })
      .filter((c) => {
        const d = manhattan(c, o.from);
        return !heroAt.has(key(c.x, c.y)) && chebyshev(c, o.hero) >= 2 && d >= SCOOT_MIN && d <= SCOOT_MAX;
      })
      .sort((a, b) => cost(a) - cost(b) || a.y - b.y || a.x - b.x);
    // The best few, by the way there: a spot two cells off past a wall can be a long walk round.
    for (const c of spots.slice(0, 8)) {
      const path = reachPath(z, (x, y) => x === c.x && y === c.y, opts);
      if (path && path.length - 1 <= SCOOT_MAX + 2) return path.map(({ x, y }) => ({ x, y }));
    }
  }
  return null;
}

/** Tiles someone can be talked to across (#72, #127): a shop counter, and a desk or table — an innkeeper's, say. */
export const COUNTER_CHARS = new Set(['K', 'T']);

/**
 * Who the hero at `hero` talks to across the counter or desk centred at
 * `counter` (px): the nearest of `people` within 1.6 tiles of it, on its far
 * side from the hero — never someone standing on the hero's own side of it.
 * The index into `people`, or -1.
 */
export function acrossCounter(counter: Dir, hero: Dir, people: readonly Dir[], tile: number): number {
  let best = -1;
  let bestD = Infinity;
  people.forEach((p, i) => {
    const d = Math.hypot(p.x - counter.x, p.y - counter.y);
    const beyond = (p.x - counter.x) * (counter.x - hero.x) + (p.y - counter.y) * (counter.y - hero.y) > 0;
    if (d < tile * 1.6 && beyond && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}
