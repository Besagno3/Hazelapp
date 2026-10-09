import { buildingAt, type BuildingStyle, type ZoneDef } from '../content/zones';
import {
  BLEND_CLASS,
  BLEND_WATER_STEP,
  OVERWORLD_DOCK_FRAME,
  OVERWORLD_FRAME,
  TILE_FRAME,
  TOWN_FRAME,
  blendPairFrame,
  blendShapeFrame,
  groundVariant,
  type BlendClass,
  type LandClass,
} from '../content/tiles';

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

/**
 * A sheet a terrain cell draws from: the zone's own tileset, the shared
 * overworld sheet (mountains, sand — #75 Phase 1), or a building style's
 * town sheet.
 */
export type TerrainSheet = 'zone' | 'overworld' | BuildingStyle;

/** One tile to draw: which sheet, which frame. */
export interface TileRef {
  sheet: TerrainSheet;
  frame: number;
}

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

/** Overlays drawn over the ground (transparent frames). */
const OVERLAY: Record<string, TileRef> = {
  '#': { sheet: 'zone', frame: TILE_FRAME.solid },
  // Hidden passages look exactly like solid scenery (the hero can walk through).
  H: { sheet: 'zone', frame: TILE_FRAME.solid },
  ',': { sheet: 'zone', frame: TILE_FRAME.deco },
  E: { sheet: 'zone', frame: TILE_FRAME.exit },
  '^': { sheet: 'overworld', frame: OVERWORLD_FRAME.mountain },
  // A dock's planks over the water beneath (#75 item 14).
  '|': { sheet: 'overworld', frame: OVERWORLD_DOCK_FRAME },
};

export interface TerrainLayers {
  cols: number;
  rows: number;
  /** Sheets in use; `baseSheet` / `overSheet` hold an index into this list per cell. */
  sheets: TerrainSheet[];
  /** Per cell (row-major): which sheet the base tile comes from. */
  baseSheet: Uint8Array;
  /** Per cell: base frame, or `WATER`. */
  baseFrame: Int16Array;
  /** Per cell: which sheet the overlay comes from (ignored when there is none). */
  overSheet: Uint8Array;
  /** Per cell: overlay frame, or `NO_OVERLAY`. */
  overFrame: Int16Array;
}

/** The base tile for one cell: its sheet and frame (or `WATER`). */
export function baseTile(z: ZoneDef, x: number, y: number): TileRef {
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
  if (ch === '~' || ch === '|') return { sheet: 'zone', frame: WATER };
  if (ch === ':') return { sheet: 'overworld', frame: OVERWORLD_FRAME.sand };
  return { sheet: 'zone', frame: groundVariant(x, y) };
}

/** The overlay drawn over a cell's base (scenery, flowers, exit marker, mountain), if any. */
export function overlayTile(ch: string): TileRef | null {
  return OVERLAY[ch] ?? null;
}

/** Works out every cell's terrain frames once per zone build. */
export function terrainLayers(z: ZoneDef): TerrainLayers {
  const rows = z.map.length;
  const cols = z.map[0].length;
  const sheets: TerrainSheet[] = [];
  const baseSheet = new Uint8Array(cols * rows);
  const baseFrame = new Int16Array(cols * rows);
  const overSheet = new Uint8Array(cols * rows);
  const overFrame = new Int16Array(cols * rows);
  const sheetIndex = (sheet: TerrainSheet) => {
    const s = sheets.indexOf(sheet);
    return s >= 0 ? s : sheets.push(sheet) - 1;
  };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const base = baseTile(z, x, y);
      baseSheet[i] = sheetIndex(base.sheet);
      baseFrame[i] = base.frame;
      const over = overlayTile(z.map[y][x]);
      overSheet[i] = over ? sheetIndex(over.sheet) : 0;
      overFrame[i] = over ? over.frame : NO_OVERLAY;
    }
  }
  return { cols, rows, sheets, baseSheet, baseFrame, overSheet, overFrame };
}

// --- Edge blending (#75, #71b) ---------------------------------------------
// Coasts, beaches and roads would otherwise meet in hard squares. Wherever
// different terrain meets at a tile corner, the renderer draws tiles centred
// on that corner: a ready-made opaque tile for the lowest two classes there,
// then any higher class's rounded shape on top. Classes stack water < sand <
// ground < path. Buildings never blend (their walls stay square), and neither
// do the Spire's floors (their '~' are pits, not water).

