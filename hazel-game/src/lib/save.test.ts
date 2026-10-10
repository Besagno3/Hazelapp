import { describe, it, expect } from 'vitest';
import {
  defaultSave,
  normalizeSave,
  migrateLegacy,
  pushLibrary,
  restAtHomeInn,
  runMigrations,
  saveIsTooNew,
  wakeAfterDefeat,
  wakeInnName,
  DAWNREACH_GREW_BY,
  MIGRATIONS,
  MOVED_CHESTS,
  SAVE_V2_FLAG,
  SAVE_VERSION,
  type MigrationLadder,
} from './save';
import { LIBRARY_MAX } from '../content/items';
import { CURRENT_ABOARD, FINALE_NOT_ACT2, V1, V2_FIRST_BUILD, V2_PRE_14A, V2_PRE_ITEM10 } from '../test/saveFixtures';
import { reach, safeSpawn } from './reach';
import { seaCrossing } from './travel';
import { walkLeg } from './journey';
import { nextObjective } from './wayfinding';
import { boatSpot } from '../content/boat';
import type { SaveData } from '../types';
import { HUB_ZONE, TILE, ZONES, buildingInside, chestTopicAt, gateFlag, gateIdAt, innWakeCell, tileAt } from '../content/zones';
import type { LibraryEntry, Question } from '../types';
import { ACT2_SEEN, SPIRE_VICTORY_SEEN } from '../content/story';

