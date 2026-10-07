/**
 * Tiled maps (#75, roadmap item 5). Big maps — Dawnreach now, the continents
 * next — are painted in Tiled (https://www.mapeditor.org) and saved as JSON
 * (`src/content/maps/*.tmj`), using the legend tileset `maps/legend.tsj`: one
 * tile per map character, named by its `char` property. The game still runs
 * on ASCII rows, so `tiledRows` turns a map back into rows at load and every
 * zone invariant (zones.test.ts) checks it like any other map. Places, exits,
 * fog, NPCs and enemies stay in zones.ts. See docs/MAP-AUTHORING.md.
 *
 * The checks are strict on purpose: a map saved oddly in the editor (an empty
 * cell, a flipped tile, a compressed layer) fails loudly with where and why,
 * instead of drawing a broken world.
 */

/** The parts of a Tiled tileset (.tsj) this reads. */
export interface TiledTileset {
  type: 'tileset';
  tiles: { id: number; properties?: { name: string; value: unknown }[] }[];
}

/** The parts of a Tiled map (.tmj) this reads. */
export interface TiledMap {
  type: 'map';
  orientation: string;
  infinite: boolean;
  width: number;
  height: number;
  tilesets: { firstgid: number; source?: string }[];
  layers: { type: string; name: string; width?: number; height?: number; data?: unknown; encoding?: string }[];
}

/** Tiled stores flips / rotations in a gid's top four bits. */
const FLIP_BITS = 0xf0000000;

/** The name of the one tile layer a map must have. */
export const TERRAIN_LAYER = 'terrain';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Each legend tile's map character, by tile id. Throws on a malformed tileset. */
export function legendChars(tileset: unknown): Map<number, string> {
  if (!isObject(tileset) || tileset.type !== 'tileset' || !Array.isArray(tileset.tiles)) {
    throw new Error('Tiled legend: not a Tiled tileset (.tsj)');
  }
  const chars = new Map<number, string>();
  const seen = new Set<string>();
  for (const t of tileset.tiles as TiledTileset['tiles']) {
    const ch = t.properties?.find((p) => p.name === 'char')?.value;
    if (typeof ch !== 'string' || ch.length !== 1) throw new Error(`Tiled legend: tile ${t.id} has no one-letter "char" property`);
    if (seen.has(ch)) throw new Error(`Tiled legend: "${ch}" is on two tiles`);
    seen.add(ch);
    chars.set(t.id, ch);
  }
  return chars;
}

/**
 * A Tiled map's terrain as ASCII rows (top to bottom). `name` labels errors.
 * Throws if the map isn't one the game can read.
 */
export function tiledRows(map: unknown, tileset: unknown, name = 'map'): string[] {
  const fail = (why: string): never => {
    throw new Error(`Tiled map ${name}: ${why}`);
  };
  if (!isObject(map) || map.type !== 'map') return fail('not a Tiled map (.tmj)');
  const m = map as unknown as TiledMap;
  if (m.orientation !== 'orthogonal') fail(`orientation must be orthogonal, not ${m.orientation}`);
  if (m.infinite) fail('infinite maps are not supported — untick "Infinite" in Map Properties');
  const { width, height } = m;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) fail('bad width/height');
  if (!Array.isArray(m.tilesets) || m.tilesets.length !== 1) fail('use exactly one tileset: the map legend');
  const { firstgid } = m.tilesets[0];
  const tileLayers = (m.layers ?? []).filter((l) => l.type === 'tilelayer');
  if (tileLayers.length !== 1 || tileLayers[0].name !== TERRAIN_LAYER) {
    fail(`needs exactly one tile layer, named "${TERRAIN_LAYER}" (found: ${tileLayers.map((l) => l.name).join(', ') || 'none'})`);
  }
  const layer = tileLayers[0];
  if (layer.encoding && layer.encoding !== 'csv') fail(`layer data is ${layer.encoding} — set Tile Layer Format to CSV`);
  if (layer.width !== width || layer.height !== height) fail('the terrain layer must cover the whole map');
  const data = layer.data;
  if (!Array.isArray(data) || data.length !== width * height) fail(`the terrain layer needs ${width * height} cells`);

  const chars = legendChars(tileset);
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const gid = (data as unknown[])[y * width + x];
      if (typeof gid !== 'number' || !Number.isInteger(gid)) fail(`bad cell at (${x}, ${y})`);
      if (gid === 0) fail(`empty cell at (${x}, ${y}) — every cell needs a tile`);
      if (((gid as number) & FLIP_BITS) !== 0) fail(`flipped or rotated tile at (${x}, ${y})`);
      const ch = chars.get((gid as number) - firstgid);
      if (ch === undefined) fail(`tile ${gid} at (${x}, ${y}) isn't in the map legend`);
      row += ch;
    }
    rows.push(row);
  }
  return rows;
}
