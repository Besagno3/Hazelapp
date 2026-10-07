import { describe, it, expect } from 'vitest';
import { blendSheetsFor, toKaplayAnims } from './worldSprites';
import { ZONES } from '../../content/zones';
import { floorZone } from '../../content/spire';

describe('toKaplayAnims', () => {
  it('maps fps→speed and defaults loop to true', () => {
    const out = toKaplayAnims({
      idle: { from: 0, to: 3, fps: 6 },
      walk: { from: 4, to: 7, fps: 10, loop: false },
    });
    expect(out.idle).toEqual({ from: 0, to: 3, loop: true, speed: 6 });
    expect(out.walk).toEqual({ from: 4, to: 7, loop: false, speed: 10 });
  });
});

describe('blendSheetsFor (#71b)', () => {
  it("a zone's own edge-blend sheet plus every neighbour's, each once", () => {
    expect(blendSheetsFor(ZONES['lumina-village'])).toEqual(['lumina-village', 'dawnreach']);
    const dawn = blendSheetsFor(ZONES.dawnreach);
    expect(dawn[0]).toBe('dawnreach');
    expect(new Set(dawn).size).toBe(dawn.length);
    expect(dawn).toEqual(expect.arrayContaining(ZONES.dawnreach.exits.map((e) => e.to)));
  });
  it("none for the Spire's floors (they don't blend)", () => {
    expect(blendSheetsFor(floorZone('archive'))).toEqual([]);
  });
});