function q(id: string): Question {
  return { id, topic: 'math', level: 3, text: '?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 };
}

describe('defaultSave', () => {
  it('starts at home (Lumina Village), locked world, starter items', () => {
    const s = defaultSave();
    expect(s.zoneId).toBe('lumina-village');
    expect(s.pos).toBeNull();
    expect(s.worldUnlocked).toBe(false);
    expect(s.items.potion).toBeGreaterThan(0);
    expect(s.avatarId).toBeNull();
  });
});

describe('runMigrations (Wave 0.2 versioned ladder)', () => {
  // A fake future ladder: v1 → v2 adds a party array; v2 → v3 renames coins.
  const fakeLadder: MigrationLadder = {
    1: (raw) => ({ ...raw, party: [] }),
    2: (raw) => {
      const { coins, ...rest } = raw;
      return { ...rest, gold: coins };
    },
  };

  it('walks a v1 payload up through every step, stamping each version', () => {
    const out = runMigrations({ version: 1, coins: 50 }, fakeLadder, 3) as Record<string, unknown>;
    expect(out.version).toBe(3);
    expect(out.party).toEqual([]);
    expect(out.gold).toBe(50);
    expect(out).not.toHaveProperty('coins');
  });

  it('starts mid-ladder for a payload already at v2', () => {
    const out = runMigrations({ version: 2, coins: 7, party: ['pip'] }, fakeLadder, 3) as Record<
      string,
      unknown
    >;
    expect(out.version).toBe(3);
    expect(out.gold).toBe(7);
    expect(out.party).toEqual(['pip']); // the v1 step did NOT rerun
  });

  it('treats a missing version as v1', () => {
    const out = runMigrations({ coins: 3 }, fakeLadder, 2) as Record<string, unknown>;
    expect(out.version).toBe(2);
    expect(out.party).toEqual([]);
  });

  it('stops early at a missing step and passes junk through untouched', () => {
    const out = runMigrations({ version: 1 }, {}, 3) as Record<string, unknown>;
    expect(out.version).toBe(1); // no path — normalizeSave field-defaults later
    expect(runMigrations(null, fakeLadder, 3)).toBeNull();
    expect(runMigrations('junk', fakeLadder, 3)).toBe('junk');
  });

  it('never touches a payload at or above the target version (no downgrade)', () => {
    const out = runMigrations({ version: 5, coins: 9 }, fakeLadder, 3) as Record<string, unknown>;
    expect(out.version).toBe(5);
    expect(out.coins).toBe(9);
  });

  // A v1 save, as v1 wrote it (#75 item 8 bumps to v2) — `test/saveFixtures.ts`.
  const centre = (x: number, y: number) => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });

  it('v1 → v2: a save on the retired Lumina Field wakes at home, keeping everything else (#75 item 8)', () => {
    expect(SAVE_VERSION).toBe(2);
    const v2 = runMigrations(V1) as Record<string, unknown>;
    expect(v2.version).toBe(2);
    expect(v2.zoneId).toBe('lumina-village');
    expect(v2.pos).toBeNull();
    expect(v2).not.toHaveProperty('sageEquipped');
    const s = normalizeSave(V1);
    expect(s).toMatchObject({ version: 2, zoneId: 'lumina-village', pos: null, coins: 120, sages: ['math'], kills: { 'count-bat': 1 } });
    expect(s.flags['crystal-math-restored']).toBe(true);
    expect(s).not.toHaveProperty('sageEquipped');
  });

  it('v1 → v2: a save on Dawnreach keeps its spot on the bigger map', () => {
    // Old (32, 23): the road just north of the Village, on the 64×48 map.
    const v2 = normalizeSave({ ...V1, zoneId: 'dawnreach', pos: centre(32, 23) });
    expect(DAWNREACH_GREW_BY).toEqual({ x: 8, y: 6 });
    expect(v2.zoneId).toBe('dawnreach');
    expect(v2.pos).toEqual(centre(40, 29));
    expect(tileAt(ZONES.dawnreach, 40, 29)).toBe('=');
    // Elsewhere, positions stay as they were.
    expect(normalizeSave({ ...V1, zoneId: 'numbria', pos: centre(5, 6) }).pos).toEqual(centre(5, 6));
  });

  it('every v2 save carries the v2 marker flag, new or loaded', () => {
    expect(defaultSave().flags[SAVE_V2_FLAG]).toBe(true);
    expect(normalizeSave(V1).flags).toMatchObject({ [SAVE_V2_FLAG]: true, 'crystal-math-restored': true });
    expect(normalizeSave({ version: 2, flags: 'junk' }).flags).toEqual({ [SAVE_V2_FLAG]: true });
  });

  it('an old tab re-saving a v2 save as "v1" does not move a Dawnreach position twice (#101c)', () => {
    const v2 = normalizeSave({ ...V1, zoneId: 'dawnreach', pos: centre(32, 23) });
    expect(v2.pos).toEqual(centre(40, 29));
    // What a v1 client writes back: its own version stamp, everything else as it was (flags verbatim).
    const resavedByV1 = { ...v2, version: 1, sageEquipped: null };
    const again = normalizeSave(resavedByV1);
    expect(again.pos).toEqual(centre(40, 29));
    expect(again.version).toBe(2);
  });

  it('v1 → v2: opened fog-pocket chests stay opened where the chests now are', () => {
    const v2 = normalizeSave(V1);
    expect(v2.openedChests).toEqual(['numbria:chest:12,4', 'dawnreach:chest:21,15']);
    for (const [from, to] of Object.entries(MOVED_CHESTS)) {
      const [x, y] = to.split(':')[2].split(',').map(Number);
      expect(tileAt(ZONES.dawnreach, x, y), `${from} → ${to} is a chest`).toBe('C');
      expect(chestTopicAt(ZONES.dawnreach, x, y)).toBeDefined();
    }
  });

  it('a save from a newer version is refused, not stripped (the stale-client guard)', () => {
    expect(saveIsTooNew({ version: SAVE_VERSION + 1 })).toBe(true);
    expect(saveIsTooNew({ version: SAVE_VERSION })).toBe(false);
    expect(saveIsTooNew(V1)).toBe(false);
    expect(saveIsTooNew({ coins: 3 })).toBe(false); // no version: v1
    expect(saveIsTooNew(null)).toBe(false);
  });

  it('TRIPWIRE: the ladder has a step for every version below SAVE_VERSION', () => {
    // runMigrations stops silently at a missing step and normalizeSave then
    // stamps the payload as fully current — a gap would permanently mask a
    // never-run migration (see the MIGRATIONS doc comment). This must hold
    // for every version. (The stale-client guard, `saveIsTooNew`, came with
    // the first bump, v2.)
    for (let v = 1; v < SAVE_VERSION; v++) {
      expect(MIGRATIONS[v], `missing migration step ${v} → ${v + 1}`).toBeTypeOf('function');
    }
    // No orphan steps at/above the current version either.
    for (const key of Object.keys(MIGRATIONS)) {
      expect(Number(key)).toBeLessThan(SAVE_VERSION);
    }
  });
});

