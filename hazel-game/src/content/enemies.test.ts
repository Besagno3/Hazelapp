import { describe, it, expect } from 'vitest';
import { ENEMY_DEFS, spawnEnemy } from './enemies';

const BEHAVIORS = ['shielded', 'trickster', 'healer'] as const;

describe('enemy behavior archetypes (Wave 0.5)', () => {
  it('every declared behavior is a known archetype', () => {
    for (const def of Object.values(ENEMY_DEFS)) {
      if (def.behavior) {
        expect(BEHAVIORS, `${def.id} behavior`).toContain(def.behavior);
      }
    }
  });

  it('each archetype is exercised by at least one enemy', () => {
    const used = new Set(Object.values(ENEMY_DEFS).map((d) => d.behavior).filter(Boolean));
    for (const b of BEHAVIORS) expect(used, `no enemy uses ${b}`).toContain(b);
  });

  it('bosses stay archetype-free — their twist is the enrage-phase formula', () => {
    for (const def of Object.values(ENEMY_DEFS)) {
      if (def.isBoss) expect(def.behavior, `${def.id} is a boss with a behavior`).toBeUndefined();
    }
  });

  it('spawnEnemy carries the behavior onto the battle instance', () => {
    const moth = spawnEnemy('moon-moth', 'starfall-coast', '3,4', 9);
    expect(moth.behavior).toBe('healer');
    const slime = spawnEnemy('sum-slime', 'numbria', '5,5', 9);
    expect(slime.behavior).toBeUndefined();
  });
});
