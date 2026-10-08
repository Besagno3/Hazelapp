import { describe, it, expect } from 'vitest';
import { ENEMY_BEHAVIORS } from '../types';
import { attackDamage, healerRegen } from '../lib/battleMath';
import { ENEMY_DEFS, spawnEnemy } from './enemies';

const BEHAVIORS = ENEMY_BEHAVIORS;

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

  it('no healer can out-mend a correctly-answered hit — stall-proof at any age, in any region', () => {
    // Derived from the live roster (not a hardcoded HP), so retuning a
    // healer's HP or tagging a beefier enemy as a healer re-checks this
    // automatically. age 100 → the level cap; every danger tier (#75 item 12)
    // → each healer's max HP anywhere it could roam.
    const healers = Object.values(ENEMY_DEFS).filter((d) => d.behavior === 'healer');
    expect(healers.length).toBeGreaterThan(0);
    for (const def of healers) {
      for (const tier of [0, 1, 2, 3, 4] as const) {
        const e = spawnEnemy(def.id, 'starfall-coast', '0,0', 100, {}, tier);
        expect(
          healerRegen(e.maxHp),
          `${def.id} at tier ${tier} (maxHp ${e.maxHp}) out-mends the weakest landed hit`,
        ).toBeLessThan(attackDamage(true, 'defensive', {}));
      }
    }
  });
});

describe('enemy scaling: the player\'s question level for the topic', () => {
  it('a player new to the topic meets enemies at their age baseline', () => {
    expect(spawnEnemy('count-bat', 'numbria', 'a', 8, {}).level).toBe(spawnEnemy('count-bat', 'numbria', 'a', 8).level);
    expect(spawnEnemy('count-bat', 'numbria', 'a', 9).level).toBeGreaterThan(spawnEnemy('count-bat', 'numbria', 'a', 8).level);
  });

  it('follows the question level for the enemy\'s own topic', () => {
    const base = spawnEnemy('count-bat', 'numbria', 'a', 8); // a math enemy
    const better = spawnEnemy('count-bat', 'numbria', 'a', 8, { math: 7 });
    expect(better.level).toBeGreaterThan(base.level);
    expect(better.maxHp).toBeGreaterThan(base.maxHp);
    // a level earned in another topic doesn't carry over
    expect(spawnEnemy('count-bat', 'numbria', 'a', 8, { science: 9 }).level).toBe(base.level);
  });
});
