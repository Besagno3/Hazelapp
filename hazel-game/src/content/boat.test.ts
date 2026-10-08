import { describe, it, expect } from 'vitest';
import { LANDING_CHARS, SEA_CHARS, TILE, ZONES, GREAT_FOGBANK, fogAt, tileAt } from './zones';
import {
  BOAT_HOME,
  BOAT_MENDED,
  BOAT_QUEST_ID,
  MARLOW,
  boatFetch,
  boatSpot,
  hasBoat,
  moorBoat,
  validMooring,
} from './boat';
import { QUESTS, questConversation, questFor, questOfferedFlag } from './quests';
import { NPC_DEFS } from './npcs';
import { ACT2_SEEN } from './story';
import { defaultSave, normalizeSave } from '../lib/save';
import {
  BOAT_SPEED,
  canLand,
  edgeOf,
  nearestSea,
  oppositeSide,
  passable,
  reachableBySea,
  seaCrossing,
  seaEntryCell,
} from '../lib/travel';
import { transitionFor } from '../lib/transition';
import type { SaveData } from '../types';

const dawn = ZONES.dawnreach;
const sea = ZONES['silver-shallows'];
const px = (x: number, y: number) => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
const mended = (s: Partial<SaveData> = {}): SaveData => ({
  ...defaultSave(),
  flags: { ...defaultSave().flags, [BOAT_MENDED]: true },
  ...s,
});

describe('travel by sea (#75 item 14)', () => {
  it('the boat sails open sea only, a little quicker than walking, and lands on beaches and docks', () => {
    expect(passable('~', 'boat')).toBe(true);
    for (const ch of [':', '|', '.', '=', '#', '^', 'P']) expect(passable(ch, 'boat'), ch).toBe(false);
    expect(passable('|', 'foot')).toBe(true);
    expect(passable('~', 'foot')).toBe(false);
    expect([...LANDING_CHARS].sort()).toEqual([':', '|']);
    expect(canLand(':') && canLand('|')).toBe(true);
    expect(canLand('.') || canLand('~') || canLand('P')).toBe(false);
    expect(BOAT_SPEED).toBe(1.5);
  });

  it('edges and their opposites', () => {
    expect(edgeOf(dawn, 0, 10)).toBe('west');
    expect(edgeOf(dawn, 79, 10)).toBe('east');
    expect(edgeOf(dawn, 10, 0)).toBe('north');
    expect(edgeOf(dawn, 10, 59)).toBe('south');
    expect(edgeOf(dawn, 10, 10)).toBeNull();
    expect(oppositeSide('east')).toBe('west');
    expect(oppositeSide('north')).toBe('south');
  });

  it("sailing off Dawnreach's east edge comes out one in from the Shallows' west edge, and back", () => {
    expect(seaCrossing(dawn, 79, 30, ZONES)).toEqual({ side: 'east', to: 'silver-shallows', x: 1, y: 22 });
    expect(seaCrossing(sea, 0, 22, ZONES)).toEqual({ side: 'west', to: 'dawnreach', x: 78, y: 30 });
    // Not on a linked edge, not on the edge at all, or on a row with no sea beyond: no crossing.
    expect(seaCrossing(dawn, 0, 30, ZONES)).toBeNull();
    expect(seaCrossing(dawn, 70, 30, ZONES)).toBeNull();
    expect(seaCrossing(dawn, 79, 2, ZONES)).toBeNull(); // Dawnreach row 2 is above the Shallows' top
  });

  it('every sea link has its mirror, and every open-sea cell on a linked edge crosses onto open sea', () => {
    for (const z of Object.values(ZONES)) {
      for (const link of z.seaLinks ?? []) {
        const back = ZONES[link.to].seaLinks?.find((l) => l.side === oppositeSide(link.side) && l.to === z.id);
        expect(back, `${z.id} → ${link.to} has a way back`).toBeDefined();
        expect(back!.shift ?? 0, `${z.id} ↔ ${link.to} shift`).toBe(-(link.shift ?? 0));
        const cols = z.map[0].length;
        const rows = z.map.length;
        const edge =
          link.side === 'east' || link.side === 'west'
            ? Array.from({ length: rows }, (_, y) => ({ x: link.side === 'east' ? cols - 1 : 0, y }))
            : Array.from({ length: cols }, (_, x) => ({ x, y: link.side === 'south' ? rows - 1 : 0 }));
        let crossings = 0;
        for (const c of edge) {
          const out = seaCrossing(z, c.x, c.y, ZONES);
          if (!out) continue;
          crossings++;
          expect(SEA_CHARS.has(tileAt(ZONES[out.to], out.x, out.y)), `${z.id} ${c.x},${c.y}`).toBe(true);
          // …and sailing straight back from there lands where we left.
          const t = ZONES[out.to];
          const backEdge = link.side === 'east' ? { x: 0, y: out.y } : link.side === 'west' ? { x: t.map[0].length - 1, y: out.y } : null;
          if (backEdge) expect(seaCrossing(t, backEdge.x, backEdge.y, ZONES)?.y).toBe(c.y);
        }
        expect(crossings, `${z.id} ${link.side} crosses somewhere`).toBeGreaterThan(10);
      }
    }
  });

  it('nearest sea, reachable sea, and where boats come in', () => {
    expect(nearestSea(dawn, 71, 30)).toEqual({ x: 71, y: 30 });
    expect(nearestSea(dawn, 70, 30)).not.toEqual({ x: 70, y: 30 }); // the dock itself isn't sea
    expect(nearestSea(dawn, 40, 30)).toBeNull(); // the Village, far inland
    expect(seaEntryCell(sea, 'west')).toEqual({ x: 1, y: 22 });
    const fromDock = reachableBySea(dawn, BOAT_HOME);
    expect(fromDock.has('79,30')).toBe(true); // out to the Shallows' edge
    expect(fromDock.has('13,8')).toBe(false); // Numbria's lake is land-locked
  });

  it('sailing from one sea to the next slides like neighbouring screens (reduced motion cuts)', () => {
    expect(transitionFor('east', 'overworld', 'overworld', false)).toBe('slide');
    expect(transitionFor('east', 'overworld', 'overworld', true)).toBe('cut');
    expect(transitionFor('east', 'overworld', 'field', false)).toBe('fade');
  });
});

