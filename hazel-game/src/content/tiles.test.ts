/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BUILDING_STYLES, ROOF_COLORS, ZONE_IDS } from './zones';
import { SPIRE_THEMES } from './spire';
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
  namedTilesetSheet,
  SPIRE_PROPS_FRAMES,
  SPIRE_PROPS_SHEET,
  groundVariant,
  tilesetSheet, OVERWORLD_FRAME, OVERWORLD_FRAMES, OVERWORLD_SHEET, OVERWORLD_DOCK_FRAME, BOAT_FRAME, BOAT_FRAMES, BOAT_SHEET, LIGHTHOUSE_FRAMES, LIGHTHOUSE_LAMP, LIGHTHOUSE_SHEET, FOG_PUFF_FRAMES, FOG_PUFF_SHEET, FOG_PUFF_SIZE,
  BLEND_COLS, BLEND_ROWS, BLEND_FRAMES, BLEND_CLASS, BLEND_WATER_STEP, blendPairFrame, blendShapeFrame, blendSheet } from './tiles';

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
  it('every zone has an edge-blend sheet: a 16-wide grid of 32px tiles holding every frame (#71b)', () => {
    for (const id of ZONE_IDS) {
      expect(existsSync(pub(blendSheet(id))), id).toBe(true);
      expect(pngSize(blendSheet(id)), id).toEqual({ w: BLEND_COLS * 32, h: BLEND_ROWS * 32 });
    }
    expect(BLEND_FRAMES).toBeLessThanOrEqual(BLEND_COLS * BLEND_ROWS);
    // The first shape, the last water pair and the last land pair bracket the layout exactly.
    expect(blendShapeFrame(BLEND_CLASS.sand, 1)).toBe(0);
    expect(blendPairFrame(BLEND_CLASS.water, BLEND_CLASS.path, 15) + BLEND_WATER_STEP).toBe(134);
    expect(blendPairFrame(BLEND_CLASS.ground, BLEND_CLASS.path, 15)).toBe(BLEND_FRAMES - 1);
    // A pair must go low → high; anything else fails loudly instead of drawing another pair's tile.
    expect(() => blendPairFrame(BLEND_CLASS.path, BLEND_CLASS.sand, 3)).toThrow();
    expect(() => blendPairFrame(BLEND_CLASS.ground, BLEND_CLASS.ground, 3)).toThrow();
  });
  it('every zone has a battle backdrop', () => {
    for (const id of ZONE_IDS) expect(existsSync(pub(battleBackdrop(id))), id).toBe(true);
  });
  it('the overworld sheet has one 32px frame per OVERWORLD_FRAME entry (#75)', () => {
    expect(pngSize(OVERWORLD_SHEET)).toEqual({ w: OVERWORLD_FRAMES * 32, h: 32 });
    // The fog banks' puffs (#75 item 7): one strip of soft cloud shapes.
    expect(pngSize(FOG_PUFF_SHEET)).toEqual({ w: FOG_PUFF_FRAMES * FOG_PUFF_SIZE, h: FOG_PUFF_SIZE });
    const icons = Object.values(OVERWORLD_FRAME.icon);
    // The dock (#75 item 14) was appended after the icons, then Remembrance Hill's icon (#75 item 14e).
    expect(OVERWORLD_DOCK_FRAME).toBe(15);
    expect(OVERWORLD_FRAME.icon.hill).toBe(OVERWORLD_FRAMES - 1);
    expect(Math.max(...icons.filter((f) => f !== OVERWORLD_FRAME.icon.hill))).toBe(OVERWORLD_DOCK_FRAME - 1);
    // Marlow's boat: the whole boat, then its hull's front, two bob frames each.
    expect(pngSize(BOAT_SHEET)).toEqual({ w: BOAT_FRAMES * 32, h: 32 });
    expect([...BOAT_FRAME.whole, ...BOAT_FRAME.hullFront].sort()).toEqual([0, 1, 2, 3]);
    // Gull Rock's lighthouse: 2 tiles wide, 4 tall, its lamp inside the frame's top quarter.
    expect(pngSize(LIGHTHOUSE_SHEET)).toEqual({ w: LIGHTHOUSE_FRAMES * 64, h: 128 });
    expect(LIGHTHOUSE_LAMP.x).toBeLessThan(64);
    expect(LIGHTHOUSE_LAMP.y).toBeLessThan(32);
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

describe('Spire floor art (#74)', () => {
  it('every floor theme has a tileset and the props strip is sized', () => {
    for (const theme of SPIRE_THEMES) {
      expect(pngSize(namedTilesetSheet(`spire-${theme}`)), theme).toEqual({ w: TILESET_FRAMES * 32, h: 32 });
    }
    expect(pngSize(SPIRE_PROPS_SHEET)).toEqual({ w: SPIRE_PROPS_FRAMES * 32, h: 32 });
  });
});
