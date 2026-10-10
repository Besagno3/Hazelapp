import {
  LANDING_CHARS,
  SEA_CHARS,
  TILE,
  WALKABLE_CHARS,
  ZONES,
  darkAt,
  fogAt,
  gateFlag,
  gateIdAt,
  nearestCell,
  tileAt,
  type TravelMode,
  type ZoneDef,
} from '../content/zones';
import { passable as tilePassable, seaCrossing } from './travel';

/**
 * Where can the hero get to? (#75 item 14b) — the one search behind the game's
 * "is this reachable?" questions: where a save may stand (`safeSpawn`), what
 * fog still shuts away (`behindFog`), which shrine the guides point at, the
 * Act I journey (`lib/journey.ts`) and every zone test. It walks the grid
 * 4-way over (cell, travel mode): on foot over walkable tiles, in Marlow's
 * boat over open sea, climbing in at the boat's mooring and going ashore on a
 * beach or a dock — the rules `WorldCanvas` plays by, a little stricter (a
 * corner boarding isn't modelled), so "reachable" here is reachable there.
 */

export type Cell = { x: number; y: number };

export interface ReachOptions {
  /** Where the search starts — always counted as reached. Default: the zone's spawn. */
  from?: Cell | readonly Cell[];
  /** The start is afloat (the hero is in the boat). */
  aboard?: boolean;
  /** Travel modes the hero may use. Default: just the one they start in. */
  modes?: readonly TravelMode[];
  /** Where the boat is moored on this map — climbing in happens only here. */
  boat?: Cell | null;
  /**
   * Story flags: fog that hasn't lifted and pitch dark that isn't lit both
   * block (as on screen). Default `{}` — nothing lifted, nothing lit. `null`
   * ignores fog and dark altogether.
   */
  flags?: Record<string, boolean> | null;
  /**
   * Gatekeepers' gates ('G'): `closed` (default) walls; `open` as if every
   * question were answered; `flags` as the canvas does — open once its
   * `gate:` flag is set; or decide per gate id.
   */
  gates?: 'closed' | 'open' | 'flags' | ((gateId: string) => boolean);
  /**
   * Exits — an edge, a place icon, stairs, and open sea along a linked edge:
   * `pass` (default) walks over them like any tile; `stop` reaches them but
   * goes no further, as in the game, where stepping on one takes you away.
   */
  exits?: 'pass' | 'stop';
  /** Which tiles a mode may cross (default `lib/travel.ts`'s `passable`). */
  passable?: (ch: string, mode: TravelMode) => boolean;
  /** Cells nobody may step onto (people standing there, say). */
  blocked?: (x: number, y: number) => boolean;
}

/** A step of a path: the cell, and how the hero is getting about there. */
export type Step = Cell & { mode: TravelMode };

const MODE_BIT: Record<TravelMode, number> = { foot: 0, boat: 1 };
const BIT_MODE: TravelMode[] = ['foot', 'boat'];
const DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** The search itself; `goal` stops it at the first state whose cell it accepts. */
function explore(
  z: ZoneDef,
  opts: ReachOptions,
  goal?: (x: number, y: number) => boolean,
): { cells: Set<string>; parent: Map<number, number>; found: number | null; cols: number } {
  const cols = Math.max(1, ...z.map.map((r) => r.length));
  const rows = z.map.length;
  const flags = opts.flags === undefined ? {} : opts.flags;
  const startMode: TravelMode = opts.aboard ? 'boat' : 'foot';
  const modes = new Set(opts.modes ?? [startMode]);
  modes.add(startMode);
  const passable = opts.passable ?? tilePassable;
  const gateCache = new Map<number, boolean>();
  // A state is one number: cell index * 2 + mode bit.
  const id = (x: number, y: number, m: number) => (y * cols + x) * 2 + m;
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows;

  const exitCells = new Set<number>();
  if (opts.exits === 'stop') for (const e of z.exits) exitCells.add(e.y * cols + e.x);
  const exitAt = (x: number, y: number, m: number) =>
    opts.exits === 'stop' &&
    (exitCells.has(y * cols + x) || (m === 1 && !!z.seaLinks?.length && seaCrossing(z, x, y, ZONES) !== null));

  function gateOpen(x: number, y: number): boolean {
    const g = opts.gates ?? 'closed';
    if (g === 'closed') return false;
    if (g === 'open') return true;
    const k = y * cols + x;
    let open = gateCache.get(k);
    if (open === undefined) {
      const gid = gateIdAt(z.id, z.map, x, y);
      open = g === 'flags' ? !!flags?.[gateFlag(gid)] : g(gid);
      gateCache.set(k, open);
    }
    return open;
  }

  /** Can the hero be at (x, y) in mode m (fog, dark, people and tiles allowing)? */
  function enterable(x: number, y: number, m: number): boolean {
    if (!inMap(x, y)) return false;
    if (flags && (fogAt(z, x, y, flags) || darkAt(z, x, y, flags))) return false;
    if (opts.blocked?.(x, y)) return false;
    const ch = tileAt(z, x, y);
    if (passable(ch, BIT_MODE[m])) return true;
    return m === 0 && ch === 'G' && gateOpen(x, y);
  }

  const cells = new Set<string>();
  const parent = new Map<number, number>();
  const seen = new Set<number>();
  const queue: number[] = [];
  let found: number | null = null;
  const visit = (s: number, from: number | null) => {
    if (seen.has(s)) return;
    seen.add(s);
    if (from !== null) parent.set(s, from);
    const cell = s >> 1;
    const x = cell % cols;
    const y = Math.floor(cell / cols);
    cells.add(`${x},${y}`);
    if (found === null && goal?.(x, y)) found = s;
    queue.push(s);
  };

  const seeds = opts.from === undefined ? [z.spawn] : Array.isArray(opts.from) ? opts.from : [opts.from as Cell];
  const seedStates = new Set(seeds.map((c) => id(c.x, c.y, MODE_BIT[startMode])));
  for (const s of seedStates) visit(s, null);

  for (let head = 0; head < queue.length && found === null; head++) {
    const s = queue[head];
    const m = s & 1;
    const cell = s >> 1;
    const x = cell % cols;
    const y = Math.floor(cell / cols);
    // An exit takes you away: reached, but nothing beyond it (a seed is where you stand, not an exit you stepped on).
    if (!seedStates.has(s) && exitAt(x, y, m)) continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (enterable(nx, ny, m)) visit(id(nx, ny, m), s);
      // On foot beside the moored boat: climb in.
      if (m === 0 && modes.has('boat') && opts.boat && opts.boat.x === nx && opts.boat.y === ny && enterable(nx, ny, 1))
        visit(id(nx, ny, 1), s);
      // Afloat beside a beach or a dock: go ashore.
      if (m === 1 && modes.has('foot') && LANDING_CHARS.has(tileAt(z, nx, ny)) && enterable(nx, ny, 0))
        visit(id(nx, ny, 0), s);
    }
  }
  return { cells, parent, found, cols };
}

