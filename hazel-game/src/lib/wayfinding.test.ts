import { describe, expect, it } from 'vitest';
import { MET_ELDER, ZONES, type ZoneDef, type ZoneId } from '../content/zones';
import { reach } from './reach';
import { advanceGoal } from './journey';
import { whereOnMap } from './worldMap';
import { NPC_DEFS } from '../content/npcs';
import { actCrystals, crystalFlag } from '../content/topics';
import { GATE_KEYS, keyFlag, keyForZone } from '../content/keys';
import { ACT2_SEEN, SPIRE_CLEARED } from '../content/story';
import {
  compass,
  exitSide,
  goalDirections,
  nextObjective,
  npcHome,
  placeName,
  routeSteps,
  routeTo,
  sentence,
  signpostLines,
  wayfindingLines,
  type Objective,
  mentorTips,
  shrineToVisit,
} from './wayfinding';
import { FIELD_SPELL_IDS, fieldSpellFlag, visitedFlag } from '../content/fieldSpells';
import { BOAT_MENDED } from '../content/boat';

const dawn = ZONES.dawnreach;
const ALL_ZONES = Object.keys(ZONES) as ZoneId[];
const allCrystals = Object.fromEntries(actCrystals(1).map((t) => [crystalFlag(t.id), true]));
/** Act II's errands done (#75 item 14): Marlow's boat mended and sailed to the Silver Shallows. */
const actTwoDone = { [BOAT_MENDED]: true, [visitedFlag('silver-shallows')]: true };
/** The whole story so far: every crystal, the Spire, the boat, the voyage. */
const storyDone = { ...allCrystals, [SPIRE_CLEARED]: true, ...actTwoDone };

describe('compass', () => {
  it('names all eight directions (y grows southward)', () => {
    expect(compass(0, -5)).toBe('north');
    expect(compass(5, -5)).toBe('north-east');
    expect(compass(5, 0)).toBe('east');
    expect(compass(5, 5)).toBe('south-east');
    expect(compass(0, 5)).toBe('south');
    expect(compass(-5, 5)).toBe('south-west');
    expect(compass(-5, 0)).toBe('west');
    expect(compass(-5, -5)).toBe('north-west');
  });
  it('calls a mostly-north step north', () => {
    expect(compass(2, -10)).toBe('north');
  });
  it('has no direction for a tile or less away', () => {
    expect(compass(0, 0)).toBeNull();
    expect(compass(1, -1)).toBeNull();
  });
});

describe('placeName', () => {
  it('reads right mid-sentence', () => {
    expect(placeName(ZONES.numbria)).toBe('Numbria');
    expect(placeName(ZONES['whispering-woods'])).toBe('the Whispering Woods');
    expect(placeName(ZONES['crystal-spire'])).toBe('the Crystal Spire');
  });
});

