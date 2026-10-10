import {
  LANDING_CHARS,
  SEA_CHARS,
  WALKABLE_CHARS,
  nearestCell,
  tileAt,
  type Side,
  type TravelMode,
  type ZoneDef,
  type ZoneId,
} from '../content/zones';
import type { Habitat } from '../types';

/**
 * Getting about on land and sea (#75 roadmap item 14, §2.2–2.3). On foot the
 * hero walks the walkable tiles; in Marlow's boat they sail open sea ('~'),
 * a little faster, and go ashore only at a beach or a dock. Sailing off an
 * edge that a `SeaLink` joins to another map carries the boat (and hero) over.
 */

/** The boat is quicker than walking (§2.2): 1.5× the hero's pace. */
export const BOAT_SPEED = 1.5;

/** Can this mode cross a cell holding `ch`? (Fog, dark and gates are the canvas's business.) */
export function passable(ch: string, mode: TravelMode): boolean {
  return mode === 'boat' ? SEA_CHARS.has(ch) : WALKABLE_CHARS.has(ch);
}

/**
 * Which critters a hero getting about each way can meet (#75 item 14d): on
 * foot, land critters; in the boat, sea critters. A `Record`, so a new travel
 * mode doesn't compile until it says — Ember's flight (item 15b) will meet
 * none (`null`: flying has no battles).
 */
const ENCOUNTER_HABITAT: Record<TravelMode, Habitat | null> = { foot: 'land', boat: 'sea' };

export function encounterHabitat(mode: TravelMode): Habitat | null {
  return ENCOUNTER_HABITAT[mode];
}

/**
 * Does a critter living in `habitat` (missing = land) fight a hero getting
 * about this way? A sea critter only fights a sailing hero, and a land
 * critter never does — so a hero on a beach is never bumped into battle from
 * the water, nor a sailing one from the shore (#108j).
 */
export function meetsHero(habitat: Habitat | undefined, mode: TravelMode): boolean {
  const meets = encounterHabitat(mode);
  return meets !== null && (habitat ?? 'land') === meets;
}

/** Can a boat put the hero ashore onto a cell holding `ch`? */
export function canLand(ch: string): boolean {
  return LANDING_CHARS.has(ch);
}

/** Which edge of the map a cell sits on, if any (a corner reads as its east / west edge). */
export function edgeOf(z: Pick<ZoneDef, 'map'>, x: number, y: number): Side | null {
  const cols = z.map[0].length;
  const rows = z.map.length;
  if (x === 0) return 'west';
  if (x === cols - 1) return 'east';
  if (y === 0) return 'north';
  if (y === rows - 1) return 'south';
  return null;
}

const OPPOSITE: Record<Side, Side> = { north: 'south', south: 'north', east: 'west', west: 'east' };

export function oppositeSide(side: Side): Side {
  return OPPOSITE[side];
}

export interface SeaCrossing {
  side: Side;
  to: ZoneId;
  /** The cell the boat comes out at on `to` — one in from the opposite edge. */
  x: number;
  y: number;
}

/**
 * Sailing off the map here: where the boat comes out, or null when this cell
 * isn't on a linked edge (or the far side isn't open sea — then the edge is
 * simply the end of the water, like any other).
 */
export function seaCrossing(z: ZoneDef, x: number, y: number, zones: Record<ZoneId, ZoneDef>): SeaCrossing | null {
  if (!z.seaLinks?.length || !SEA_CHARS.has(tileAt(z, x, y))) return null;
  const cols = z.map[0].length;
  const rows = z.map.length;
  const sides: Side[] = [];
  if (x === 0) sides.push('west');
  if (x === cols - 1) sides.push('east');
  if (y === 0) sides.push('north');
  if (y === rows - 1) sides.push('south');
  for (const side of sides) {
    const link = z.seaLinks.find((l) => l.side === side);
    if (!link) continue;
    const t = zones[link.to];
    const tCols = t.map[0].length;
    const tRows = t.map.length;
    const shift = link.shift ?? 0;
    const out =
      side === 'east'
        ? { x: 1, y: y + shift }
        : side === 'west'
          ? { x: tCols - 2, y: y + shift }
          : side === 'south'
            ? { x: x + shift, y: 1 }
            : { x: x + shift, y: tRows - 2 };
    if (out.x < 0 || out.y < 0 || out.x >= tCols || out.y >= tRows) continue;
    if (!SEA_CHARS.has(tileAt(t, out.x, out.y))) continue;
    return { side, to: link.to, ...out };
  }
  return null;
}

/**
 * The open-sea cell nearest (x, y) within `reach` cells (the cell itself
 * first) — where a boat moors when the hero leaves it mid-voyage. `ok` can
 * rule cells out (say, under fog). Null when there's no sea that close.
 */
export function nearestSea(
  z: ZoneDef,
  x: number,
  y: number,
  reach = 2,
  ok: (x: number, y: number) => boolean = () => true,
): { x: number; y: number } | null {
  return nearestCell(x, y, reach, (cx, cy) => SEA_CHARS.has(tileAt(z, cx, cy)) && ok(cx, cy));
}

type Cell = { x: number; y: number };
const nextTo = (a: Cell, b: Cell) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;

/**
 * Where the boat is left when the hero, afloat in cell `from`, goes ashore on
 * the beach or dock `to`: right where they were when `to` is straight ahead;
 * after a landing at a corner, the open sea beside `to` on their side instead,
 * so the boat is never left touching the shore only corner to corner. Null
 * when neither is open sea (`ok` can rule cells out) — then there's no landing.
 */
export function landingMooring(
  z: ZoneDef,
  from: Cell,
  to: Cell,
  ok: (x: number, y: number) => boolean = () => true,
): Cell | null {
  if (Math.abs(to.x - from.x) + Math.abs(to.y - from.y) === 1) return from;
  const sx = Math.sign(to.x - from.x);
  const sy = Math.sign(to.y - from.y);
  for (const c of [
    { x: to.x - sx, y: to.y },
    { x: to.x, y: to.y - sy },
  ]) {
    if (SEA_CHARS.has(tileAt(z, c.x, c.y)) && ok(c.x, c.y)) return c;
  }
  return null;
}

/**
 * On foot in cell `hero`, bumping the sea cell `bumped` climbs into the boat
 * moored at `boat` when both are next to it — diagonals too, so a boat by a
 * corner of the shore, or a hero standing across two rows, still gets in.
 */
export function canBoard(hero: Cell, bumped: Cell, boat: Cell): boolean {
  return nextTo(hero, boat) && nextTo(bumped, boat);
}

/**
 * Where a boat sailing in across this map's `side` edge first floats: an open
 * sea cell one in from that edge, nearest the middle of it. Null when that
 * whole edge is land.
 */
export function seaEntryCell(z: ZoneDef, side: Side): { x: number; y: number } | null {
  const cols = z.map[0].length;
  const rows = z.map.length;
  const along = side === 'east' || side === 'west' ? rows : cols;
  const order = Array.from({ length: along }, (_, i) => i).sort((a, b) => Math.abs(a - along / 2) - Math.abs(b - along / 2));
  for (const i of order) {
    const cell =
      side === 'west' ? { x: 1, y: i } : side === 'east' ? { x: cols - 2, y: i } : side === 'north' ? { x: i, y: 1 } : { x: i, y: rows - 2 };
    if (SEA_CHARS.has(tileAt(z, cell.x, cell.y))) return cell;
  }
  return null;
}
