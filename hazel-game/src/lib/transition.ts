import type { ZoneDef, ZoneExit, ZoneKind } from '../content/zones';

/**
 * Zelda-style screen slide between zones. Leaving by an edge exit, the old
 * screen scrolls out the way the hero walked while the new zone scrolls in
 * from the opposite side, both moving together.
 */
export type ExitSide = 'north' | 'south' | 'east' | 'west';

/** Slide duration (ms) — about half a second, like the 16-bit classics. */
export const SLIDE_MS = 480;

/** Dip-to-black duration (ms) for walking into or out of a place (#75 Phase 1). */
export const FADE_MS = 440;

export type TransitionKind = 'slide' | 'fade' | 'cut';

/**
 * How a zone change looks (#75 Phase 1). Neighbouring screens joined edge to
 * edge slide, Zelda-style. Walking onto a place on the overworld, or out of a
 * place back onto it, fades through black instead — the two maps aren't side
 * by side, so a slide would lie about the geography. An entrance in the middle
 * of a map always fades. Players who ask for reduced motion get a cut.
 */
export function transitionFor(
  side: ExitSide | null,
  fromKind: ZoneKind,
  toKind: ZoneKind,
  reduceMotion: boolean,
): TransitionKind {
  if (reduceMotion) return 'cut';
  if (!side || fromKind === 'overworld' || toKind === 'overworld') return 'fade';
  return 'slide';
}

/** Which map edge an exit tile sits on (null for an interior exit). */
export function exitSide(x: number, y: number, cols: number, rows: number): ExitSide | null {
  if (y === 0) return 'north';
  if (y === rows - 1) return 'south';
  if (x === 0) return 'west';
  if (x === cols - 1) return 'east';
  return null;
}

/**
 * Where the *new* screen starts, as a fraction of the viewport (the old one
 * leaves by the opposite amount). Heading east, the new zone arrives from
 * the right (+1, 0) and the old one exits left.
 */
export function slideFrom(side: ExitSide): { x: number; y: number } {
  switch (side) {
    case 'east':
      return { x: 1, y: 0 };
    case 'west':
      return { x: -1, y: 0 };
    case 'north':
      return { x: 0, y: -1 };
    case 'south':
      return { x: 0, y: 1 };
  }
}

/** The edge you come in by after leaving through `side`. */
export const OPPOSITE_SIDE: Record<ExitSide, ExitSide> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

/** How many cells from the arrival edge an edge exit may land you. */
export const ARRIVAL_SLACK = 2;

/**
 * Checks one exit of an edge-to-edge link (#76): leaving `from` by an edge
 * must land you near the opposite edge of `to`, and the way back must be on
 * that same edge. Returns what's wrong, or null when it lines up.
 *
 * "The way back" is `to`'s exit to `from` nearest where you land — zones may
 * link more than once (a town with several gates onto the overworld), and only
 * the way you'd actually walk back is checked. Links that fade instead of
 * slide are skipped: an entrance in the middle of a map, or a gate whose way
 * back is a place icon on the overworld.
 */
export function edgeLinkProblem(from: ZoneDef, exit: ZoneExit, to: ZoneDef): string | null {
  const side = exitSide(exit.x, exit.y, from.map[0].length, from.map.length);
  if (!side) return null;
  const backs = to.exits.filter((b) => b.to === from.id);
  if (backs.length === 0) return `${to.id} has no way back to ${from.id}`;
  const dist = (b: ZoneExit) => Math.abs(b.x - exit.spawnX) + Math.abs(b.y - exit.spawnY);
  const back = backs.reduce((best, b) => (dist(b) < dist(best) ? b : best));
  const cols = to.map[0].length;
  const rows = to.map.length;
  const backSide = exitSide(back.x, back.y, cols, rows);
  if (!backSide) return null;
  const arrive = OPPOSITE_SIDE[side];
  const where = `${from.id} ${side} exit ${exit.x},${exit.y} → ${to.id}`;
  if (backSide !== arrive) return `${where}: the way back is on the ${backSide} edge, not the ${arrive} edge`;
  const gap = { north: exit.spawnY, south: rows - 1 - exit.spawnY, west: exit.spawnX, east: cols - 1 - exit.spawnX }[arrive];
  if (gap > ARRIVAL_SLACK) return `${where}: lands ${gap} cells from the ${arrive} edge`;
  return null;
}