describe('nextObjective', () => {
  it('starts with Numbria: its crystal is the one with no gate', () => {
    expect(nextObjective({})).toMatchObject({ kind: 'crystal', zoneId: 'numbria', title: 'Free the Crystal of Numbers' });
  });
  it("then the warden holding the first locked crystal's key", () => {
    const g = nextObjective({ [crystalFlag('math')]: true });
    expect(g).toMatchObject({ kind: 'key', zoneId: 'whispering-woods', title: 'Win the Verdant Key' });
  });
  it('a crystal you hold the key for comes before a key you still have to win', () => {
    const g = nextObjective({ [crystalFlag('math')]: true, [keyFlag('chromaria-key')]: true });
    expect(g).toMatchObject({ kind: 'crystal', zoneId: 'chromaria' });
    expect(g.why).toContain('Prism Key');
  });
  it('once every crystal shines: the Spire, then Act II — Old Marlow, his boat, the sea — then the open world', () => {
    expect(nextObjective(allCrystals)).toMatchObject({ kind: 'spire', zoneId: 'crystal-spire' });
    expect(nextObjective({ ...allCrystals, [SPIRE_CLEARED]: true })).toMatchObject({
      kind: 'boat',
      zoneId: 'starfall-coast',
      title: 'Help Old Marlow',
    });
    expect(nextObjective(storyDone)).toMatchObject({ kind: 'explore', zoneId: null });
  });

  it("Marlow's boat (#75 item 14): each friend in turn, then back to Marlow, then sail from his dock", () => {
    const flags: Record<string, boolean> = { ...allCrystals, [SPIRE_CLEARED]: true };
    const path: [string, ZoneId | null][] = [];
    for (let i = 0; i < 10; i++) {
      const g = nextObjective(flags);
      if (g.kind === 'explore') break;
      path.push([g.title, g.zoneId]);
      Object.assign(flags, advanceGoal(g, flags));
    }
    expect(path).toEqual([
      ['Help Old Marlow', 'starfall-coast'],
      ["Find a sail for Marlow's boat", 'verdara'],
      ["Fetch Marlow's compass", 'chromaria'],
      ["Get a rudder built for Marlow's boat", 'gearfall'],
      ['Tell Old Marlow his boat is ready', 'starfall-coast'],
      ['Sail the Silver Shallows', 'silver-shallows'],
    ]);
    // The voyage starts at Marlow's dock: its 🚩 sits there, and the way says so.
    const sail = nextObjective({ ...allCrystals, [SPIRE_CLEARED]: true, [BOAT_MENDED]: true });
    expect(sail.at).toEqual({ zoneId: 'dawnreach', x: 70, y: 30, name: "Marlow's dock" });
    expect(ZONES.dawnreach.map[sail.at!.y][sail.at!.x]).toBe('|');
    expect(goalDirections(ZONES, sail, 'starfall-coast')).toBe("Go east to Marlow's dock and sail east.");
    expect(goalDirections(ZONES, sail, 'lumina-village')).toBe("Go east to Marlow's dock and sail east.");
    expect(goalDirections(ZONES, sail, 'silver-shallows')).toBe("It's right here in the Silver Shallows!");
    // Already on the dock: just climb in (review fix).
    expect(goalDirections(ZONES, sail, 'dawnreach', { x: 70, y: 30 })).toBe("Climb into Marlow's boat at the end of the dock and sail east.");
    expect(goalDirections(ZONES, sail, 'dawnreach', { x: 60, y: 30 })).toBe("Go east to Marlow's dock and sail east.");
  });

  // Doing what it says must finish the story: every step is one the hero can
  // take right then, it never repeats, and it ends at "explore".
  it('walked from a fresh save, leads through the whole story and ends', () => {
    const flags: Record<string, boolean> = {};
    const seen: Objective[] = [];
    for (let i = 0; i < 20; i++) {
      const g = nextObjective(flags);
      seen.push(g);
      if (g.kind === 'explore') break;
      if (g.kind === 'crystal') {
        const key = keyForZone(g.zoneId!);
        if (key) expect(flags[keyFlag(key.id)], `${g.title} needs ${key.name}`).toBe(true);
      }
      Object.assign(flags, advanceGoal(g, flags));
    }
    expect(seen.at(-1)?.kind).toBe('explore');
    // Act I's crystals and keys, the Spire, Marlow's boat (offer, three friends, back to him), the voyage, explore.
    expect(seen).toHaveLength(actCrystals(1).length + GATE_KEYS.length + 1 + 5 + 1 + 1);
    expect(new Set(seen.map((g) => g.title)).size).toBe(seen.length);
    // …and every place it sends you can be reached from anywhere in the world.
    for (const g of seen) {
      if (!g.zoneId) continue;
      const to = g.at?.zoneId ?? g.zoneId;
      for (const from of ALL_ZONES) expect(routeTo(ZONES, from, to), `${from} → ${to}`).not.toBeNull();
    }
  });
});

// #75 item 7 (roadmap §4.7): fog never stands between the hero and the goal.
describe('fog and the story', () => {
  it('at every step of the story, the next goal is walkable on Dawnreach with the fog lifted so far', () => {
    const flags: Record<string, boolean> = {};
    for (let i = 0; i < 20; i++) {
      const g = nextObjective(flags);
      if (!g.zoneId) break;
      // A goal across the sea starts at a spot on Dawnreach (Marlow's dock).
      const entrance = g.at ?? whereOnMap(ZONES, dawn, g.zoneId, null)!;
      expect(reach(dawn, { flags }).has(`${entrance.x},${entrance.y}`), `${g.title}`).toBe(true);
      Object.assign(flags, advanceGoal(g, flags));
    }
    expect(nextObjective(flags).kind).toBe('explore');
  });
});

