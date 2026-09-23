/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BUILDING_STYLES, ROOF_COLORS, ZONE_IDS } from './zones';
import {
  PROPS_FRAMES,
  PROPS_SHEET,
  SPIRE_SHEET,
  TILESET_FRAMES,
  TILE_FRAME,
  ROOF_FRAMES,
  ROOF_SHEET,
  TOWN_FRAMES,
  townSheet,
  battleBackdrop,
  roofFrame,
  groundVariant,
  tilesetSheet,
} from './tiles';

const pub = (p: string) => join(process.cwd(), 'public', p);
function pngSize(p: string) {
  const buf = readFileSync(pub(p));
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('16-bit tilesets', () => {
  it('every zone has a tileset strip of TILESET_FRAMES 32px tiles', () => {
    for (const id of ZONE_IDS) {
      expect(existsSync(pub(tilesetSheet(id))), id).toBe(true);
      expect(pngSize(tilesetSheet(id))).toEqual({ w: TILESET_FRAMES * 32, h: 32 });
    }
  });
  it('every zone has a battle backdrop', () => {
    for (const id of ZONE_IDS) expect(existsSync(pub(battleBackdrop(id))), id).toBe(true);
  });
  it('props strip and Spire tower are the expected sizes', () => {
    expect(pngSize(PROPS_SHEET)).toEqual({ w: PROPS_FRAMES * 32, h: 32 });
    expect(pngSize(SPIRE_SHEET)).toEqual({ w: 32, h: 64 });
  });
  it('frame indices stay inside the strip', () => {
    const all = [...TILE_FRAME.ground, TILE_FRAME.path, ...TILE_FRAME.water, TILE_FRAME.solid, TILE_FRAME.deco, TILE_FRAME.exit];
    for (const f of all) expect(f).toBeLessThan(TILESET_FRAMES);
  });
  it('groundVariant is deterministic and always a ground frame', () => {
    for (let x = 0; x < 22; x++) {
      for (let y = 0; y < 14; y++) {
        const v = groundVariant(x, y);
        expect(TILE_FRAME.ground).toContain(v);
        expect(groundVariant(x, y)).toBe(v);
      }
    }
  });
});

describe('town tiles + roofs (#72)', () => {
  it('every architecture style has a town sheet; the roof strip has 9 frames per colour', () => {
    for (const style of BUILDING_STYLES) {
      expect(pngSize(townSheet(style)), style).toEqual({ w: TOWN_FRAMES * 32, h: 32 });
    }
    expect(ROOF_FRAMES).toBe(ROOF_COLORS.length * 9);
    expect(pngSize(ROOF_SHEET)).toEqual({ w: ROOF_FRAMES * 32, h: 32 });
  });
  it('roofFrame picks nine-slice pieces per colour', () => {
    expect(roofFrame('red', 0, 0, 9, 6)).toBe(0); // top-left
    expect(roofFrame('red', 4, 3, 9, 6)).toBe(4); // middle
    expect(roofFrame('red', 8, 5, 9, 6)).toBe(8); // bottom-right
    expect(roofFrame('blue', 0, 0, 9, 6)).toBe(9);
    expect(roofFrame(ROOF_COLORS[ROOF_COLORS.length - 1], 8, 5, 9, 6)).toBe(ROOF_FRAMES - 1);
  });
});
