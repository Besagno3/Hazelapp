/**
 * Zelda-style screen slide between zones. Leaving by an edge exit, the old
 * screen scrolls out the way the hero walked while the new zone scrolls in
 * from the opposite side, both moving together.
 */
export type ExitSide = 'north' | 'south' | 'east' | 'west';

/** Slide duration (ms) — about half a second, like the 16-bit classics. */
export const SLIDE_MS = 480;

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
