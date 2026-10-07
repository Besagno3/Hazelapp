import { describe, it, expect } from 'vitest';
import {
  defaultSave,
  normalizeSave,
  migrateLegacy,
  pushLibrary,
  runMigrations,
  saveIsTooNew,
  DAWNREACH_GREW_BY,
  MIGRATIONS,
  MOVED_CHESTS,
  SAVE_VERSION,
  type MigrationLadder,
} from './save';
import { LIBRARY_MAX } from '../content/items';
import { TILE, ZONES, chestTopicAt, tileAt } from '../content/zones';
import type { LibraryEntry, Question } from '../types';

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

  // A real v1 save, as v1 wrote it (#75 item 8 bumps to v2).
  const V1 = {
    version: 1,
    avatarId: 'blaze',
    zoneId: 'lumina-field',
    pos: { x: 336, y: 368 },
    hp: 80,
    coins: 120,
    items: { potion: 2, hint: 1, elixir: 0, spark: 0, ward: 0, clover: 0, tea: 0, snack: 0, coil: 0, mirror: 0 },
    badges: ['badge-numbria'],
    sages: ['math'],
    sageEquipped: 'math',
    flags: { 'crystal-math-restored': true, 'intro-seen': true },
    openedChests: ['numbria:chest:12,4', 'dawnreach:chest:13,9'],
    kills: { 'count-bat': 1 },
    questItems: [],
    passedRounds: 3,
    worldUnlocked: true,
    library: [],
    companionId: 'ember',
    defendTimer: true,
  };
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