describe("Marlow's dock, the Silver Shallows and its islands (#75 item 14)", () => {
  it("the boat's home is open sea beside Marlow's dock, east of Starfall Coast, with the open sea beyond", () => {
    expect(BOAT_HOME).toEqual({ zoneId: 'dawnreach', x: 71, y: 30 });
    expect(validMooring(BOAT_HOME)).toBe(true);
    expect([tileAt(dawn, 69, 30), tileAt(dawn, 70, 30)]).toEqual(['|', '|']);
    // A dock stands in the sea and leads ashore.
    for (const z of Object.values(ZONES)) {
      z.map.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (ch !== '|') return;
          const around = [tileAt(z, x + 1, y), tileAt(z, x - 1, y), tileAt(z, x, y + 1), tileAt(z, x, y - 1)];
          expect(around.some((c) => SEA_CHARS.has(c)), `${z.id} dock ${x},${y} touches the sea`).toBe(true);
          expect(around.some((c) => c === ':' || c === '|'), `${z.id} dock ${x},${y} leads ashore`).toBe(true);
        }),
      );
    }
    const coast = dawn.places!.find((p) => p.name === 'Starfall Coast')!;
    expect(BOAT_HOME.x - coast.x).toBeLessThanOrEqual(8);
    expect(BOAT_HOME.y).toBe(coast.y);
  });

  it('every island beach can be reached by boat from where it sails in; the Great Fogbank holds the far side', () => {
    const entry = seaEntryCell(sea, 'west')!;
    const open = reachableBySea(sea, entry, (x, y) => !!fogAt(sea, x, y, {}));
    const landings: string[] = [];
    sea.map.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (!LANDING_CHARS.has(ch)) return;
        const nextToSea = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => open.has(`${x + dx},${y + dy}`));
        if (nextToSea) landings.push(`${x},${y}`);
      }),
    );
    expect(landings.length).toBeGreaterThan(10);
    // Gull Rock (its lighthouse) and Sandpiper Cay (its chest) both have a beach the boat can reach.
    const nearIsland = (x0: number, x1: number, y0: number, y1: number) =>
      landings.some((c) => {
        const [x, y] = c.split(',').map(Number);
        return x >= x0 && x <= x1 && y >= y0 && y <= y1;
      });
    expect(nearIsland(5, 18, 13, 22)).toBe(true);
    expect(nearIsland(22, 30, 29, 33)).toBe(true);
    const fogbank = sea.fogs!.find((f) => f.id === GREAT_FOGBANK)!;
    expect(fogbank.x + fogbank.w).toBe(sea.map[0].length);
    expect(fogbank.h).toBe(sea.map.length);
  });

  it('Lamplighter Ness keeps the lighthouse on Gull Rock, and points onward', () => {
    const ness = NPC_DEFS['gull-lamplighter'];
    expect(ness.name).toBe('Lamplighter Ness');
    const at = sea.npcs.find((n) => n.defId === 'gull-lamplighter')!;
    expect(sea.buildings!.find((b) => b.id === 'gull-lighthouse')).toBeDefined();
    expect(tileAt(sea, at.x, at.y)).toBe('F');
    const said = ness.lines.map((l) => (typeof l === 'string' ? l : l.text)).join(' ');
    expect(said).toMatch(/Sandpiper Cay/);
    expect(said).toMatch(/Great Fogbank/);
  });
});

