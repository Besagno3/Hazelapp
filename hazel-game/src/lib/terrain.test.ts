import { describe, expect, it } from 'vitest';
import { ZONES, ZONE_IDS, TILE, VIEW_COLS, VIEW_ROWS, type ZoneDef } from '../content/zones';
import { SPIRE_THEMES, floorZone } from '../content/spire';
import { TILESET_FRAMES, TILE_FRAME, TOWN_FRAME, TOWN_FRAMES, groundVariant } from '../content/tiles';
import { NO_OVERLAY, WATER, baseTile, overlayTile, terrainLayers, visibleRange, waterFrame } from './terrain';

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
        } else {
          expect(f >= 0 && f < TOWN_FRAMES, `${x},${y}`).toBe(true);
        }
        // Only scenery, flowers, exits and hidden passages get a zone-tileset overlay.
        const ch = z.map[y][x];
        expect(L.overFrame[i] !== NO_OVERLAY, `${x},${y} '${ch}'`).toBe('#,EH'.includes(ch));
        // A hidden passage must look exactly like solid scenery.
        if (ch === 'H') expect(L.overFrame[i], `${x},${y} hidden passage`).toBe(TILE_FRAME.solid);
      }
    }
  });

  it('paths and exits use the path tile; exits add the exit marker; water animates', () => {
    const z = ZONES['lumina-field'];
    expect(baseTile(z, 5, 6)).toEqual({ sheet: 'zone', frame: TILE_FRAME.path }); // '='
    expect(baseTile(z, 0, 5)).toEqual({ sheet: 'zone', frame: TILE_FRAME.path }); // 'E'
    expect(overlayTile('E')).toBe(TILE_FRAME.exit);
    expect(baseTile(z, 16, 9)).toEqual({ sheet: 'zone', frame: WATER }); // '~'
  });

  it('plain ground uses the deterministic speckle variant, scenery overlays on top', () => {
    const z = ZONES['lumina-field'];
    expect(baseTile(z, 1, 1)).toEqual({ sheet: 'zone', frame: groundVariant(1, 1) });
    expect(baseTile(z, 0, 0)).toEqual({ sheet: 'zone', frame: groundVariant(0, 0) }); // '#'
    expect(overlayTile('#')).toBe(TILE_FRAME.solid);
    expect(overlayTile(',')).toBe(TILE_FRAME.deco);
    expect(overlayTile('.')).toBe(NO_OVERLAY);
  });

  it('props are not terrain: a save crystal sits on plain ground with no overlay', () => {
    const z = ZONES['lumina-field'];
    expect(z.map[3][4]).toBe('S');
    expect(baseTile(z, 4, 3)).toEqual({ sheet: 'zone', frame: groundVariant(4, 3) });
    expect(overlayTile('S')).toBe(NO_OVERLAY);
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
