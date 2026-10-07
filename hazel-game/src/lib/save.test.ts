import { describe, it, expect } from 'vitest';
import {
  defaultSave,
  normalizeSave,
  migrateLegacy,
  pushLibrary,
  runMigrations,
  MIGRATIONS,
  SAVE_VERSION,
  type MigrationLadder,
} from './save';
import { LIBRARY_MAX } from '../content/items';
import type { LibraryEntry, Question } from '../types';

function q(id: string): Question {
  return { id, topic: 'math', level: 3, text: '?', options: ['a', 'b', 'c', 'd'], correctIndex: 0 };
}

describe('defaultSave', () => {
  it('starts at the hub, locked world, starter items', () => {
    const s = defaultSave();
    expect(s.zoneId).toBe('lumina-field');
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

  it('the real ladder is empty while SAVE_VERSION is 1', () => {
    expect(SAVE_VERSION).toBe(1);
    expect(Object.keys(MIGRATIONS)).toHaveLength(0);
    const v1 = { version: 1, coins: 12 };
    expect(runMigrations(v1)).toEqual(v1);
  });

  it('TRIPWIRE: the ladder has a step for every version below SAVE_VERSION', () => {
    // runMigrations stops silently at a missing step and normalizeSave then
    // stamps the payload as fully current — a gap would permanently mask a
    // never-run migration (see the MIGRATIONS doc comment). This must hold
    // for every version, and the first bump must also add the stale-client
    // downgrade guard described there.
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

  it('rejects an unknown zone id', () => {
    expect(normalizeSave({ zoneId: 'narnia' }).zoneId).toBe('lumina-field');
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