describe('the boat in the save (#75 item 14)', () => {
  it('no boat before the quest; then at Marlow\'s dock; then wherever it was left — and none while you sail it', () => {
    expect(hasBoat({})).toBe(false);
    expect(boatSpot(defaultSave())).toBeNull();
    expect(boatSpot(mended())).toEqual(BOAT_HOME);
    const left = { zoneId: 'silver-shallows' as const, x: 3, y: 22 };
    expect(boatSpot(mended({ boat: left }))).toEqual(left);
    expect(boatSpot(mended({ boat: left, aboard: true }))).toBeNull();
  });

  it('leaving the boat mid-voyage moors it on the sea under the hero — or the nearest sea, or home', () => {
    expect(moorBoat(mended({ aboard: true, zoneId: 'silver-shallows', pos: px(3, 22) }))).toEqual({
      aboard: false,
      boat: { zoneId: 'silver-shallows', x: 3, y: 22 },
    });
    // Saved a step onto the dock: the sea beside it.
    expect(moorBoat(mended({ aboard: true, zoneId: 'dawnreach', pos: px(70, 30) })).boat).toMatchObject({ zoneId: 'dawnreach' });
    // Nowhere near the sea: back to Marlow's dock (null = home).
    expect(moorBoat(mended({ aboard: true, zoneId: 'dawnreach', pos: px(40, 30) }))).toEqual({ aboard: false, boat: null });
    // Ashore already: nothing moves.
    const ashore = mended({ boat: { zoneId: 'silver-shallows', x: 3, y: 22 } });
    expect(moorBoat(ashore)).toEqual({ aboard: false, boat: ashore.boat });
  });

  it('a saved boat must float on open sea, and a hero is only aboard with a boat, afloat', () => {
    const d = defaultSave();
    expect([d.boat, d.aboard]).toEqual([null, false]);
    const flags = { [BOAT_MENDED]: true };
    expect(normalizeSave({ flags, boat: { zoneId: 'silver-shallows', x: 3, y: 22 } }).boat).toEqual({ zoneId: 'silver-shallows', x: 3, y: 22 });
    expect(normalizeSave({ flags, boat: { zoneId: 'dawnreach', x: 40, y: 30 } }).boat).toBeNull(); // on land
    expect(normalizeSave({ flags, boat: { zoneId: 'nowhere', x: 1, y: 1 } }).boat).toBeNull();
    expect(normalizeSave({ flags, boat: 'yes' }).boat).toBeNull();
    const afloat = { flags, zoneId: 'silver-shallows', pos: px(3, 22), aboard: true };
    expect(normalizeSave(afloat).aboard).toBe(true);
    expect(normalizeSave({ ...afloat, flags: {} }).aboard).toBe(false); // no boat yet
    expect(normalizeSave({ ...afloat, pos: px(11, 21) }).aboard).toBe(false); // standing on Gull Rock
    expect(normalizeSave({ flags, zoneId: 'dawnreach', pos: px(71, 30) }).aboard).toBe(false); // older saves
  });

  it('Old Marlow rows the boat home when it was left somewhere else and the hero is ashore', () => {
    const away = mended({ boat: { zoneId: 'silver-shallows', x: 3, y: 22 } });
    const fetch = boatFetch(MARLOW, away)!;
    expect(fetch.lines.join(' ')).toMatch(/row her home/);
    expect(boatSpot(fetch.finish(away))).toEqual(BOAT_HOME);
    expect(boatFetch(MARLOW, mended())).toBeNull(); // already home
    expect(boatFetch(MARLOW, { ...away, aboard: true })).toBeNull();
    expect(boatFetch(MARLOW, { ...away, flags: {} })).toBeNull();
    expect(boatFetch('verdara-innkeeper', away)).toBeNull();
  });
});

