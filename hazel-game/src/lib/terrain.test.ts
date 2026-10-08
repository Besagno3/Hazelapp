import { describe, expect, it } from 'vitest';
import { ZONES, ZONE_IDS, TILE, VIEW_COLS, VIEW_ROWS, type ZoneDef } from '../content/zones';
import { SPIRE_THEMES, floorZone } from '../content/spire';
import {
  BLEND_CLASS,
  BLEND_FRAMES,
  BLEND_WATER_STEP,
  OVERWORLD_FRAME,
  OVERWORLD_FRAMES,
  TILESET_FRAMES,
  TILE_FRAME,
  TOWN_FRAME,
  TOWN_FRAMES,
  blendPairFrame,
  blendShapeFrame,
  groundVariant,
} from '../content/tiles';
import {
  BLEND_OPS_PER_CORNER,
  NO_BLEND,
  NO_OVERLAY,
  WATER,
  baseTile,
  blendClass,
  blendLayer,
  blendsEdges,
  overlayTile,
  terrainLayers,
  visibleRange,
  waterFrame,
} from './terrain';

const ALL_MAPS: [string, ZoneDef][] = [
  ...ZONE_IDS.map((id): [string, ZoneDef] => [id, ZONES[id]]),
  ...SPIRE_THEMES.map((t): [string, ZoneDef] => [`spire-${t}`, floorZone(t)]),
];
const VIEW_W = VIEW_COLS * TILE;
const VIEW_H = VIEW_ROWS * TILE;

describe('terrainLayers', () => {
  it.each(ALL_MAPS)('%s: every cell has a valid base tile and the right overlay', (_, z) => {
    const L = terrainLayers(z);
    expect(L.cols).toBe(z.map[0].length);
    expect(L.rows).toBe(z.map.length);
    expect(L.baseFrame.length).toBe(L.cols * L.rows);
    for (let y = 0; y < L.rows; y++) {
      for (let x = 0; x < L.cols; x++) {
        const i = y * L.cols + x;
        const sheet = L.sheets[L.baseSheet[i]];
        const f = L.baseFrame[i];
        if (sheet === 'zone') {
          expect(f === WATER || (f >= 0 && f < TILESET_FRAMES), `${x},${y}`).toBe(true);
        } else if (sheet === 'overworld') {
          expect(f >= 0 && f < OVERWORLD_FRAMES, `${x},${y}`).toBe(true);
        } else {
          expect(f >= 0 && f < TOWN_FRAMES, `${x},${y}`).toBe(true);
        }
        // Only scenery, flowers, exits, hidden passages and mountains get an overlay.
        const ch = z.map[y][x];
        expect(L.overFrame[i] !== NO_OVERLAY, `${x},${y} '${ch}'`).toBe('#,EH^'.includes(ch));
        // A hidden passage must look exactly like solid scenery.
        if (ch === 'H') {
          expect(L.sheets[L.overSheet[i]], `${x},${y} hidden passage`).toBe('zone');
          expect(L.overFrame[i], `${x},${y} hidden passage`).toBe(TILE_FRAME.solid);
        }
      }
    }
  });

  it('paths and exits use the path tile; exits add the exit marker; water animates', () => {
    const z = ZONES['lumina-village'];
    expect(baseTile(z, 8, 10)).toEqual({ sheet: 'zone', frame: TILE_FRAME.path }); // '='
    expect(baseTile(z, 0, 13)).toEqual({ sheet: 'zone', frame: TILE_FRAME.path }); // 'E'
    expect(overlayTile('E')).toEqual({ sheet: 'zone', frame: TILE_FRAME.exit });
    expect(baseTile(z, 24, 15)).toEqual({ sheet: 'zone', frame: WATER }); // '~' (the fountain)
  });

  it('plain ground uses the deterministic speckle variant, scenery overlays on top', () => {
    const z = ZONES['lumina-village'];
    expect(baseTile(z, 1, 1)).toEqual({ sheet: 'zone', frame: groundVariant(1, 1) });
    expect(baseTile(z, 0, 0)).toEqual({ sheet: 'zone', frame: groundVariant(0, 0) }); // '#'
    expect(overlayTile('#')).toEqual({ sheet: 'zone', frame: TILE_FRAME.solid });
    expect(overlayTile(',')).toEqual({ sheet: 'zone', frame: TILE_FRAME.deco });
    expect(overlayTile('.')).toBeNull();
  });

  it('props are not terrain: a save crystal sits on plain ground with no overlay', () => {
    const z = ZONES['lumina-village'];
    expect(z.map[11][18]).toBe('S');
    expect(baseTile(z, 18, 11)).toEqual({ sheet: 'zone', frame: groundVariant(18, 11) });
    expect(overlayTile('S')).toBeNull();
  });

  it("walls: tops above, a facade with windows on alternate tiles but never beside the door", () => {
    // Clove's Curios in Lumina Village: x4 y3 w9 h7, door at (8, 9), timber.
    const z = ZONES['lumina-village'];
    expect(z.map[9][8]).toBe('D');
    expect(baseTile(z, 4, 3)).toEqual({ sheet: 'timber', frame: TOWN_FRAME.wallTop });
    expect(baseTile(z, 4, 9)).toEqual({ sheet: 'timber', frame: TOWN_FRAME.facade });
    expect(baseTile(z, 5, 9)).toEqual({ sheet: 'timber', frame: TOWN_FRAME.facadeWindow });
    expect(baseTile(z, 7, 9)).toEqual({ sheet: 'timber', frame: TOWN_FRAME.facade }); // beside the door
    expect(baseTile(z, 9, 9)).toEqual({ sheet: 'timber', frame: TOWN_FRAME.facade }); // beside the door
    expect(baseTile(z, 11, 9)).toEqual({ sheet: 'timber', frame: TOWN_FRAME.facadeWindow });
    expect(baseTile(z, 8, 9)).toEqual({ sheet: 'timber', frame: TOWN_FRAME.door });
  });

  it('overworld tiles (#75): sand is a base on the overworld sheet, mountains overlay the ground, places sit on plain ground', () => {
    const z: ZoneDef = { ...ZONES['lumina-village'], map: ['.:^P'], buildings: [] };
    expect(baseTile(z, 1, 0)).toEqual({ sheet: 'overworld', frame: OVERWORLD_FRAME.sand });
    expect(baseTile(z, 2, 0)).toEqual({ sheet: 'zone', frame: groundVariant(2, 0) });
    expect(overlayTile('^')).toEqual({ sheet: 'overworld', frame: OVERWORLD_FRAME.mountain });
    expect(baseTile(z, 3, 0)).toEqual({ sheet: 'zone', frame: groundVariant(3, 0) });
    expect(overlayTile('P')).toBeNull();
    const L = terrainLayers(z);
    expect(L.sheets[L.overSheet[2]]).toBe('overworld');
    expect(L.overFrame[2]).toBe(OVERWORLD_FRAME.mountain);
  });

  it("interiors draw in their own building's architecture", () => {
    const z = ZONES.numbria; // blue-stone Numbria (#73)
    expect(baseTile(z, 25, 3)).toEqual({ sheet: 'stone', frame: TOWN_FRAME.floor });
    expect(baseTile(z, 35, 3)).toEqual({ sheet: 'stone', frame: TOWN_FRAME.counter });
  });
});

