import { describe, expect, it } from 'vitest';
import { PLACE_ICONS, SEA_CHARS, TILE, WALKABLE_CHARS, ZONES } from '../content/zones';
import { crystalFlag } from '../content/topics';
import {
  ANY_CRYSTAL_EMOJI,
  HIDDEN_PLACE_EMOJI,
  STAR_HALF_W,
  MAP_MIN_PX,
  STAR_PERCH,
  FLAG_PERCH,
  boatNudge,
  pinsBelow,
  boxesMeet,
  nudgeClear,
  edgeLabelCovers,
  edgeLabelSpot,
  seaEdgeLabel,
  PLACE_EMOJI,
  fogMarker,
  fogMarkerAt,
  mapCaption,
  mapCellColor,
  overworldOf,
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
  it('every zone in the world can be placed on the map it sits on — the Silver Shallows on its own (#75 item 14)', () => {
    for (const id of Object.keys(ZONES) as (keyof typeof ZONES)[]) {
      expect(whereOnMap(ZONES, overworldOf(ZONES, id), id, null), id).not.toBeNull();
    }
  });
  it("a place's map is the overworld it opens onto: Eldergrove's is the Silver Shallows (#75 item 14f)", () => {
    expect(overworldOf(ZONES, 'eldergrove').id).toBe('silver-shallows');
    expect(overworldOf(ZONES, 'silver-shallows').id).toBe('silver-shallows');
    expect(overworldOf(ZONES, 'clockwork-depths-b3').id).toBe('dawnreach');
    expect(overworldOf(ZONES, 'remembrance-hill').id).toBe('dawnreach');
    expect(whereOnMap(ZONES, ZONES['silver-shallows'], 'eldergrove', null)).toMatchObject({ x: 12, y: 39, place: 'Eldergrove' });
    // The search follows exits, not a fallback: a floor below Eldergrove is on the Shallows too.
    const below = { ...ZONES, numbria: { ...ZONES.numbria, exits: [{ x: 0, y: 0, to: 'eldergrove' as const, spawnX: 20, spawnY: 1 }] } };
    expect(overworldOf(below, 'numbria').id).toBe('silver-shallows');
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
    // The Spire stands in its ring of fog, Remembrance Hill in its own (#75 item 14e),
    // the Dragon's Roost in its clouds (#75 item 15b).
    for (const p of dawn.places!.filter((p) => !['The Crystal Spire', 'Remembrance Hill', "Dragon's Roost"].includes(p.name))) {
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

describe('sea-edge labels keep clear of the map\'s markers (#75 item 14d review)', () => {
  const shallows = ZONES['silver-shallows'];
  const toShallows = seaEdgeLabel('east', shallows.name);
  const toDawnreach = seaEdgeLabel('west', dawn.name);

  it('say where the sea leads', () => {
    expect(toShallows).toBe('Silver Shallows ▶');
    expect(toDawnreach).toBe('◀ Dawnreach');
  });

  it('on Dawnreach sit clear of every place and Marlow\'s dock — the Quiet Paws shrine too — on the narrowest map', () => {
    const marks = [...(dawn.places ?? []), { x: 71, y: 30 }];
    const spot = edgeLabelSpot('east', 80, 60, marks, null, toShallows);
    for (const m of marks) expect(edgeLabelCovers('east', 80, 60, spot, m, toShallows), `${m.x},${m.y}`).toBe(false);
    const west = edgeLabelSpot('west', 64, 44, shallows.landmarks ?? [], null, toDawnreach);
    for (const m of shallows.landmarks ?? []) expect(edgeLabelCovers('west', 64, 44, west, m, toDawnreach), m.name).toBe(false);
  });

  it('never sit on the ⭐, wherever on either map the hero is, at the narrowest map\'s pixel sizes', () => {
    for (const z of [dawn, shallows]) {
      const cols = z.map[0].length;
      const rows = z.map.length;
      const marks = [...(z.places ?? []), ...(z.landmarks ?? [])];
      for (const link of z.seaLinks ?? []) {
        if (link.side !== 'west' && link.side !== 'east') continue;
        const text = seaEdgeLabel(link.side, ZONES[link.to].name);
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const here = { x, y };
            const spot = edgeLabelSpot(link.side, cols, rows, marks, here, text);
            expect(edgeLabelCovers(link.side, cols, rows, spot, here, text, STAR_HALF_W), `${z.id} label vs ⭐ at ${x},${y}`).toBe(false);
          }
        }
      }
    }
  });

  it('on Dawnreach never land on a place to keep a gap from something else, wherever the ⭐ is in the east half', () => {
    const marks = [...(dawn.places ?? []), { x: 71, y: 30 }];
    for (let y = 0; y < 60; y++) {
      for (let x = 40; x < 80; x++) {
        const spot = edgeLabelSpot('east', 80, 60, marks, { x, y }, toShallows);
        for (const m of marks) expect(edgeLabelCovers('east', 80, 60, spot, m, toShallows, undefined, 0), `⭐ ${x},${y} vs ${m.x},${m.y}`).toBe(false);
      }
    }
  });

  it('move off the ⭐ by the puffer, and not onto Gull Rock', () => {
    const here = { x: 3, y: 27 };
    const marks = shallows.landmarks ?? [];
    const spot = edgeLabelSpot('west', 64, 44, marks, here, toDawnreach);
    expect(edgeLabelCovers('west', 64, 44, spot, here, toDawnreach, STAR_HALF_W)).toBe(false);
    for (const m of marks) expect(edgeLabelCovers('west', 64, 44, spot, m, toDawnreach), m.name).toBe(false);
    // A ⭐ on the far side of the map doesn't move it.
    expect(edgeLabelSpot('west', 64, 44, marks, { x: 60, y: 27 }, toDawnreach)).toBe(edgeLabelSpot('west', 64, 44, marks, null, toDawnreach));
  });
});

describe('the road to Remembrance Hill (#75 item 14e)', () => {
  const bank = ZONES.dawnreach.fogs!.find((f) => f.id === 'hill-fog')!;
  it('its bank shows no crystal: no crystal clears it', () => {
    expect(fogMarker(bank)).toBeNull();
  });
});

describe('markers that would pile up on the menu map (#117n)', () => {
  it('nudgeClear: no nudge when clear; else the smallest one straight out, turning round only when blocked', () => {
    const pin = { x: 50, y: 50, hw: 8, hh: 8 };
    expect(nudgeClear({ x: 100, y: 50, hw: 8, hh: 8 }, [pin])).toEqual({ dx: 0, dy: 0 });
    // Just above it: pushed straight up until there's a 3 px gap.
    const up = nudgeClear({ x: 50, y: 40, hw: 8, hh: 8 }, [pin]);
    expect(up.dx).toBe(0);
    expect(up.dy).toBe(-9); // 40 - 9 = 31: 19 px apart = 8 + 8 + 3
    // Right on top of it: up.
    expect(nudgeClear({ ...pin }, [pin]).dy).toBeLessThan(0);
    // Up is blocked too: it goes round.
    const round = nudgeClear({ x: 50, y: 40, hw: 8, hh: 8 }, [pin, { x: 50, y: 20, hw: 8, hh: 8 }]);
    expect(boxesMeet({ x: 50 + round.dx, y: 40 + round.dy, hw: 8, hh: 8 }, pin, 3)).toBe(false);
    expect(round.dx).not.toBe(0);
  });

  it('inside Eldergrove, the boat at any of its beaches clears the 🌳, the ⭐ and the 🚩 — the way it already lay', () => {
    const sea = ZONES['silver-shallows'];
    const grove = sea.places!.find((p) => p.name === 'Eldergrove')!;
    const here = whereOnMap(ZONES, sea, 'eldergrove', null)!;
    const flag = { x: grove.x, y: grove.y };
    const s = MAP_MIN_PX / sea.map[0].length;
    const box = (c: { x: number; y: number }, hw: number, hh: number, dx = 0, dy = 0) => ({ x: (c.x + 0.5) * s + dx, y: (c.y + 0.5) * s + dy, hw, hh });
    const star = { x: (grove.x + 0.5) * s - STAR_HALF_W, y: (grove.y + 0.5) * s - STAR_PERCH * 16 + 8, hw: STAR_HALF_W, hh: 8 };
    const pin = { x: (grove.x + 0.5) * s + 0.35 * 17, y: (grove.y + 0.5) * s - FLAG_PERCH * 15 + 7.5, hw: 8.5, hh: 7.5 };
    // The pins sit clear above the 🌳 (its 13 px emoji), so all three show.
    const tree = { x: (grove.x + 0.5) * s, y: (grove.y + 0.5) * s, hw: 8, hh: 6.5 };
    expect(boxesMeet(star, tree)).toBe(false);
    expect(boxesMeet(pin, tree)).toBe(false);
    // Every sea cell by the island's beaches is somewhere the boat can be moored.
    const moorings: { x: number; y: number }[] = [];
    for (let y = 30; y < 44; y++) {
      for (let x = 2; x < 24; x++) {
        if (sea.map[y][x] !== '~') continue;
        const byBeach = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => sea.map[y + oy]?.[x + ox] === ':');
        if (byBeach) moorings.push({ x, y });
      }
    }
    expect(moorings.length).toBeGreaterThan(10);
    let crowded = 0;
    for (const m of moorings) {
      const before = box(m, 8, 7);
      if ([box(grove, 8, 8), star, pin].some((b) => boxesMeet(before, b))) crowded++;
      const { dx, dy } = boatNudge(sea.map[0].length, sea.map.length, m, { icons: sea.places, here, shared: true, flag });
      const after = box(m, 8, 7, dx, dy);
      for (const b of [box(grove, 8, 8), star, pin]) expect(boxesMeet(after, b), `${m.x},${m.y}`).toBe(false);
      // Out the way it already lay from the island, never across it.
      const cx = (grove.x + 0.5) * s;
      const cy = (grove.y + 0.5) * s;
      expect(Math.hypot(after.x - cx, after.y - cy), `${m.x},${m.y}`).toBeGreaterThanOrEqual(Math.hypot(before.x - cx, before.y - cy) - 4);
    }
    // The north beach, where the island's path starts, was one of the crowded ones.
    expect(crowded).toBeGreaterThan(0);
    expect(boatNudge(sea.map[0].length, sea.map.length, { x: 12, y: 33 }, { icons: sea.places, here, shared: true, flag }).dy).toBeLessThan(0);
  });

  it('nudged off a place or a pin, the boat never leaves the map — over its edge is the title (r1)', () => {
    const inside = { inside: 0, total: 0 };
    for (const id of ['dawnreach', 'taleshore', 'silver-shallows'] as const) {
      const z = ZONES[id];
      const cols = z.map[0].length;
      const rows = z.map.length;
      const s = MAP_MIN_PX / cols;
      // How far a ⛵ at (x, y) nudged by (dx, dy) sticks out past the map's edges, in px.
      const over = (x: number, y: number, dx: number, dy: number) => {
        const cx = (x + 0.5) * s + dx;
        const cy = (y + 0.5) * s + dy;
        return Math.max(0, 8 - cx) + Math.max(0, cx + 8 - MAP_MIN_PX) + Math.max(0, 7 - cy) + Math.max(0, cy + 7 - rows * s);
      };
      // Every sea cell a boat can be left at: beside a beach or a dock.
      const moorings: { x: number; y: number }[] = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (!SEA_CHARS.has(z.map[y][x])) continue;
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => WALKABLE_CHARS.has(z.map[y + oy]?.[x + ox] ?? '#'))) moorings.push({ x, y });
        }
      }
      for (const m of moorings) {
        for (const flag of [null, ...(z.places ?? [])]) {
          const { dx, dy } = boatNudge(cols, rows, m, { icons: z.places, flag });
          inside.total++;
          if (dx || dy) inside.inside++;
          expect(over(m.x, m.y, dx, dy), `${id} ${m.x},${m.y} 🚩 ${flag?.name}`).toBeLessThanOrEqual(over(m.x, m.y, 0, 0));
        }
      }
    }
    // Plenty of them do get nudged.
    expect(inside.inside).toBeGreaterThan(100);
    // The one the review found: by Dawnreach's top edge, the 🚩 on the place below.
    const dawn = ZONES.dawnreach;
    const below = dawn.places!.find((p) => p.x === 68 && p.y === 10)!;
    const { dy } = boatNudge(dawn.map[0].length, dawn.map.length, { x: 64, y: 4 }, { icons: dawn.places, flag: below });
    expect((4 + 0.5) * (MAP_MIN_PX / dawn.map[0].length) + dy - 7).toBeGreaterThanOrEqual(0);
  });

  it('a boat out at sea, far from everything, is drawn right where it is moored', () => {
    const sea = ZONES['silver-shallows'];
    expect(boatNudge(sea.map[0].length, sea.map.length, { x: 30, y: 25 }, { icons: sea.places })).toEqual({ dx: 0, dy: 0 });
  });

  it("pins hang below a place in the map's top rows, never over the title above the map", () => {
    const sea = ZONES['silver-shallows'];
    const cols = sea.map[0].length;
    const marsh = sea.places!.find((p) => p.name === 'Foglight Marsh')!;
    const grove = sea.places!.find((p) => p.name === 'Eldergrove')!;
    expect(pinsBelow(cols, marsh.y)).toBe(true);
    expect(pinsBelow(cols, grove.y)).toBe(false);
    // Every place on every overworld: a pin above stays on the map (top ≥ 0 on the narrowest one), or it hangs below.
    for (const z of Object.values(ZONES)) {
      if (z.kind !== 'overworld') continue;
      const s = MAP_MIN_PX / z.map[0].length;
      for (const p of z.places ?? []) {
        if (!pinsBelow(z.map[0].length, p.y)) expect((p.y + 0.5) * s - FLAG_PERCH * 16, `${z.id} ${p.name}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