describe("Marlow's Boat — the quest (#75 item 14)", () => {
  const quest = QUESTS.find((q) => q.id === BOAT_QUEST_ID)!;
  const actTwo = (): SaveData => ({ ...defaultSave(), flags: { ...defaultSave().flags, [ACT2_SEEN]: true } });
  const talk = (npc: string, s: SaveData) => {
    const c = questConversation(npc, s);
    expect(c, npc).not.toBeNull();
    return { lines: c!.lines.join(' '), save: c!.finish ? c!.finish(s) : s };
  };

  it("waits for Act II: before the morning after the Spire, Marlow just talks about fish", () => {
    expect(questFor(MARLOW)).toBe(quest);
    expect(quest.requires).toBe(ACT2_SEEN);
    expect(questConversation(MARLOW, defaultSave())).toBeNull();
    expect(questConversation(MARLOW, actTwo())?.finishKind).toBe('offer');
  });

  it('a sail from Willow, a compass from Atlas, a rudder from Sage Cog — then the boat is yours', () => {
    let s = talk(MARLOW, actTwo()).save;
    expect(s.flags[questOfferedFlag(quest)]).toBe(true);
    // Out of turn, a friend has nothing to say about it yet.
    expect(questConversation('chromaria-traveler', s)).toBeNull();
    const sail = talk('verdara-innkeeper', s);
    expect(sail.lines).toMatch(/sail/i);
    s = sail.save;
    const compass = talk('chromaria-traveler', s);
    expect(compass.lines).toMatch(/compass/i);
    s = compass.save;
    const rudder = talk('sage-cog', s);
    expect(rudder.lines).toMatch(/rudder/i);
    s = rudder.save;
    const done = talk(MARLOW, s);
    expect(done.lines).toMatch(/Silver Shallows/);
    expect(hasBoat(done.save.flags)).toBe(true);
    expect(done.save.coins).toBe(s.coins + 50);
    expect(boatSpot(done.save)).toEqual(BOAT_HOME);
  });

  it('its friends are not quest-givers of their own (a step never hides behind another quest)', () => {
    for (const step of quest.steps) {
      expect(step.npc, step.id).toBeDefined();
      expect(questFor(step.npc!.id), step.npc!.id).toBeUndefined();
      expect(NPC_DEFS[step.npc!.id], step.npc!.id).toBeDefined();
    }
  });
});
