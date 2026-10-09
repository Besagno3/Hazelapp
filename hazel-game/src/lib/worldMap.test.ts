import { describe, expect, it } from 'vitest';
import { PLACE_ICONS, TILE, ZONES } from '../content/zones';
import { crystalFlag } from '../content/topics';
import {
  ANY_CRYSTAL_EMOJI,
  HIDDEN_PLACE_EMOJI,
  PLACE_EMOJI,
  fogMarker,
  fogMarkerAt,
  mapCaption,
  mapCellColor,
  placeEmoji,
  whereOnMap,
} from './worldMap';

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
  it('every crystal region is on the map itself (#75 item 8)', () => {
    expect(whereOnMap(ZONES, dawn, 'numbria', null)).toMatchObject({ exact: false, place: 'Numbria' });
  });
  it('in a zone not on the map itself: the nearest place that is', () => {
    // As if Numbria had no icon and were reached through the Village instead.
    const zones = { ...ZONES, numbria: { ...ZONES.numbria, exits: [{ x: 43, y: 6, to: 'lumina-village' as const, spawnX: 1, spawnY: 13 }] } };
    const overworld = { ...dawn, exits: dawn.exits.filter((e) => e.to !== 'numbria') };
    expect(whereOnMap(zones, overworld, 'numbria', null)).toMatchObject({ exact: false, place: 'Lumina Village' });
  });
  it('every zone in the world can be placed on the map — the Silver Shallows on its own (#75 item 14)', () => {
    for (const id of Object.keys(ZONES) as (keyof typeof ZONES)[]) {
      const map = ZONES[id].kind === 'overworld' ? ZONES[id] : dawn;
      expect(whereOnMap(ZONES, map, id, null), id).not.toBeNull();
    }
  });
});

describe('PLACE_EMOJI', () => {
  it('gives every kind of place its own emoji, so the map and the list can be matched up', () => {
    const emoji = PLACE_ICONS.map((i) => PLACE_EMOJI[i]);
    expect(emoji.every(Boolean)).toBe(true);
    expect(new Set(emoji).size).toBe(emoji.length);
    expect(emoji).not.toContain(HIDDEN_PLACE_EMOJI);
  });
});

describe('placeEmoji (#75 item 7)', () => {
  const place = (name: string) => dawn.places!.find((p) => p.name === name)!;
  it('shows the Spire as a cloud until its ring of fog lifts, then as the tower', () => {
    const spire = place('The Crystal Spire');
    expect(placeEmoji(dawn, spire, {})).toBe(HIDDEN_PLACE_EMOJI);
    expect(placeEmoji(dawn, spire, { [crystalFlag('science')]: true })).toBe(PLACE_EMOJI.tower);
  });
  it('leaves places outside the fog alone, even one just past a bank (the shrine)', () => {
    for (const p of dawn.places!.filter((p) => p.name !== 'The Crystal Spire')) {
      expect(placeEmoji(dawn, p, {}), p.name).toBe(PLACE_EMOJI[p.icon]);
    }
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
  it('down a dungeon: the floor title names the place, so no "(past …)"; a mere name prefix is not enough', () => {
    const depths = { x: 1, y: 1, exact: false, place: 'Clockwork Depths' };
    expect(mapCaption(depths, 'Clockwork Depths · B2 — The Gear Halls', 'Dawnreach')).toBe(
      "You're here: Clockwork Depths · B2 — The Gear Halls",
    );
    expect(mapCaption({ ...depths, place: 'Clockwork' }, 'Clockwork Depths', 'Dawnreach')).toBe(
      "You're here: Clockwork Depths (past Clockwork)",
    );
  });
});

describe('fog markers (#75 item 7)', () => {
  const bank = (id: string) => dawn.fogs!.find((f) => f.id === id)!;
  it("shows the crystal that clears a bank, or 💎 when any crystal will", () => {
    expect(fogMarker(bank('math-fog'))).toBe('🔢');
    expect(fogMarker(bank('creativity-fog'))).toBe('🎨');
    expect(fogMarker(bank('spire-fog'))).toBe(ANY_CRYSTAL_EMOJI);
    expect(fogMarker(bank('shrine-fog'))).toBe(ANY_CRYSTAL_EMOJI);
  });
  it("sits mid-bank, but moves to the bank's top edge when a place icon is in the middle", () => {
    expect(fogMarkerAt(bank('math-fog'), dawn.places!)).toEqual({ x: 21, y: 17.5 });
    const spire = fogMarkerAt(bank('spire-fog'), dawn.places!);
    expect(spire).toEqual({ x: 40, y: 42 });
  });
});