describe('dungeons (#75 item 10)', () => {
  const twoCrystals = {
    [MET_ELDER]: true,
    [crystalFlag('math')]: true,
    [keyFlag('verdara-key')]: true,
    [crystalFlag('science')]: true,
  };
  it('the way to the Clockwork Titan goes in by the cave and down the stairs, floor by floor', () => {
    const goal = nextObjective(twoCrystals);
    expect(goal.zoneId).toBe('clockwork-depths-b3');
    expect(goalDirections(ZONES, goal, 'lumina-village')).toBe(
      "Go south-west to the Clockwork Depths, then take the stairs down two floors to the Titan's Forge.",
    );
    expect(goalDirections(ZONES, goal, 'clockwork-depths')).toBe("Take the stairs down two floors to the Titan's Forge.");
    expect(goalDirections(ZONES, goal, 'clockwork-depths-b2')).toBe("Take the stairs down to the Titan's Forge.");
  });
  it('Elder Lumen says the floor and the dungeon it lies deep in', () => {
    expect(mentorTips(ZONES, twoCrystals)[0]).toMatch(
      /the Clockwork Titan in the Titan's Forge, deep in the Clockwork Depths, to the south-west/,
    );
  });
});

describe('routeTo', () => {
  it('is empty when you are already there', () => {
    expect(routeTo(ZONES, 'numbria', 'numbria')).toEqual([]);
  });
  it('goes through the fewest zones', () => {
    const hops = routeTo(ZONES, 'lumina-village', 'numbria')!;
    expect(hops.map((h) => `${h.from}→${h.exit.to}`)).toEqual(['lumina-village→dawnreach', 'dawnreach→numbria']);
  });
  it('is null when there is no way', () => {
    const island = { ...ZONES.numbria, id: 'numbria', exits: [] } as ZoneDef;
    expect(routeTo({ ...ZONES, numbria: island }, 'numbria', 'verdara')).toBeNull();
  });
});

describe('exitSide', () => {
  it('finds the edge an exit is on, or none for a place on the map', () => {
    expect(exitSide(ZONES.numbria, ZONES.numbria.exits[0])).toBe('east');
    expect(exitSide(ZONES.verdara, ZONES.verdara.exits[0])).toBe('south');
    expect(exitSide(dawn, dawn.exits[0])).toBeNull();
  });
});

describe('routeSteps and goalDirections', () => {
  const numbria = nextObjective({});
  it('between two zones joined edge to edge: the path to take', () => {
    const joined = { ...ZONES.numbria, exits: [{ x: 0, y: 6, to: 'verdara' as const, spawnX: 42, spawnY: 6 }] };
    expect(routeSteps({ ...ZONES, numbria: joined }, 'numbria', 'verdara')).toEqual(['take the west path to Verdara']);
  });
  it('across the overworld: out of the Village, then the way to the place (#75 item 8)', () => {
    expect(goalDirections(ZONES, numbria, 'lumina-village')).toBe('Go north-west to Numbria.');
  });
  it('right outside its door: step in', () => {
    expect(goalDirections(ZONES, numbria, 'dawnreach', { x: 11, y: 13 })).toBe('Step into Numbria.');
  });
  it("on the overworld, measured from where you stand", () => {
    const woods = dawn.places!.find((p) => p.name === 'Whispering Woods')!;
    expect(routeSteps(ZONES, 'dawnreach', 'whispering-woods', { x: woods.x, y: woods.y + 10 })).toEqual([
      'go north to the Whispering Woods',
    ]);
    expect(routeSteps(ZONES, 'dawnreach', 'whispering-woods', { x: woods.x + 10, y: woods.y })).toEqual([
      'go west to the Whispering Woods',
    ]);
    expect(routeSteps(ZONES, 'dawnreach', 'whispering-woods', { x: woods.x + 1, y: woods.y })).toEqual([
      'step into the Whispering Woods',
    ]);
  });
  it("says so when you're already there, and nothing once the story's done", () => {
    expect(goalDirections(ZONES, numbria, 'numbria')).toBe("It's right here in Numbria!");
    expect(goalDirections(ZONES, nextObjective(storyDone), 'numbria')).toBe('');
  });
  it('gives directions to every story goal from every zone', () => {
    const goals = [
      nextObjective({}),
      nextObjective({ [crystalFlag('math')]: true }),
      nextObjective(allCrystals),
      nextObjective({ ...allCrystals, [SPIRE_CLEARED]: true }),
      nextObjective({ ...allCrystals, [SPIRE_CLEARED]: true, [BOAT_MENDED]: true }),
    ];
    for (const g of goals) {
      for (const from of ALL_ZONES) expect(goalDirections(ZONES, g, from), `${from} → ${g.zoneId}`).toMatch(/^[A-Z].+[.!]$/);
    }
  });
  it('sentence joins steps', () => {
    expect(sentence(['go north to A', 'take the west path to B'])).toBe('Go north to A, then take the west path to B.');
    expect(sentence([])).toBe('');
  });
});