describe('normalizeSave', () => {
  it('returns a default for junk input', () => {
    expect(normalizeSave(null)).toEqual(defaultSave());
    expect(normalizeSave('garbage')).toEqual(defaultSave());
    expect(normalizeSave(42)).toEqual(defaultSave());
  });

  it('the defend timer is on by default; only an explicit false turns it off', () => {
    expect(defaultSave().defendTimer).toBe(true);
    expect(normalizeSave({}).defendTimer).toBe(true);
    expect(normalizeSave({ defendTimer: false }).defendTimer).toBe(false);
    expect(normalizeSave({ defendTimer: 'nope' }).defendTimer).toBe(true);
  });

  it('keeps the chosen battle companion; older saves and unknown ids default to Ember', () => {
    expect(normalizeSave({ companionId: 'pip' }).companionId).toBe('pip');
    expect(normalizeSave({}).companionId).toBe('ember');
    expect(normalizeSave({ companionId: 'dragonzilla' }).companionId).toBe('ember');
    expect(defaultSave().companionId).toBe('ember');
  });

  it('keeps valid fields and repairs invalid ones', () => {
    const s = normalizeSave({
      zoneId: 'numbria',
      coins: 50,
      hp: -5,
      pos: { x: 'nope' },
      worldUnlocked: true,
      items: { potion: 3 },
      flags: { 'crystal-math-restored': true },
    });
    expect(s.zoneId).toBe('numbria');
    expect(s.coins).toBe(50);
    expect(s.hp).toBeNull(); // invalid hp → full
    expect(s.pos).toBeNull(); // malformed pos → zone default
    expect(s.worldUnlocked).toBe(true);
    expect(s.items.potion).toBe(3);
    expect(s.items.hint).toBe(defaultSave().items.hint);
    expect(s.flags['crystal-math-restored']).toBe(true);
  });

  it('rejects an unknown zone id (and the position that went with it)', () => {
    const s = normalizeSave({ version: 2, zoneId: 'narnia', pos: { x: 10, y: 10 } });
    expect(s.zoneId).toBe('lumina-village');
    expect(s.pos).toBeNull();
  });

  it('repairs kill counts and quest items (#42)', () => {
    const s = normalizeSave({
      kills: { 'count-bat': 2, 'sum-slime': -1, junk: 'nope', half: 1.9 },
      questItems: ['color-seed', 42],
    });
    expect(s.kills).toEqual({ 'count-bat': 2, half: 1 });
    expect(s.questItems).toEqual(['color-seed']);
    expect(normalizeSave({}).kills).toEqual({});
    expect(normalizeSave({ kills: 'junk' }).kills).toEqual({});
  });
});

describe('migrateLegacy', () => {
  it('maps the old persisted gameStore shape', () => {
    const legacy = JSON.stringify({
      state: {
        progress: {
          completedRounds: [{ passed: true }, { passed: false }, { passed: true }],
          worldUnlocked: true,
        },
        avatar: { id: 'a2' },
      },
      version: 0,
    });
    const s = migrateLegacy(legacy);
    expect(s).not.toBeNull();
    expect(s!.passedRounds).toBe(2);
    expect(s!.worldUnlocked).toBe(true);
    expect(s!.avatarId).toBe('a2');
  });

  it('returns null for missing or malformed payloads', () => {
    expect(migrateLegacy(null)).toBeNull();
    expect(migrateLegacy('not json')).toBeNull();
    expect(migrateLegacy('{}')).toBeNull();
  });
});

describe('pushLibrary', () => {
  it('appends new misses and dedupes by question id', () => {
    const existing: LibraryEntry[] = [{ question: q('1'), picked: 1 }];
    const out = pushLibrary(existing, [
      { question: q('1'), picked: 2 },
      { question: q('2'), picked: 0 },
    ]);
    expect(out.map((e) => e.question.id)).toEqual(['1', '2']);
  });

  it('caps the queue, dropping the oldest first', () => {
    const existing: LibraryEntry[] = Array.from({ length: LIBRARY_MAX }, (_, i) => ({
      question: q(`old-${i}`),
      picked: 0,
    }));
    const out = pushLibrary(existing, [{ question: q('new'), picked: 0 }]);
    expect(out).toHaveLength(LIBRARY_MAX);
    expect(out[0].question.id).toBe('old-1');
    expect(out[out.length - 1].question.id).toBe('new');
  });
});

