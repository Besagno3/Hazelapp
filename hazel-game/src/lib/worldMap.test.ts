import { describe, expect, it } from 'vitest';
import { TILE, ZONES } from '../content/zones';
import { mapCellColor, whereOnMap } from './worldMap';

const dawn = ZONES.dawnreach;

describe('mapCellColor', () => {
  it('gives sea, sand, roads, trees and mountains distinct colours', () => {
    const colours = ['~', ':', '=', '#', '^', '.'].map(mapCellColor);
    expect(new Set(colours).size).toBe(colours.length);
  });
  it('draws a place tile and anything unknown as grass', () => {
    expect(mapCellColor('P')).toBe(mapCellColor('.'));
    expect(mapCellColor('?')).toBe(mapCellColor('.'));
  });
});

describe('whereOnMap', () => {
  it("on the overworld: the hero's own tile, exactly", () => {
    expect(whereOnMap(ZONES, dawn, 'dawnreach', { x: 20 * TILE + 5, y: 30 * TILE + 9 })).toEqual({
      x: 20,
      y: 30,
      exact: true,
    });
  });
  it('on the overworld with no saved position: the spawn', () => {
    expect(whereOnMap(ZONES, dawn, 'dawnreach', null)).toEqual({ x: dawn.spawn.x, y: dawn.spawn.y, exact: true });
  });
  it("inside a place: that place's icon", () => {
    const m = whereOnMap(ZONES, dawn, 'lumina-village', null);
    expect(m).toMatchObject({ exact: false, place: 'Lumina Village' });
    expect(dawn.map[m!.y][m!.x]).toBe('P');
  });
  it('in a zone not on the map yet: the nearest place on it (Numbria → Lumina Field)', () => {
    expect(whereOnMap(ZONES, dawn, 'numbria', null)).toMatchObject({ exact: false, place: 'Lumina Field' });
  });
  it('every zone in the world can be placed on the map', () => {
    for (const id of Object.keys(ZONES) as (keyof typeof ZONES)[]) {
      expect(whereOnMap(ZONES, dawn, id, null), id).not.toBeNull();
    }
  });
});