describe('visibleRange', () => {
  it('a one-screen zone sees the whole map', () => {
    expect(visibleRange(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, VIEW_COLS, VIEW_ROWS, TILE)).toEqual({
      x0: 0,
      y0: 0,
      x1: VIEW_COLS,
      y1: VIEW_ROWS,
    });
  });

  it('never reaches outside the map', () => {
    const r = visibleRange(0, 0, VIEW_W, VIEW_H, 160, 112, TILE);
    expect(r.x0).toBe(0);
    expect(r.y0).toBe(0);
    const s = visibleRange(160 * TILE, 112 * TILE, VIEW_W, VIEW_H, 160, 112, TILE);
    expect(s.x1).toBe(160);
    expect(s.y1).toBe(112);
  });

  it('covers every cell the viewport touches, wherever the camera is', () => {
    for (const [cx, cy] of [
      [500.5, 300.25],
      [2000, 1700.75],
      [VIEW_W / 2 + 13, VIEW_H / 2 + 7],
    ]) {
      const r = visibleRange(cx, cy, VIEW_W, VIEW_H, 160, 112, TILE);
      expect(r.x0).toBeLessThanOrEqual(Math.floor((cx - VIEW_W / 2) / TILE));
      expect(r.y0).toBeLessThanOrEqual(Math.floor((cy - VIEW_H / 2) / TILE));
      expect(r.x1).toBeGreaterThanOrEqual(Math.ceil((cx + VIEW_W / 2) / TILE));
      expect(r.y1).toBeGreaterThanOrEqual(Math.ceil((cy + VIEW_H / 2) / TILE));
    }
  });

  it('draw cost depends on the viewport, never on the map size (big maps stay cheap)', () => {
    const budget = (VIEW_COLS + 3) * (VIEW_ROWS + 3);
    for (const [cols, rows] of [
      [22, 14],
      [44, 28],
      [160, 112],
      [512, 512],
    ]) {
      for (let cx = 0; cx <= cols * TILE; cx += 97) {
        const r = visibleRange(cx, (rows * TILE) / 2, VIEW_W, VIEW_H, cols, rows, TILE);
        expect((r.x1 - r.x0) * (r.y1 - r.y0)).toBeLessThanOrEqual(budget);
      }
    }
  });
});

describe('waterFrame', () => {
  it('starts on the first frame and flips every 1/fps seconds', () => {
    expect(waterFrame(0, 2)).toBe(TILE_FRAME.water[0]);
    expect(waterFrame(0.49, 2)).toBe(TILE_FRAME.water[0]);
    expect(waterFrame(0.5, 2)).toBe(TILE_FRAME.water[1]);
    expect(waterFrame(1.0, 2)).toBe(TILE_FRAME.water[0]);
    expect(waterFrame(-3, 2)).toBe(TILE_FRAME.water[0]);
  });
});