const BLEND_OF: Record<string, BlendClass> = {
  '~': BLEND_CLASS.water,
  // A dock stands in the water: the coast blends around it as sea.
  '|': BLEND_CLASS.water,
  ':': BLEND_CLASS.sand,
  '.': BLEND_CLASS.ground,
  ',': BLEND_CLASS.ground,
  '#': BLEND_CLASS.ground,
  H: BLEND_CLASS.ground,
  S: BLEND_CLASS.ground,
  C: BLEND_CLASS.ground,
  G: BLEND_CLASS.ground,
  P: BLEND_CLASS.ground,
  '^': BLEND_CLASS.ground,
  '=': BLEND_CLASS.path,
  E: BLEND_CLASS.path,
};

/** The blend class of a map cell, or null where nothing blends (buildings). */
export function blendClass(ch: string): BlendClass | null {
  return BLEND_OF[ch] ?? null;
}

/** Does this map get blended edges? Every zone does; Spire floors (own tileset) don't. */
export function blendsEdges(z: ZoneDef): boolean {
  return !z.tileset;
}

/** An empty slot in `BlendLayer.ops`. */
export const NO_BLEND = -1;
/** Tiles per corner: one pair, then at most two more shapes (four classes). */
export const BLEND_OPS_PER_CORNER = 3;

export interface BlendLayer {
  /** Tile corners per row / column: one more than the map's cells. */
  vcols: number;
  vrows: number;
  /**
   * Per corner (row-major), `BLEND_OPS_PER_CORNER` blend-sheet frames to draw
   * in order, or `NO_BLEND` (the rest are empty too). A corner whose first
   * slot is `NO_BLEND` draws nothing.
   */
  ops: Int16Array;
  /** Per slot: frames to add on the second water frame (0 when the tile doesn't animate). */
  waterStep: Uint8Array;
  /**
   * Per cell (row-major): 1 when all four of its corners blend — their opaque
   * pair tiles cover it completely, so its base tile needn't be drawn.
   */
  hidden: Uint8Array;
}

/**
 * Works out every tile corner's blend tiles once per zone build. Corner
 * (vx, vy) sits between cells (vx-1, vy-1), (vx, vy-1), (vx-1, vy) and
 * (vx, vy); cells past the map edge count as the nearest edge cell.
 */
export function blendLayer(z: ZoneDef): BlendLayer {
  const rows = z.map.length;
  const cols = z.map[0].length;
  const vcols = cols + 1;
  const vrows = rows + 1;
  const ops = new Int16Array(vcols * vrows * BLEND_OPS_PER_CORNER).fill(NO_BLEND);
  const waterStep = new Uint8Array(vcols * vrows * BLEND_OPS_PER_CORNER);
  const classAt = (x: number, y: number) =>
    blendClass(z.map[Math.min(Math.max(y, 0), rows - 1)][Math.min(Math.max(x, 0), cols - 1)]);
  for (let vy = 0; vy < vrows; vy++) {
    for (let vx = 0; vx < vcols; vx++) {
      // Corner order matches the mask bits: top-left 1, top-right 2, bottom-left 4, bottom-right 8.
      const c = [classAt(vx - 1, vy - 1), classAt(vx, vy - 1), classAt(vx - 1, vy), classAt(vx, vy)];
      if (c.some((k) => k === null)) continue;
      const present = [...new Set(c as BlendClass[])].sort((a, b) => a - b);
      if (present.length < 2) continue;
      const maskOf = (cls: BlendClass) => c.reduce<number>((m, k, b) => ((k as number) >= cls ? m | (1 << b) : m), 0);
      const o = (vy * vcols + vx) * BLEND_OPS_PER_CORNER;
      const [lower, upper] = present as [BlendClass, LandClass];
      ops[o] = blendPairFrame(lower, upper, maskOf(upper));
      if (lower === BLEND_CLASS.water) waterStep[o] = BLEND_WATER_STEP;
      for (let k = 2; k < present.length; k++) {
        const cls = present[k] as LandClass;
        ops[o + k - 1] = blendShapeFrame(cls, maskOf(cls));
      }
    }
  }
  const hidden = new Uint8Array(cols * rows);
  const blends = (vx: number, vy: number) => ops[(vy * vcols + vx) * BLEND_OPS_PER_CORNER] !== NO_BLEND;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (blends(x, y) && blends(x + 1, y) && blends(x, y + 1) && blends(x + 1, y + 1)) hidden[y * cols + x] = 1;
    }
  }
  return { vcols, vrows, ops, waterStep, hidden };
}

/**
 * The cells a camera centred at (camX, camY) can see through a viewW×viewH
 * viewport, plus a `margin` of cells on every side, clamped to the map.
 * viewW/viewH are in WORLD pixels — use `worldView` (lib/camera.ts) so a
 * zoomed camera is handled.
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
