import { describe, expect, it } from 'vitest';
import { HALL_DEDICATED } from '../content/spells';
import { MET_ELDER, ZONES, gateFlag, gateIdAt, type ZoneDef, type ZoneId } from '../content/zones';
import { reach } from './reach';
import { actFourJourney, advanceGoal } from './journey';
import { overworldOf, whereOnMap } from './worldMap';
import { NPC_DEFS } from '../content/npcs';
import { actCrystals, crystalFlag } from '../content/topics';
import { GATE_KEYS, bossFlag, keyFlag, keyForZone } from '../content/keys';
import { ACT2_SEEN, ACT4_SEEN, MET_GALE, MET_ROOT_AURORA, SPIRE_CLEARED } from '../content/story';
import { BLANK_CHART_HELD, BLANK_CHART_QUEST, HALL_ROOT_SEEN, NAME_LEARNED, ROOT_HEART_REACHED, SAY_HER_NAME_QUEST, questDoneFlag, questOfferedFlag, stepFlag } from '../content/questFlags';
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
  roadTier,
  shrineToVisit,
} from './wayfinding';
import { FIELD_SPELL_IDS, fieldSpellFlag, visitedFlag } from '../content/fieldSpells';
import { BOAT_MENDED } from '../content/boat';

const dawn = ZONES.dawnreach;
const ALL_ZONES = Object.keys(ZONES) as ZoneId[];
const allCrystals = Object.fromEntries(actCrystals(1).map((t) => [crystalFlag(t.id), true]));
/**
 * Act II's errands done (#75 item 14): Act II's morning, Marlow's boat mended
 * and sailed to the Silver Shallows, Remembrance Hill visited (#75 item 14e),
 * the Memoria Key won from Eldergrove's Ringkeeper (#75 item 14f), and the
 * Crystal of Memory restored in the Sunken Archive (#75 item 14h), and the
 * Hall of Names dedicated (#75 item 14i).
 */
