import {
  LANDING_CHARS,
  SEA_CHARS,
  WALKABLE_CHARS,
  tileAt,
  type Side,
  type TravelMode,
  type ZoneDef,
  type ZoneId,
} from '../content/zones';

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
 * first) — where a boat moors when the hero leaves it mid-voyage. Null when
 * there's no sea that close.
 */
export function nearestSea(z: ZoneDef, x: number, y: number, reach = 2): { x: number; y: number } | null {
  let best: { x: number; y: number; d: number } | null = null;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      if (!SEA_CHARS.has(tileAt(z, x + dx, y + dy))) continue;
      const d = dx * dx + dy * dy;
      if (!best || d < best.d) best = { x: x + dx, y: y + dy, d };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

/**
 * Cells a boat can reach from (x, y) on this map (4-way, open sea only),
 * with fog in the way unless `flags` has lifted it.
 */
export function reachableBySea(
  z: ZoneDef,
  from: { x: number; y: number },
  fogAt: (x: number, y: number) => boolean = () => false,
): Set<string> {
  const seen = new Set<string>([`${from.x},${from.y}`]);
  const queue: [number, number][] = [[from.x, from.y]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const key = `${nx},${ny}`;
      if (seen.has(key) || !SEA_CHARS.has(tileAt(z, nx, ny)) || fogAt(nx, ny)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
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
