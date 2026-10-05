import { buildingAt, type BuildingStyle, type ZoneDef } from '../content/zones';
import { TILE_FRAME, TOWN_FRAME, groundVariant } from '../content/tiles';

/**
 * Terrain layers for the world renderer (overworld Phase 0, #75).
 *
 * The canvas used to create one KaPlay object per tile (often two), so the
 * per-frame cost grew with the map: fine for a 22×14 screen, ~0.5 fps for a
 * 160×112 overworld on a throttled CPU. Instead, each cell's static frames are
 * worked out once here, and `WorldCanvas` draws only the cells in view every
 * frame (`visibleRange`) — a cost that stays flat however big the map gets.
 *
 * The rules mirror what the per-tile renderer drew: ground variants, paths and
 * exits, animated water, scenery/flower/exit overlays, and building tiles in
 * each building's own architecture style. Props that change or animate on
 * their own (save crystals, chests, gates, Spire seals/stairs/throne) are NOT
 * terrain — they stay live objects drawn on top.
 */

/** A sheet a terrain cell draws from: the zone's own tileset, or a building style's town sheet. */
export type TerrainSheet = 'zone' | BuildingStyle;

/** `baseFrame` value for animated water — the frame is picked from the clock at draw time. */
export const WATER = -1;
/** `overFrame` value for "no overlay". */
export const NO_OVERLAY = -1;

/** Building-interior chars → town tile frame. */
const TOWN_TILE: Record<string, number> = {
  D: TOWN_FRAME.door,
  F: TOWN_FRAME.floor,
  K: TOWN_FRAME.counter,
  B: TOWN_FRAME.shelf,
  T: TOWN_FRAME.table,
  Z: TOWN_FRAME.bed,
};

/** Zone-tileset overlays drawn over the ground (transparent frames). */
const OVERLAY: Record<string, number> = {
  '#': TILE_FRAME.solid,
  ',': TILE_FRAME.deco,
  E: TILE_FRAME.exit,
};

export interface TerrainLayers {
  cols: number;
  rows: number;
  /** Sheets in use; `baseSheet` holds an index into this list per cell. */
  sheets: TerrainSheet[];
  /** Per cell (row-major): which sheet the base tile comes from. */
  baseSheet: Uint8Array;
  /** Per cell: base frame, or `WATER`. */
  baseFrame: Int16Array;
  /** Per cell: zone-tileset overlay frame, or `NO_OVERLAY`. */
  overFrame: Int16Array;
}

/** The base tile for one cell: its sheet and frame (or `WATER`). */
export function baseTile(z: ZoneDef, x: number, y: number): { sheet: TerrainSheet; frame: number } {
  const ch = z.map[y][x];
  const home = buildingAt(z, x, y);
  // Building tiles draw in that building's architecture style (#73).
  const style: BuildingStyle = home?.style ?? 'timber';
  if (ch === 'W') {
    // Facade (a building's street-facing bottom row) vs. wall tops; windows on
    // every other facade tile, never right beside the door.
    const facade = home && y === home.y + home.h - 1;
    const nearDoor = z.map[y][x - 1] === 'D' || z.map[y][x + 1] === 'D';
    const frame = !facade
      ? TOWN_FRAME.wallTop
      : (x - (home?.x ?? 0)) % 2 === 1 && !nearDoor
        ? TOWN_FRAME.facadeWindow
        : TOWN_FRAME.facade;
    return { sheet: style, frame };
  }
  if (ch in TOWN_TILE) return { sheet: style, frame: TOWN_TILE[ch] };
  if (ch === '=' || ch === 'E') return { sheet: 'zone', frame: TILE_FRAME.path };
  if (ch === '~') return { sheet: 'zone', frame: WATER };
  return { sheet: 'zone', frame: groundVariant(x, y) };
}

/** The overlay frame drawn over a cell's base (scenery, flowers, exit marker), if any. */
export function overlayTile(ch: string): number {
  return OVERLAY[ch] ?? NO_OVERLAY;
}

/** Works out every cell's terrain frames once per zone build. */
export function terrainLayers(z: ZoneDef): TerrainLayers {
  const rows = z.map.length;
  const cols = z.map[0].length;
  const sheets: TerrainSheet[] = [];
  const baseSheet = new Uint8Array(cols * rows);
  const baseFrame = new Int16Array(cols * rows);
  const overFrame = new Int16Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const base = baseTile(z, x, y);
      let s = sheets.indexOf(base.sheet);
      if (s < 0) s = sheets.push(base.sheet) - 1;
      baseSheet[i] = s;
      baseFrame[i] = base.frame;
      overFrame[i] = overlayTile(z.map[y][x]);
    }
  }
  return { cols, rows, sheets, baseSheet, baseFrame, overFrame };
}

/**
 * The cells a camera centred at (camX, camY) can see through a viewW×viewH
 * viewport, plus a `margin` of cells on every side, clamped to the map.
 * Half-open: x in [x0, x1), y in [y0, y1). Its size depends only on the
 * viewport, never on the map — that's what keeps big maps cheap.
 */
export function visibleRange(
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  cols: number,
  rows: number,
  tile: number,
  margin = 1,
): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.max(0, Math.floor((camX - viewW / 2) / tile) - margin),
    y0: Math.max(0, Math.floor((camY - viewH / 2) / tile) - margin),
    x1: Math.min(cols, Math.ceil((camX + viewW / 2) / tile) + margin),
    y1: Math.min(rows, Math.ceil((camY + viewH / 2) / tile) + margin),
  };
}

/** Which water frame to show `elapsed` seconds after the zone was built. */
export function waterFrame(elapsed: number, fps: number): number {
  const frames = TILE_FRAME.water;
  return frames[Math.floor(Math.max(0, elapsed) * fps) % frames.length];
}