describe('the last inn rested at (#75 item 11)', () => {
  it('a new save, and one from before inns were everywhere, wakes at home', () => {
    expect(defaultSave().lastRest).toBeNull();
    expect(normalizeSave({ version: 2, coins: 3 }).lastRest).toBeNull();
    expect(wakeAfterDefeat(defaultSave())).toEqual({ zoneId: HUB_ZONE, pos: null });
    expect(wakeInnName(defaultSave())).toBeNull();
  });

  it('keeps a town with an inn, and drops anything else', () => {
    expect(normalizeSave({ version: 2, lastRest: 'numbria' }).lastRest).toBe('numbria');
    expect(normalizeSave({ version: 2, lastRest: 'whispering-woods' }).lastRest).toBeNull(); // no inn there
    expect(normalizeSave({ version: 2, lastRest: 'atlantis' }).lastRest).toBeNull();
    expect(normalizeSave({ version: 2, lastRest: 7 }).lastRest).toBeNull();
  });

  it('a defeat wakes the hero just inside the door of that inn', () => {
    const cell = innWakeCell(ZONES.gearfall)!;
    expect(wakeAfterDefeat({ lastRest: 'gearfall' })).toEqual({
      zoneId: 'gearfall',
      pos: { x: cell.x * TILE + TILE / 2, y: cell.y * TILE + TILE / 2 },
    });
    expect(wakeInnName({ lastRest: 'gearfall' })).toBe('the Wound-Down Inn in Gearfall Canyon');
    expect(wakeInnName({ lastRest: 'lumina-village' })).toBe('the Sleepy Sheep Inn in Lumina Village');
  });
});

describe('home to bed after the Spire (#75 item 14)', () => {
  it('puts the hero inside the Sleepy Sheep Inn in Lumina Village, healed, resting there', () => {
    const rest = restAtHomeInn();
    expect([rest.zoneId, rest.hp, rest.lastRest, rest.aboard]).toEqual([HUB_ZONE, null, HUB_ZONE, false]);
    const cell = { x: Math.floor(rest.pos!.x / TILE), y: Math.floor(rest.pos!.y / TILE) };
    expect(buildingInside(ZONES[HUB_ZONE], cell.x, cell.y)?.name).toBe('Sleepy Sheep Inn');
    // …which is also where a later defeat wakes them, and it survives a reload.
    const saved = normalizeSave({ ...defaultSave(), ...rest });
    expect([saved.zoneId, saved.pos, saved.lastRest]).toEqual([HUB_ZONE, rest.pos, HUB_ZONE]);
  });

  it('a save between the finale and Act II loads asleep at the inn, so Act II\'s "You wake… at the Sleepy Sheep Inn" is true', () => {
    // Beat the Spire before the walk home existed, then wandered off to the Coast.
    const elsewhere = { ...defaultSave(), zoneId: 'starfall-coast', pos: { x: 80, y: 80 }, hp: 3, lastRest: null };
    const finaleSeen = normalizeSave({ ...elsewhere, flags: { [SPIRE_VICTORY_SEEN]: true } });
    expect([finaleSeen.zoneId, finaleSeen.pos, finaleSeen.hp, finaleSeen.lastRest]).toEqual([
      HUB_ZONE,
      restAtHomeInn().pos,
      null,
      HUB_ZONE,
    ]);
    // Before the finale, or once Act II has opened, the hero stays put.
    for (const flags of [{}, { [SPIRE_VICTORY_SEEN]: true, [ACT2_SEEN]: true }]) {
      const s = normalizeSave({ ...elsewhere, flags });
      expect([s.zoneId, s.pos]).toEqual(['starfall-coast', { x: 80, y: 80 }]);
    }
  });
});