const actTwoDone = {
  [ACT2_SEEN]: true,
  [BOAT_MENDED]: true,
  [visitedFlag('silver-shallows')]: true,
  [visitedFlag('remembrance-hill')]: true,
  [keyFlag('memoria')]: true,
  [crystalFlag('history')]: true,
  // The Hall of Names' dedication (#75 item 14i).
  [HALL_DEDICATED]: true,
};
/** The whole story so far: Act I's crystals, the Spire, the boat, the voyage, the Hill, the Memoria Key, Memory. */
const storyDone = { ...allCrystals, [SPIRE_CLEARED]: true, ...actTwoDone };
/** …all but the last: the Memoria Key won, the Crystal of Memory still to free. */
const memoriaWon = { ...storyDone, [crystalFlag('history')]: false };
/** …and Ember's first flight, to the Dragon's Roost (#75 item 15b): the story's end so far. */
const roostVisited = { ...storyDone, [visitedFlag('dragon-roost')]: true };
/** …and her flight east to Taleshore's Port Lantern (#75 item 15c). */
const taleshoreReached = { ...roostVisited, [visitedFlag('port-lantern')]: true };
/** …and said hello to Harbormaster Gale (15c review). */
const galeMet = { ...taleshoreReached, [MET_GALE]: true };
/** …and won the First Chorus Key from the Compass Golem (#75 item 15d). */
const chorusWon = { ...galeMet, [keyFlag('chorus-a')]: true };
/** …and the Second Chorus Key from the Riddle Leviathan too (#75 item 15e). */
const chorusBoth = { ...chorusWon, [keyFlag('chorus-b')]: true };
/** …and the Crystal of Voices restored on Chorus Isle: the story so far is done (#75 item 15g). */
const voicesFreed = { ...chorusBoth, [crystalFlag('words')]: true };
/** …and the Blank Chart from the Chartmaker (#75 item 15h): Act III is done. */
const chartHeld = { ...voicesFreed, [BLANK_CHART_HELD]: true };
// Act IV (#75 item 16a): the door found, then Wisp's five memories and the name.
const doorFound = { ...chartHeld, [ACT4_SEEN]: true, [MET_ROOT_AURORA]: true };
const nameLearned = { ...doorFound, [questOfferedFlag({ id: SAY_HER_NAME_QUEST })]: true, [questDoneFlag({ id: SAY_HER_NAME_QUEST })]: true, [NAME_LEARNED]: true };
// Aster's Key won (#75 item 16c), down the Deep Root past its three echoes to
// the Root's Heart (16d): as far as the story goes for now.
const hallOpened = {
  ...nameLearned,
  [keyFlag('asters-key')]: true,
  [HALL_ROOT_SEEN]: true,
  [bossFlag('echo-thicket-warden')]: true,
  [bossFlag('echo-tide-colossus')]: true,
  [bossFlag('echo-clockwork-titan')]: true,
  [ROOT_HEART_REACHED]: true,
};

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
    expect(nextObjective(storyDone)).toMatchObject({ kind: 'fly', zoneId: 'dragon-roost' });
    expect(nextObjective(roostVisited)).toMatchObject({ kind: 'fly', zoneId: 'port-lantern', title: 'Fly to Port Lantern' });
    // In Port Lantern, the harbormaster first (15c review), then the open world.
    expect(nextObjective(taleshoreReached)).toMatchObject({ kind: 'visit', zoneId: 'port-lantern', title: 'Meet Harbormaster Gale', doneFlag: MET_GALE, npc: 'port-harbormaster' });
    // Then the Compass Golem's key (#75 item 15d), then the open world.
    expect(nextObjective(galeMet)).toMatchObject({ kind: 'key', zoneId: 'wayfinder-isles', title: 'Win the First Chorus Key' });
    expect(nextObjective(chorusWon)).toMatchObject({ kind: 'key', zoneId: 'inkwell-cove', title: 'Win the Second Chorus Key' });
    // Both keys: the 🚩 flies to Chorus Isle for the Crystal of Voices (#75 item 15g), then the open world.
    expect(nextObjective(chorusBoth)).toMatchObject({ kind: 'crystal', zoneId: 'chorus-isle', title: 'Free the Crystal of Voices' });
    expect(nextObjective(chorusBoth).key?.id).toBe('chorus-a');
    // Then the Chartmaker's island for the Blank Chart (#75 item 15h), then the open world.
    expect(nextObjective(voicesFreed)).toMatchObject({ kind: 'visit', zoneId: 'chartmakers-rest', title: 'Visit the Chartmaker', doneFlag: BLANK_CHART_HELD, npc: 'chart-chartmaker' });
    // With the Blank Chart, Act IV (#75 item 16a): the Spire's grounds, then down the stairs.
    expect(nextObjective(chartHeld)).toMatchObject({ kind: 'visit', zoneId: 'crystal-spire', title: 'Find the way under the Spire', doneFlag: ACT4_SEEN });
    expect(nextObjective({ ...chartHeld, [ACT4_SEEN]: true })).toMatchObject({ kind: 'visit', zoneId: 'dreamroot-door', title: 'Say hello to Keeper Aurora', npc: 'root-aurora' });
    // After the name, Aster's Key from her Gardener, then the Nameless Hall (#75 item 16c).
    expect(nextObjective(nameLearned)).toMatchObject({ kind: 'key', zoneId: 'asters-garden', title: "Win Aster's Key" });
    // Then down the Deep Root (#75 item 16d): an echo on B2, B4 and B6, then the Root's Heart.
    const keyWon = { ...nameLearned, [keyFlag('asters-key')]: true };
    expect(nextObjective(keyWon)).toMatchObject({ kind: 'boss', zoneId: 'deep-root-2', boss: 'echo-thicket-warden', title: 'Get past the Echo of the Thicket Warden' });
    const b2 = { ...keyWon, [bossFlag('echo-thicket-warden')]: true };
    expect(nextObjective(b2)).toMatchObject({ kind: 'boss', zoneId: 'deep-root-4', boss: 'echo-tide-colossus' });
    const b4 = { ...b2, [bossFlag('echo-tide-colossus')]: true };
    expect(nextObjective(b4)).toMatchObject({ kind: 'boss', zoneId: 'deep-root-6', boss: 'echo-clockwork-titan' });
    const b6 = { ...b4, [bossFlag('echo-clockwork-titan')]: true };
    expect(nextObjective(b6)).toMatchObject({ kind: 'visit', zoneId: 'deep-root-7', title: "Reach the Root's Heart", doneFlag: ROOT_HEART_REACHED, npc: 'root-heart' });
    expect(nextObjective(hallOpened)).toMatchObject({ kind: 'explore', zoneId: null });
    // Wisp asked first: the 🚩 follows Wisp's quest, not the hello (round 3).
    const offeredFirst = { ...chartHeld, [ACT4_SEEN]: true, [questOfferedFlag({ id: SAY_HER_NAME_QUEST })]: true };
    expect(nextObjective(offeredFirst)).toMatchObject({ title: 'Ask Grandmother Wick about the first Sage' });
    // On the island the way follows his quest: him, then Pen's nest and Inka, then back to him (round 1).
    const offered = { ...voicesFreed, [questOfferedFlag({ id: BLANK_CHART_QUEST })]: true };
    expect(nextObjective(voicesFreed).inside).toMatch(/^The Chartmaker is in his study/);
    expect(nextObjective(offered).inside).toMatch(/^Take the Compass Quill \(it's in Pen's nest/);
    expect(nextObjective({ ...offered, [stepFlag('chart-quill-ink')]: true }).inside).toMatch(/^Take the Starlit Quill back to the Chartmaker/);
    expect(goalDirections(ZONES, nextObjective(offered), 'chartmakers-rest')).toMatch(/^It's right here on Chartmaker's Rest!/);
    // On the isle, the way says where the gate is (round 2), and an island is "on".
    expect(goalDirections(ZONES, nextObjective(chorusBoth), 'chorus-isle')).toBe("It's right here on Chorus Isle! The Hush Fiend's gate is at the top of the road, past Old Cadence.");
    expect(goalDirections(ZONES, nextObjective({}), 'numbria')).toBe("It's right here in Numbria!");
    // Off Taleshore after the fog thins, the way home is still flown — the boat is at Marlow's dock (round 2).
    const home = routeSteps(ZONES, 'chorus-isle', 'remembrance-hill', undefined, voicesFreed)!;
    expect(home.filter((st) => st.startsWith('sail'))).toEqual([]);
    expect(home.some((st) => st.startsWith('fly west to the Silver Shallows'))).toBe(true);
    // …unless the hero is sailing the boat right there (round 3): then it's sailed.
    const sailed = routeSteps(ZONES, 'taleshore', 'remembrance-hill', { x: 1, y: 30 }, voicesFreed, true)!;
    expect(sailed[0]).toMatch(/^sail west to the Silver Shallows/);
    // With the double gate open, the way in needs no telling (round 3).
    const isle = ZONES['chorus-isle'];
    const opened = { ...chorusBoth, [gateFlag(gateIdAt('chorus-isle', isle.map, isle.keyGate!.x, isle.keyGate!.y))]: true };
    expect(goalDirections(ZONES, nextObjective(opened), 'chorus-isle')).toBe("It's right here on Chorus Isle!");
  });

  it("Marlow's boat (#75 item 14): each friend in turn, then back to Marlow, then sail from his dock — then the Hill", () => {
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
      // #75 item 14e: then the town the world just remembered.
      ['Visit Remembrance Hill', 'remembrance-hill'],
      // #75 item 14f: then Eldergrove's warden.
      ['Win the Memoria Key', 'eldergrove'],
      // #75 item 14h: then Act II's crystal, behind the key's silver door.
      ['Free the Crystal of Memory', 'sunken-archive'],
      // #75 item 14i: then the Hall of Names' dedication, back on the Hill.
      ['See the new plaque', 'remembrance-hill'],
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

  it('after the Silver Shallows, the 🚩 leads back across the sea to Remembrance Hill (#75 item 14e)', () => {
    const afterVoyage = { ...allCrystals, [SPIRE_CLEARED]: true, [ACT2_SEEN]: true, [BOAT_MENDED]: true, [visitedFlag('silver-shallows')]: true };
    const g = nextObjective(afterVoyage);
    expect(g).toMatchObject({ kind: 'visit', title: 'Visit Remembrance Hill', zoneId: 'remembrance-hill' });
    expect(g.at).toBeUndefined();
    expect(goalDirections(ZONES, g, 'silver-shallows')).toMatch(/^Sail west to Dawnreach, then .*Remembrance Hill\.$/);
    expect(goalDirections(ZONES, g, 'moonwell-grove')).toMatch(/Remembrance Hill/);
    // Once you've been, Eldergrove's Memoria Key is next (#75 item 14f).
    expect(nextObjective({ ...afterVoyage, [visitedFlag('remembrance-hill')]: true }).title).toBe('Win the Memoria Key');
    // Elder Lumen points the way in his own words.
    expect(mentorTips(ZONES, afterVoyage)[0]).toMatch(/Remembrance Hill, to the south.*never forgets a name/);
  });

  it('after Remembrance Hill, the 🚩 leads to Eldergrove for the Memoria Key (#75 item 14f)', () => {
    const afterHill = { ...storyDone, [keyFlag('memoria')]: false };
    const g = nextObjective(afterHill);
    expect(g).toMatchObject({ kind: 'key', title: 'Win the Memoria Key', zoneId: 'eldergrove' });
    expect(g.key?.id).toBe('memoria');
    expect(g.crystal).toBeUndefined();
    expect(g.why).toMatch(/Eldergrove.*the Ringkeeper guards the Memoria Key.*a door the whole world forgot/);
    expect(g.why).not.toMatch(/Hollow Fiend|Archive/);
    // Off the Shallows the way starts at the boat, and the 🚩 sits on Marlow's dock (14f review).
    expect(g.at).toEqual({ zoneId: 'dawnreach', x: 70, y: 30, name: "Marlow's dock" });
    expect(goalDirections(ZONES, g, 'remembrance-hill')).toBe(
      "Go north-east to Marlow's dock and sail east to the Silver Shallows, then go south-east to Eldergrove.",
    );
    expect(goalDirections(ZONES, g, 'dawnreach', { x: 70, y: 30 })).toBe(
      "Climb into Marlow's boat at the end of the dock and sail east to the Silver Shallows, then go south-east to Eldergrove.",
    );
    expect(goalDirections(ZONES, g, 'silver-shallows', { x: 30, y: 20 })).toBe('Go south-west to Eldergrove.');
    expect(goalDirections(ZONES, g, 'eldergrove')).toBe("It's right here in Eldergrove!");
    // Act II's errands aren't a danger road: no arrival warnings or "gentler road" tips.
    expect(roadTier(afterHill)).toBeNull();
    // Elder Lumen: the big picture, and a tip for the purple !!!.
    const [plan, tip] = mentorTips(ZONES, { ...afterHill, [MET_ELDER]: true });
    expect(plan).toMatch(/Eldergrove, an island of trees older than anyone remembers\. The Ringkeeper there guards the Memoria Key/);
    expect(tip).toMatch(/purple !!!.*Forget-Me-Knot/);
  });

  it("with the Memoria Key, the 🚩 leads to the Sunken Archive for the Crystal of Memory — then the open world (#75 item 14h)", () => {
    const g = nextObjective(memoriaWon);
    expect(g).toMatchObject({ kind: 'crystal', title: 'Free the Crystal of Memory', zoneId: 'sunken-archive' });
    expect(g.crystal?.id).toBe('history');
    expect(g.key?.id).toBe('memoria');
    expect(g.why).toBe('Your Memoria Key opens its silver door!');
    // Wick's "Where to next?" — the reason and the way there — stays within 30 words (review fix).
    const wick = wayfindingLines(ZONES, NPC_DEFS['village-elder'], memoriaWon).join(' ');
    expect(wick.split(/\s+/).length, wick).toBeLessThanOrEqual(30);
    // Off the Shallows the way starts at the boat, as for the key.
    expect(g.at).toEqual({ zoneId: 'dawnreach', x: 70, y: 30, name: "Marlow's dock" });
    expect(goalDirections(ZONES, g, 'lumina-village')).toMatch(/^Go east to Marlow's dock and sail east to the Silver Shallows, then go .*to the Sunken Archive\.$/);
    expect(goalDirections(ZONES, g, 'silver-shallows', { x: 35, y: 30 })).toBe('Go north-east to the Sunken Archive.');
    expect(goalDirections(ZONES, g, 'sunken-archive')).toBe("It's right here in the Sunken Archive!");
    // Still no danger road for Act II: no arrival warnings or "gentler road" tips.
    expect(roadTier(memoriaWon)).toBeNull();
    // Elder Lumen: the Fiend's gate, and a tip for the swift Quill Imps and Time Ripple.
    const [plan, tip] = mentorTips(ZONES, { ...memoriaWon, [MET_ELDER]: true });
    expect(plan).toBe("You hold the Memoria Key! It opens the Hollow Fiend's silver door in the Sunken Archive. Free the Crystal of Memory there!");
    expect(tip).toMatch(/Quill Imps.*strike first.*Time Ripple/);
    // Once Memory shines (and the Hall is dedicated): Ember flies, first to the Roost (#75 item 15b review round 3)…
    expect(nextObjective(storyDone)).toMatchObject({ kind: 'fly', title: "Fly to the Dragon's Roost" });
    expect(nextObjective(storyDone).why).toMatch(/^Ember can fly! Tap 🐉 Fly/);
    // …then the whole sky: no "soon you'll fly" once she can.
    expect(nextObjective(chorusBoth).why).toMatch(/^Both Chorus Keys together open the Hush Fiend's gate on Chorus Isle/);
    expect(nextObjective(voicesFreed).why).toMatch(/^The Chartmaker has drawn every place but one!/);
    expect(nextObjective(chartHeld).why).toMatch(/^The Blank Chart's empty space is right under the Crystal Spire/);
    expect(nextObjective(hallOpened).why).toMatch(/^You remembered the first Sage's name: Aster! She is waiting at the Root's Heart/);
    expect(mentorTips(ZONES, { ...voicesFreed, [MET_ELDER]: true })[0]).not.toMatch(/soon/);
  });

  // Doing what it says must finish the story: every step is one the hero can
  // take right then, it never repeats, and it ends at "explore".
  it('walked from a fresh save, leads through the whole story and ends', () => {
    const flags: Record<string, boolean> = {};
    const seen: Objective[] = [];
    for (let i = 0; i < 50; i++) {
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
    // Act I's crystals and keys, the Spire, Marlow's boat (offer, three friends, back to him), the voyage,
    // Remembrance Hill (#75 item 14e), the Memoria Key (#75 item 14f), the Crystal of Memory (#75 item 14h),
    // the Hall of Names (#75 item 14i), the Dragon's Roost (#75 item 15b), Taleshore and Harbormaster Gale (#75 item 15c), the First Chorus Key (#75 item 15d), the Second (#75 item 15e),
    // the Crystal of Voices (#75 item 15g), the Chartmaker (#75 item 15h), explore.
    const actOneKeys = GATE_KEYS.filter((k) => actCrystals(1).some((t) => t.zoneId === k.unlocksZone));
    // …then Act IV (#75 item 16a): the Spire's grounds, the stairs down, Wisp, five memories, the name —
    // and Aster's Key (#75 item 16c), the Deep Root's three echoes and the Root's Heart (16d).
    expect(seen).toHaveLength(actCrystals(1).length + actOneKeys.length + 1 + 5 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 2 + 1 + 5 + 1 + 1 + 3 + 1);
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
  it('at every step of the story, the next goal is walkable on its map with the fog lifted so far', () => {
    const flags: Record<string, boolean> = {};
    // Sailing in onto the Silver Shallows: open sea along its west edge.
    const sea = ZONES['silver-shallows'];
    const sailIn = sea.map.flatMap((row, y) => (row[1] === '~' ? [{ x: 1, y }] : []));
    for (let i = 0; i < 50; i++) {
      const g = nextObjective(flags);
      if (!g.zoneId) break;
      // A goal across the sea starts at a spot on Dawnreach (Marlow's dock);
      // one out on the Shallows (Eldergrove, #75 item 14f) is reached by boat.
      const world = g.at ? ZONES[g.at.zoneId] : overworldOf(ZONES, g.zoneId);
      const entrance = g.at ?? whereOnMap(ZONES, world, g.zoneId, null)!;
      // The Roost and Taleshore are flown to (#75 items 15b–c): from where Ember
      // lands — the Roost's plateau, Port Lantern's road — on foot.
      const landing = { 'dragon-roost': { x: 48, y: 27 }, 'port-lantern': { x: 30, y: 21 }, 'wayfinder-isles': { x: 11, y: 12 }, 'chorus-isle': { x: 7, y: 22 }, 'chartmakers-rest': { x: 17, y: 4 } } as Partial<Record<ZoneId, { x: number; y: number }>>;
      const reached =
        g.kind === 'fly' || world.id === 'taleshore'
          ? reach(world, { flags, from: landing[g.zoneId]! })
          : world.id === 'dawnreach'
            ? reach(dawn, { flags })
            : reach(world, { flags, from: sailIn, aboard: true, modes: ['boat', 'foot'] });
      expect(reached.has(`${entrance.x},${entrance.y}`), `${g.title}`).toBe(true);
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
    expect(goalDirections(ZONES, nextObjective(hallOpened), 'numbria')).toBe('');
  });
  it("on Ember, the way to the Dragon's Roost is flown, not sailed (#75 item 15b)", () => {
    const fly = nextObjective(storyDone);
    expect(goalDirections(ZONES, fly, 'silver-shallows')).toMatch(/^Fly west to Dawnreach, then fly .* to the Dragon's Roost, then land beside it and walk in\.$/);
    expect(goalDirections(ZONES, fly, 'lumina-village')).not.toMatch(/sail/i);
  });
  it('on Ember, the way to Taleshore is flown over the Shallows and the Great Fogbank (#75 item 15c)', () => {
    const fly = nextObjective(roostVisited);
    expect(goalDirections(ZONES, fly, 'lumina-village')).toMatch(/^Fly east to the Silver Shallows, then fly east to Taleshore, then fly .* to Port Lantern, then land beside it and walk in\.$/);
    expect(goalDirections(ZONES, fly, 'dragon-roost')).not.toMatch(/sail/i);
  });
  it('off an island only Ember reaches, the way on is flown (15d review)', () => {
    expect(routeSteps(ZONES, 'wayfinder-isles', 'port-lantern')).toEqual(['fly south-east to Port Lantern, then land beside it and walk in']);
    expect(routeSteps(ZONES, 'gale-atoll', 'driftwood-shallows')![0]).toMatch(/^fly east to Driftwood Shallows, then land beside it and walk in$/);
    // Anywhere on the island, not only beside its icon (round 2) — and the Roost's plateau corners.
    expect(routeSteps(ZONES, 'taleshore', 'port-lantern', { x: 8, y: 10 })![0]).toMatch(/^fly south-east to Port Lantern/);
    expect(routeSteps(ZONES, 'taleshore', 'port-lantern', { x: 10, y: 30 })![0]).toMatch(/^fly north-east to Port Lantern/);
    expect(routeSteps(ZONES, 'dawnreach', 'lumina-village', { x: 47, y: 27 })![0]).toMatch(/^fly /);
    // On the island already, its own icon is a walk (round 3); from a small islet, a flight.
    expect(routeSteps(ZONES, 'taleshore', 'gale-atoll', { x: 8, y: 30 })![0]).toMatch(/^go .* to Gale Atoll$/);
    expect(routeSteps(ZONES, 'taleshore', 'port-lantern', { x: 4, y: 5 })![0]).toMatch(/^fly south-east to Port Lantern/);
    // From the Roost's plateau, even the sea is flown — no boat up there (round 4).
    expect(routeSteps(ZONES, 'dawnreach', 'silver-shallows', { x: 48, y: 27 })).toEqual(['fly east to the Silver Shallows']);
    // "them" only for places named as many — not the Shrine of Quiet Paws.
    expect(routeSteps(ZONES, 'dawnreach', 'quiet-shrine', { x: 48, y: 27 })![0]).toMatch(/land beside it and walk in$/);
    // On the mainland it's still a walk.
    expect(routeSteps(ZONES, 'taleshore', 'port-lantern', { x: 40, y: 20 })![0]).toMatch(/^go west to Port Lantern/);
    // …and to the islands, "the Wayfinder Isles" are landed beside as "them".
    expect(routeSteps(ZONES, 'port-lantern', 'wayfinder-isles')).toEqual(['fly north-west to the Wayfinder Isles, then land beside them and walk in']);
  });
  it('the way back to Gale after a Return home is flown from the start (15c review round 2)', () => {
    expect(goalDirections(ZONES, nextObjective(taleshoreReached), 'lumina-village')).toMatch(/^Fly east to the Silver Shallows, then fly east to Taleshore, then /);
  });
  it('once the Great Fogbank lifts (15g), Taleshore is sailed to like anywhere else (15c review round 4)', () => {
    const bank = ZONES['silver-shallows'].fogs!.find((f) => f.id === 'great-fogbank')!;
    const lifted = { ...taleshoreReached, [bank.liftedBy[0]]: true };
    expect(goalDirections(ZONES, nextObjective(lifted), 'lumina-village', undefined, lifted)).toMatch(/^Sail east to the Silver Shallows, then sail east to Taleshore, then go /);
  });
  it('from Taleshore, the way home is flown back over the Great Fogbank, whatever the goal (15c review)', () => {
    const hall = nextObjective({ ...storyDone, [HALL_DEDICATED]: false });
    expect(hall.kind).toBe('visit');
    expect(goalDirections(ZONES, hall, 'port-lantern')).toMatch(/^Fly west to the Silver Shallows, then fly west to Dawnreach, then /);
  });
  it('gives directions to every story goal from every zone', () => {
    const goals = [
      nextObjective({}),
      nextObjective({ [crystalFlag('math')]: true }),
      nextObjective(allCrystals),
      nextObjective({ ...allCrystals, [SPIRE_CLEARED]: true }),
      nextObjective({ ...allCrystals, [SPIRE_CLEARED]: true, [BOAT_MENDED]: true }),
      // The Memoria Key, out on the Shallows (#75 item 14f).
      nextObjective({ ...storyDone, [keyFlag('memoria')]: false }),
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
    expect(mentorTips(ZONES, { ...met, ...storyDone, [keyFlag('memoria')]: false })[0]).toMatch(/^Out in the Silver Shallows lies Eldergrove/);
    // With the Memoria Key, its door in the Archive (#75 item 14h); then five crystals shine.
    expect(mentorTips(ZONES, { ...met, ...memoriaWon })[0]).toMatch(/^You hold the Memoria Key! It opens the Hollow Fiend's silver door in the Sunken Archive/);
    expect(mentorTips(ZONES, { ...met, ...storyDone })[0]).toMatch(/^Five crystals shine now — and Ember can fly! Ride her up to the Dragon's Roost/);
    expect(mentorTips(ZONES, { ...met, ...roostVisited })[0]).toMatch(/^No boat gets past the Great Fogbank — but Ember can fly over it!/);
    expect(mentorTips(ZONES, { ...met, ...taleshoreReached })[0]).toMatch(/Harbormaster Gale/);
    expect(mentorTips(ZONES, { ...met, ...chorusWon })[0]).toMatch(/^You have the First Chorus Key! The Riddle Leviathan guards the second in Inkwell Cove\. Follow the road east from Port Lantern, then north\./);
    expect(mentorTips(ZONES, { ...met, ...chorusBoth })[0]).toBe("You hold both Chorus Keys! Together they open the Hush Fiend's gate on Chorus Isle, far out at sea west of Port Lantern. Fly there, and free the Crystal of Voices!");
    expect(mentorTips(ZONES, { ...met, ...voicesFreed })[0]).toBe("Six crystals shine! Fly east, all the way to Taleshore. The Chartmaker's island is at the very top of its map — look for the globe there 🌐");
    // The way there is flown from home, even though boats cross now — and sailed while aboard (round 3).
    const chart = nextObjective(voicesFreed);
    expect(goalDirections(ZONES, chart, 'lumina-village', undefined, voicesFreed)).toMatch(/fly east to Taleshore, then fly north-east to Chartmaker's Rest, then land beside it and walk in\.$/);
    expect(goalDirections(ZONES, chart, 'lumina-village', undefined, voicesFreed)).not.toMatch(/sail/i);
    expect(goalDirections(ZONES, chart, 'taleshore', { x: 30, y: 21 }, voicesFreed, true)).toMatch(/^Sail north-west to Chartmaker's Rest, then land beside it and walk in\.$/);
    expect(goalDirections(ZONES, chart, 'taleshore', { x: 30, y: 21 }, voicesFreed)).toMatch(/^Fly north-west to Chartmaker's Rest/);
    // …but never sailed up to where no boat lands, or over standing fog (round 4).
    const seaCell = (z: ZoneDef) => { for (let y = 0; y < z.map.length; y++) for (let x = 0; x < z.map[y].length; x++) if (z.map[y][x] === '~') return { x, y }; return { x: 0, y: 0 }; };
    expect(goalDirections(ZONES, nextObjective(storyDone), 'dawnreach', seaCell(ZONES.dawnreach), storyDone, true)).not.toMatch(/^Sail .*Dragon's Roost/);
    expect(goalDirections(ZONES, nextObjective(galeMet), 'silver-shallows', seaCell(ZONES['silver-shallows']), galeMet, true)).not.toMatch(/sail north/);
    // With the Blank Chart (#75 item 15h): its empty spot, a puzzle for later — like the 🚩 says (round 1).
    expect(mentorTips(ZONES, { ...met, ...chartHeld })[0]).toBe("The Blank Chart's blank spot is right under the Crystal Spire! Take it to the Spire's grounds, south of our village, and see what's hiding below.");
    // The guides' "Where to next?" stays short (saas UX review): the why is a sentence or two.
    expect(nextObjective(voicesFreed).why.split(/\s+/).length).toBeLessThanOrEqual(20);
    // Lumen counts every crystal shining: a skipped Hall dedication after Voices says six, not five (round 4).
    expect(mentorTips(ZONES, { ...met, ...voicesFreed, [HALL_DEDICATED]: false })[0]).toMatch(/^Six crystals shine now! And they say something new is happening in the Hall of Names/);
    // Memory restored, the Hall still to dedicate (#75 item 14i): Lumen sends you to Mnem.
    expect(mentorTips(ZONES, { ...met, ...storyDone, [HALL_DEDICATED]: false })[0]).toMatch(/Hall of Names/);
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
    expect(wayfinders.filter((n) => n.guide).map((n) => n.id).sort()).toEqual(['dawnreach-scout', 'port-harbormaster', 'village-elder']);
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
  it("Harbormaster Gale, the 🚩's goal, points to what comes after meeting Gale (15c review)", () => {
    expect(nextObjective(taleshoreReached).npc).toBe('port-harbormaster');
    expect(wayfindingLines(ZONES, NPC_DEFS['port-harbormaster'], taleshoreReached)).toEqual([expect.stringMatching(/^Where to next\? The Compass Golem on the Wayfinder Isles guards the First Chorus Key! /)]);
  });
  it("after the story, a guide just cheers you on", () => {
    expect(wayfindingLines(ZONES, NPC_DEFS['village-elder'], hallOpened)).toEqual([nextObjective(hallOpened).why]);
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

describe('Lumina-That-Was in the guides (16b review round 4)', () => {
  it("a long way to Young Wick gets its own box; after the name, the 🚩 knows the side quests' state", () => {
    const leg = actFourJourney().find((l) => l.goal.npc === 'memory-young-wick')!;
    const wick = wayfindingLines(ZONES, NPC_DEFS['village-elder'], leg.flags);
    expect(wick).toHaveLength(2);
    expect(wick[0]).toMatch(/^Where to next\?/);
    expect(wick[1]).toMatch(/^Go south to the Crystal Spire.*Old Lumina Village\.$/);
    const named = { ...leg.flags, ...hallOpened };
    expect(nextObjective(named).why).toMatch(/help the folk of Lumina-That-Was/);
    const both = { ...named, [questDoneFlag({ id: 'bell-apology' })]: true, [questDoneFlag({ id: 'unnamed-dog' })]: true };
    // …and the Gardener's waters (16c review round 3).
    expect(nextObjective(both).why).toMatch(/help the folk of Lumina-That-Was/);
    expect(nextObjective({ ...both, [questDoneFlag({ id: 'garden-water' })]: true }).why).toMatch(/hunt for secrets/);
  });
});

describe("the Nameless Hall's 🚩 (16c review round 2, #75 item 16d)", () => {
  it('says to unlock the great door first, then — once it is open — where the echo stands', () => {
    const hall = ZONES['nameless-hall'];
    const flags = { ...nameLearned, [keyFlag('asters-key')]: true };
    const before = nextObjective(flags);
    expect(before.inside).toMatch(/^First, open the Nameless Hall's great door/);
    expect(before.why).toMatch(/^Stairs wind down the Deep Root/);
    const open = { ...flags, [gateFlag(gateIdAt('nameless-hall', hall.map, hall.keyGate!.x, hall.keyGate!.y))]: true };
    expect(nextObjective(open).inside).toMatch(/one gap in the thorny wall/);
  });
});
