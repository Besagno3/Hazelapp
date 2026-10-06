import { describe, expect, it } from 'vitest';
import { PLACE_ICONS, TILE, ZONES } from '../content/zones';
import { PLACE_EMOJI, mapCaption, mapCellColor, whereOnMap } from './worldMap';

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

describe('PLACE_EMOJI', () => {
  it('gives every kind of place its own emoji, so the map and the list can be matched up', () => {
    const emoji = PLACE_ICONS.map((i) => PLACE_EMOJI[i]);
    expect(emoji.every(Boolean)).toBe(true);
    expect(new Set(emoji).size).toBe(emoji.length);
  });
});

describe('mapCaption', () => {
  it('out on the overworld', () => {
    expect(mapCaption({ x: 1, y: 1, exact: true }, 'Dawnreach', 'Dawnreach')).toBe("You're out on Dawnreach");
  });
  it('inside a place: its name as written, with no article to get wrong', () => {
    expect(mapCaption({ x: 1, y: 1, exact: false, place: 'The Crystal Spire' }, 'The Crystal Spire', 'Dawnreach')).toBe(
      "You're here: The Crystal Spire",
    );
    expect(
      mapCaption({ x: 1, y: 1, exact: false, place: 'Shrine of First Light' }, 'Shrine of First Light', 'Dawnreach'),
    ).toBe("You're here: Shrine of First Light");
  });
  it('beyond a place (a zone not on the map yet), and nowhere on the map at all', () => {
    expect(mapCaption({ x: 1, y: 1, exact: false, place: 'Lumina Field' }, 'Numbria', 'Dawnreach')).toBe(
      "You're here: Numbria (past Lumina Field)",
    );
    expect(mapCaption(null, 'Somewhere', 'Dawnreach')).toBe("You're here: Somewhere");
  });
});
