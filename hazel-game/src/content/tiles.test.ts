/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ZONE_IDS } from './zones';
import {
  PROPS_FRAMES,
  PROPS_SHEET,
  SPIRE_SHEET,
  TILESET_FRAMES,
  TILE_FRAME,
  battleBackdrop,
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