// #75 item 14b: every shape a save has had since v1 still loads — where it
// stood (or somewhere safe beside it), with nothing lost, never stranded,
// and the story's next step still walkable from there.
describe('old saves load (#75 item 14b)', () => {
  const cellOf = (p: { x: number; y: number }) => ({ x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) });
  const cases: { name: string; raw: Record<string, unknown>; zone: string; at?: { x: number; y: number }; keeps?: Partial<SaveData> }[] = [
    { name: 'v1 on the retired Lumina Field', raw: V1, zone: HUB_ZONE },
    { name: 'v2 from its first build (no marker)', raw: V2_FIRST_BUILD, zone: 'dawnreach', at: V2_FIRST_BUILD.pos, keeps: { lastRest: null, boat: null, aboard: false } },
    { name: 'v2 in the Depths vault, before the stairs', raw: V2_PRE_ITEM10, zone: 'clockwork-depths', at: V2_PRE_ITEM10.pos, keeps: { companionId: 'pip', lastRest: null } },
    { name: 'v2 with an inn, before the boat', raw: V2_PRE_14A, zone: 'verdara', at: V2_PRE_14A.pos, keeps: { lastRest: 'numbria', boat: null, aboard: false, defendTimer: false } },
    { name: 'today: sailing the Silver Shallows', raw: CURRENT_ABOARD, zone: 'silver-shallows', at: CURRENT_ABOARD.pos, keeps: { aboard: true } },
    { name: "the finale seen, Act II not", raw: FINALE_NOT_ACT2, zone: HUB_ZONE, keeps: { lastRest: HUB_ZONE } },
  ];

  it.each(cases)('$name: loads as v2 where it stood, keeping what it had', ({ raw, zone, at, keeps }) => {
    const s = normalizeSave(raw);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.flags[SAVE_V2_FLAG]).toBe(true);
    expect(s.zoneId).toBe(zone);
    if (at) expect(s.pos).toEqual(at);
    if (keeps) expect(s).toMatchObject(keeps);
    // Coins, items, story and kills come through untouched.
    expect(s.coins).toBe(raw.coins);
    for (const flag of Object.keys(raw.flags as object)) expect(s.flags[flag], flag).toBe(true);
    expect(s.kills).toEqual(raw.kills);
  });

  it.each(cases)('$name: loading it twice changes nothing more (a re-save never drifts)', ({ raw }) => {
    const once = normalizeSave(raw);
    expect(normalizeSave(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it.each(cases)('$name: never stranded — a way out of where it stands', ({ raw }) => {
    const s = normalizeSave(raw);
    const z = ZONES[s.zoneId];
    const pos = safeSpawn(z, s.pos, s.flags, s.aboard ? 'boat' : 'foot');
    const boat = boatSpot(s);
    const open = reach(z, {
      from: cellOf(pos),
      aboard: s.aboard,
      modes: ['foot', 'boat'],
      boat: boat && boat.zoneId === z.id ? boat : null,
      flags: s.flags,
      gates: 'flags',
      exits: 'stop',
    });
    const out = [...open].some((k) => {
      const [x, y] = k.split(',').map(Number);
      return z.exits.some((e) => e.x === x && e.y === y) || seaCrossing(z, x, y, ZONES) !== null;
    });
    expect(out, `${s.zoneId} from ${cellOf(pos).x},${cellOf(pos).y}`).toBe(true);
  });

  it.each(cases.filter((c) => ['crystal', 'key', 'spire'].includes(nextObjective(normalizeSave(c.raw).flags).kind)))(
    "$name: the story's next step walks from where it loads",
    ({ raw }) => {
      const s = normalizeSave(raw);
      const pos = safeSpawn(ZONES[s.zoneId], s.pos, s.flags);
      const leg = walkLeg(nextObjective(s.flags), s.flags, { zoneId: s.zoneId, cell: cellOf(pos) });
      for (const h of leg.hops) expect(h.path, `${leg.goal.title}: across ${h.zoneId}`).not.toBeNull();
    },
  );

  it("the vault save holds the vault gate's flag (it couldn't stand there otherwise)", () => {
    const b1 = ZONES['clockwork-depths'];
    expect(tileAt(b1, 10, 8)).toBe('G');
    expect(V2_PRE_ITEM10.flags).toHaveProperty(gateFlag(gateIdAt('clockwork-depths', b1.map, 11, 8)), true);
  });

  it('the save standing where the Depths\' stairs were drawn later loads beside them, not on them', () => {
    const s = normalizeSave(V2_PRE_ITEM10);
    const pos = safeSpawn(ZONES[s.zoneId], s.pos, s.flags);
    const cell = cellOf(pos);
    expect(tileAt(ZONES[s.zoneId], 19, 10)).toBe('>');
    expect(cell).not.toEqual({ x: 19, y: 10 });
    expect(Math.max(Math.abs(cell.x - 19), Math.abs(cell.y - 10))).toBeLessThanOrEqual(2);
  });
});