describe('signpostLines', () => {
  it('names every place once, by direction, clockwise from north, nearest first', () => {
    const lines = signpostLines(dawn, 44, 31);
    const names = lines.flatMap((l) => l.replace(/^\S+ /, '').split(' · '));
    // Before Act II nobody has heard of Remembrance Hill (#75 item 14e).
    expect(names.sort()).toEqual(dawn.places!.filter((p) => !p.knownFrom).map((p) => p.name).sort());
    expect(names).not.toContain('Remembrance Hill');
    expect(lines[0]).toBe('↗️ Echo Mine · Shrine of First Light · Gearfall Canyon');
    expect(lines.find((l) => l.startsWith('⬅️'))).toBe('⬅️ Lumina Village · Whispering Woods');
    expect(lines.at(-1)).toBe("↖️ Wayfarer's Shrine · Numbria");
  });
  it('names Remembrance Hill once Lumina starts remembering (#75 item 14e)', () => {
    const lines = signpostLines(dawn, 44, 31, { [ACT2_SEEN]: true });
    expect(lines.find((l) => l.includes('Remembrance Hill'))).toMatch(/^↙️/);
  });
  it("leaves out a place you're standing beside", () => {
    const village = dawn.places!.find((p) => p.name === 'Lumina Village')!;
    expect(signpostLines(dawn, village.x, village.y - 1).join('\n')).not.toContain('Lumina Village');
  });
});

