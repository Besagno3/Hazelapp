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

  it('no healer can out-mend a correctly-answered hit — stall-proof at any age', () => {
    // Derived from the live roster (not a hardcoded HP), so retuning a
    // healer's HP or tagging a beefier enemy as a healer re-checks this
    // automatically. age 100 → the level cap, i.e. each healer's max HP.
    const healers = Object.values(ENEMY_DEFS).filter((d) => d.behavior === 'healer');
    expect(healers.length).toBeGreaterThan(0);
    for (const def of healers) {
      const e = spawnEnemy(def.id, 'starfall-coast', '0,0', 100);
      expect(
        healerRegen(e.maxHp),
        `${def.id} (maxHp ${e.maxHp}) out-mends the weakest landed hit`,
      ).toBeLessThan(attackDamage(true, 'defensive', {}));
    }
  });
});

describe('enemy scaling: age baseline + player level growth', () => {
  it('a new player meets enemies at their age level', () => {
    expect(spawnEnemy('count-bat', 'numbria', 'a', 8, 1).level).toBe(spawnEnemy('count-bat', 'numbria', 'a', 8).level);
  });

  it('enemies grow as the player levels up (one step per 5 levels)', () => {
    const lv1 = spawnEnemy('count-bat', 'numbria', 'a', 8, 1);
    const lv6 = spawnEnemy('count-bat', 'numbria', 'a', 8, 6);
    expect(lv6.level).toBe(lv1.level + 1);
    expect(lv6.maxHp).toBeGreaterThan(lv1.maxHp);
  });

  it('enemies grow as the player gets older', () => {
    expect(spawnEnemy('count-bat', 'numbria', 'a', 9, 1).level).toBeGreaterThan(spawnEnemy('count-bat', 'numbria', 'a', 8, 1).level);
  });
});
