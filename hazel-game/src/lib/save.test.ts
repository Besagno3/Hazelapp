import { describe, it, expect } from 'vitest';
import { defaultSave, normalizeSave, migrateLegacy, pushLibrary } from './save';
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