describe('mentorTips — Elder Lumen in the Library (#75 item 8)', () => {
  const met = { [MET_ELDER]: true };
  const math = { ...met, [crystalFlag('math')]: true };
  it('a new hero: the plan (start with Numbria, no key needed) and where the potions are', () => {
    const [plan, tip] = mentorTips(ZONES, met);
    expect(plan).toMatch(/four Fiends.*corner of Dawnreach.*the Null Fiend in Numbria, to the north-west.*no key/);
    expect(tip).toMatch(/Berry Potions at Maple's Trading Post/);
  });
  it('after the first crystal: the wardens and their keys; holding a key: its gate', () => {
    expect(mentorTips(ZONES, math)[0]).toMatch(/other three Fiends.*locked gates.*the Thicket Warden in the Whispering Woods, to the west.*Verdant Key/);
    expect(mentorTips(ZONES, { ...math, [keyFlag('verdara-key')]: true })[0]).toMatch(
      /You hold the Verdant Key! It opens the Smog Fiend's gate in Verdara, to the south-west\. Free the Crystal of Nature/,
    );
    const two = { ...math, [crystalFlag('science')]: true };
    expect(mentorTips(ZONES, two)[0]).toMatch(/^The Rust Fiend still hides behind a locked gate\..*the Clockwork Titan/);
  });
  it('all four crystals: the Spire; after it: secrets and friends', () => {
    expect(mentorTips(ZONES, { ...met, ...allCrystals })).toEqual([
      expect.stringMatching(/Crystal Spire stands open, to the south of our village/),
      expect.stringMatching(/Rest at the Sleepy Sheep Inn/),
    ]);
    expect(mentorTips(ZONES, { ...met, ...allCrystals, [SPIRE_CLEARED]: true })[0]).toMatch(/Old Marlow.*mend his boat/);
    expect(mentorTips(ZONES, { ...met, ...allCrystals, [SPIRE_CLEARED]: true, [BOAT_MENDED]: true })[0]).toMatch(/Silver Shallows/);
    expect(mentorTips(ZONES, { ...met, ...storyDone })[0]).toMatch(/Lumina is safe/);
  });
  it('is the big picture, not the road: no "go …" or "take the … path" steps', () => {
    const stages = [met, math, { ...math, [keyFlag('verdara-key')]: true }, { ...met, ...allCrystals }];
    for (const flags of stages) for (const line of mentorTips(ZONES, flags)) expect(line).not.toMatch(/\b(Go|go) (north|south|east|west)|path to/);
  });
  it('once a crystal is back, points to a shrine whose field spell you could learn (#75 item 9)', () => {
    const knows = (...ids: (typeof FIELD_SPELL_IDS)[number][]) => Object.fromEntries(ids.map((id) => [fieldSpellFlag(id), true]));
    // A new hero hears about potions first — the Wayfarer's Shrine is open, though.
    expect(shrineToVisit(ZONES, met)?.id).toBe('return');
    expect(mentorTips(ZONES, met)[1]).toMatch(/Berry Potions/);
    expect(mentorTips(ZONES, math)[1]).toMatch(
      /^Wayfarer Juniper teaches a field spell at Wayfarer's Shrine, to the north-west: 🏠 Return\. Fly back/,
    );
    // Next the first crystal's shrine (out of its fog now), then the Shrine of Quiet Paws.
    expect(mentorTips(ZONES, { ...math, ...knows('return') })[1]).toMatch(/^Old Wren .* the Shrine of First Light, to the north-east: 🔆 Glow/);
    expect(mentorTips(ZONES, { ...math, ...knows('return', 'glow') })[1]).toMatch(/^Keeper Thistle .* the Shrine of Quiet Paws, to the south-east: 🕊️ Calm/);
    // All three known: back to the everyday tips.
    expect(shrineToVisit(ZONES, { ...math, ...knows(...FIELD_SPELL_IDS) })).toBeNull();
    expect(mentorTips(ZONES, { ...math, ...knows(...FIELD_SPELL_IDS) })[1]).toMatch(/fog on Dawnreach/);
    // Before any crystal the Shrine of First Light is still in its fog.
    expect(shrineToVisit(ZONES, { ...met, ...knows('return', 'calm') })).toBeNull();
  });
  it('on the plaza (first meeting) the tips end with where to find him again; in the Library they don\'t', () => {
    const plaza = wayfindingLines(ZONES, NPC_DEFS['elder-lumen'], {});
    expect(plaza).toHaveLength(3);
    expect(plaza[2]).toMatch(/Lumina Library, at the far east end of town/);
    expect(wayfindingLines(ZONES, NPC_DEFS['elder-lumen'], met)).toEqual(mentorTips(ZONES, met));
  });
});

describe('guides and signposts', () => {
  const wayfinders = Object.values(NPC_DEFS).filter((n) => n.guide || n.signpost);

  it('Grandmother Wick and Scout Tamsin are guides, Elder Lumen the mentor; the crossroads have signposts', () => {
    expect(wayfinders.filter((n) => n.guide).map((n) => n.id).sort()).toEqual(['dawnreach-scout', 'village-elder']);
    expect(Object.values(NPC_DEFS).filter((n) => n.mentor).map((n) => n.id)).toEqual(['elder-lumen']);
    expect(wayfinders.filter((n) => n.signpost).length).toBeGreaterThanOrEqual(2);
  });
  it('every guide and signpost stands somewhere in the world', () => {
    for (const n of wayfinders) expect(npcHome(ZONES, n.id), n.id).not.toBeNull();
  });
  it('a guide ends on where to go next, from where they stand', () => {
    expect(wayfindingLines(ZONES, NPC_DEFS['village-elder'], {})).toEqual([
      'Where to next? The Null Fiend hoards the Crystal of Numbers. Go north-west to Numbria.',
    ]);
  });
  it("after the story, a guide just cheers you on", () => {
    expect(wayfindingLines(ZONES, NPC_DEFS['village-elder'], storyDone)).toEqual([nextObjective(storyDone).why]);
  });
  it('a signpost reads out the places around it, then the way to the next goal', () => {
    for (const n of wayfinders.filter((w) => w.signpost)) {
      expect(n.lines, n.id).toEqual([]);
      const [read, next] = wayfindingLines(ZONES, n, {});
      expect(read.split('\n').length, n.id).toBeGreaterThanOrEqual(4);
      expect(next, n.id).toMatch(/^🚩 Next: Free the Crystal of Numbers\. Go /);
    }
  });
  it('everyone else says nothing extra', () => {
    expect(wayfindingLines(ZONES, NPC_DEFS['hub-kid'], {})).toEqual([]);
  });

  // A signpost belongs where the way splits or turns: beside a road tile where
  // 3+ roads meet, or where the road bends (the north road turning for
  // Numbria, #75 item 8) — and not on the road itself (it would block it).
  it('every signpost stands beside a crossroads or a bend, off the road', () => {
    const road = (z: ZoneDef, x: number, y: number) => '=P'.includes(z.map[y]?.[x] ?? '#');
    for (const n of wayfinders.filter((w) => w.signpost)) {
      const home = npcHome(ZONES, n.id)!;
      const z = ZONES[home.zoneId];
      expect(z.kind, n.id).toBe('overworld');
      expect(road(z, home.x, home.y), `${n.id} is on the road`).toBe(false);
      const near = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => [home.x + dx, home.y + dy]));
      const atCrossroads = near.some(([x, y]) => {
        if (!road(z, x, y)) return false;
        const ways = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].filter(([dx, dy]) => road(z, x + dx, y + dy));
        const bend = ways.length === 2 && ways[0][0] !== -ways[1][0] && ways[0][1] !== -ways[1][1];
        return ways.length >= 3 || bend;
      });
      expect(atCrossroads, `${n.id} at ${home.x},${home.y}`).toBe(true);
    }
  });
});