/** Every cell ("x,y") the hero can get to, in any of the allowed travel modes. */
export function reach(z: ZoneDef, opts: ReachOptions = {}): Set<string> {
  return explore(z, opts).cells;
}

/**
 * The shortest way (fewest steps) to the first cell `to` accepts — every step
 * with its travel mode, start included — or null when there's none.
 */
export function reachPath(z: ZoneDef, to: (x: number, y: number) => boolean, opts: ReachOptions = {}): Step[] | null {
  const { parent, found, cols } = explore(z, opts, to);
  if (found === null) return null;
  const path: Step[] = [];
  for (let s: number | undefined = found; s !== undefined; s = parent.get(s)) {
    const cell = s >> 1;
    path.push({ x: cell % cols, y: Math.floor(cell / cols), mode: BIT_MODE[s & 1] });
  }
  return path.reverse();
}

/** Is one of the four cells beside (x, y) reached? — a chest, a seal, a boss is bumped, not stood on. */
export function touches(open: Set<string>, x: number, y: number): boolean {
  return DIRS.some(([dx, dy]) => open.has(`${x + dx},${y + dy}`));
}

/** Cells only reachable through fog that hasn't lifted, or pitch dark that isn't lit (those cells too). */
export function behindFog(z: ZoneDef, flags: Record<string, boolean>): Set<string> {
  const open = reach(z, { flags });
  return new Set([...reach(z, { flags: null })].filter((c) => !open.has(c)));
}

/** How far (cells) a hero saved afloat may be moved to stay afloat (`safeSpawn`). */
export const BOAT_SPAWN_REACH = 6;

/**
 * A position (pixels) the hero can safely stand on, else the zone spawn. With
 * `flags`, a spot shut in behind fog that hasn't lifted counts as unsafe too:
 * a save from before the fog (or an exit that lands inside it) must never
 * leave the hero sealed in (#75 item 7). A save standing on an exit — stairs
 * drawn under it later, say (the Clockwork Depths' B1, #75 item 10) — steps
 * onto the nearest open floor beside it, so loading never whisks the hero
 * away (#75 item 14b).
 */
export function safeSpawn(
  z: ZoneDef,
  pos: { x: number; y: number } | null,
  flags?: Record<string, boolean>,
  mode: TravelMode = 'foot',
): { x: number; y: number } {
  const fallback = { x: z.spawn.x * TILE + TILE / 2, y: z.spawn.y * TILE + TILE / 2 };
  if (!pos) return fallback;
  const cx = Math.floor(pos.x / TILE);
  const cy = Math.floor(pos.y / TILE);
  const centre = (c: Cell) => ({ x: c.x * TILE + TILE / 2, y: c.y * TILE + TILE / 2 });
  // Afloat (#75 item 14): any open sea will do — fog still counts as solid. A
  // map repainted (or fogged) under the boat puts it on the nearest open sea,
  // so the hero stays afloat rather than landing wherever the spawn is.
  if (mode === 'boat') {
    const afloat = (x: number, y: number) => SEA_CHARS.has(tileAt(z, x, y)) && !(flags && fogAt(z, x, y, flags));
    if (afloat(cx, cy)) return pos;
    const near = nearestCell(cx, cy, BOAT_SPAWN_REACH, afloat);
    return near ? centre(near) : fallback;
  }
  const shut = flags && z.fogs?.length ? behindFog(z, flags) : null;
  const standable = (x: number, y: number) =>
    WALKABLE_CHARS.has(tileAt(z, x, y)) && !shut?.has(`${x},${y}`) && !z.exits.some((e) => e.x === x && e.y === y);
  if (standable(cx, cy)) return pos;
  if (!WALKABLE_CHARS.has(tileAt(z, cx, cy)) || shut?.has(`${cx},${cy}`)) return fallback;
  // On an exit: the nearest open floor beside it.
  const beside = nearestCell(cx, cy, 2, standable);
  return beside ? centre(beside) : fallback;
}