describe('edge blending (#75, #71b)', () => {
  /** A synthetic map on a real zone (only `map` matters here). */
  const mapZone = (map: string[]): ZoneDef => ({ ...ZONES['lumina-village'], map, buildings: [] });
  /** The tiles at corner (vx, vy): [frame, water step] pairs, empty slots dropped. */
  const corner = (z: ZoneDef, vx: number, vy: number) => {
    const L = blendLayer(z);
    const o = (vy * L.vcols + vx) * BLEND_OPS_PER_CORNER;
    const out: [number, number][] = [];
    for (let j = o; j < o + BLEND_OPS_PER_CORNER && L.ops[j] !== NO_BLEND; j++) out.push([L.ops[j], L.waterStep[j]]);
    return out;
  };
  const { water, sand, ground, path } = BLEND_CLASS;

  it('classes stack water < sand < ground < path; buildings never blend', () => {
    expect(blendClass('~')).toBe(water);
    expect(blendClass(':')).toBe(sand);
    for (const ch of '.,#HSCGP^') expect(blendClass(ch), ch).toBe(ground);
    for (const ch of '=E') expect(blendClass(ch), ch).toBe(path);
    for (const ch of 'WDFKBTZ') expect(blendClass(ch), ch).toBeNull();
  });

  it('a pond corner is ONE ready-made tile — water with grass on 3 cells — that follows the water animation', () => {
    const z = mapZone(['..', '.~']);
    expect(corner(z, 1, 1)).toEqual([[blendPairFrame(water, ground, 1 | 2 | 4), BLEND_WATER_STEP]]);
  });

  it('a road meeting grass is one tile too, and it never animates', () => {
    const z = mapZone(['.=', '==']);
    expect(corner(z, 1, 1)).toEqual([[blendPairFrame(ground, path, 2 | 4 | 8), 0]]);
  });

  it('a corner with every class: the water|sand pair, then the grass and road shapes on top', () => {
    const z = mapZone(['~:', '.=']);
    expect(corner(z, 1, 1)).toEqual([
      [blendPairFrame(water, sand, 2 | 4 | 8), BLEND_WATER_STEP],
      [blendShapeFrame(ground, 4 | 8), 0],
      [blendShapeFrame(path, 8), 0],
    ]);
  });

  it('a cell whose four corners all blend is hidden (its base tile is skipped); others are not', () => {
    // A one-cell beach between sea and grass: every corner of the sand cell mixes classes.
    const z = mapZone(['~~~', '~:.', '~~~']);
    const L = blendLayer(z);
    expect(L.hidden[1 * 3 + 1]).toBe(1); // the sand cell
    expect(L.hidden[0]).toBe(0); // open sea at the map corner
    const g = blendLayer(mapZone(['...', '...', '...']));
    expect([...g.hidden].every((h) => h === 0)).toBe(true);
  });

  it('nothing is drawn where all four cells match, next to a building, or past the map edge', () => {
    const z = mapZone(['..W', '.~.', '...']);
    expect(corner(z, 0, 0)).toEqual([]); // all grass (cells past the edge repeat the edge)
    expect(corner(z, 2, 1)).toEqual([]); // touches the wall
    expect(corner(z, 1, 1)).not.toEqual([]); // the pond's top-left corner blends
    expect(corner(z, 3, 3)).toEqual([]); // bottom-right map corner: all grass
  });

  it('frames: every pair and shape has its own slot inside the sheet, and water pairs leave room for their second frame', () => {
    const seen = new Set<number>();
    const add = (f: number) => {
      expect(f >= 0 && f < BLEND_FRAMES, String(f)).toBe(true);
      expect(seen.has(f), String(f)).toBe(false);
      seen.add(f);
    };
    for (let m = 1; m <= 15; m++) {
      for (const cls of [sand, ground, path] as const) {
        add(blendShapeFrame(cls, m));
        add(blendPairFrame(water, cls, m));
        add(blendPairFrame(water, cls, m) + BLEND_WATER_STEP);
      }
      add(blendPairFrame(sand, ground, m));
      add(blendPairFrame(sand, path, m));
      add(blendPairFrame(ground, path, m));
    }
    expect(seen.size).toBe(BLEND_FRAMES);
  });

  it('every zone yields valid frames, and its coasts and roads really blend; Spire floors (pits) never do', () => {
    for (const id of ZONE_IDS) {
      const z = ZONES[id];
      expect(blendsEdges(z), id).toBe(true);
      const L = blendLayer(z);
      expect(L.vcols, id).toBe(z.map[0].length + 1);
      expect(L.vrows, id).toBe(z.map.length + 1);
      L.ops.forEach((f, j) => {
        if (f === NO_BLEND) return;
        expect(f >= 0 && f + L.waterStep[j] < BLEND_FRAMES, id).toBe(true);
      });
    }
    expect(blendLayer(ZONES.dawnreach).waterStep.some((s) => s > 0)).toBe(true);
    for (const t of SPIRE_THEMES) expect(blendsEdges(floorZone(t)), t).toBe(false);
  });
});
