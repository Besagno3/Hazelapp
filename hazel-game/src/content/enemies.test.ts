import { describe, it, expect } from 'vitest';
import { BOSS_ROLES, ENEMY_BEHAVIORS } from '../types';
import { attackDamage, healerRegen } from '../lib/battleMath';
import { BOSS_RAGE, ENEMY_DEFS, bossScript, fiendFor, rageLine, spawnEnemy } from './enemies';
import { keyForBoss } from './keys';
import { BOSS_LINES } from './story';
import { TOPIC_REGISTRY, crystalInfo } from './topics';

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

  it('every boss has a role, and only bosses do (#75 item 14c)', () => {
    for (const def of Object.values(ENEMY_DEFS)) {
      if (def.isBoss) expect(BOSS_ROLES, `${def.id} has no role`).toContain(def.role);
      else expect(def.role, `${def.id} isn't a boss`).toBeUndefined();
    }
  });

  it('one Fiend per crystal, on its own topic; a warden exactly when its boss drops a gate key', () => {
    for (const t of TOPIC_REGISTRY) {
      const fiends = Object.values(ENEMY_DEFS).filter((e) => e.role === 'fiend' && e.topic === t.id);
      expect(fiends.map((f) => f.id), t.id).toHaveLength(1);
      expect(fiendFor(t.id)).toBe(fiends[0]);
    }
    for (const def of Object.values(ENEMY_DEFS)) {
      if (def.role === 'fiend') expect(TOPIC_REGISTRY.map((t) => t.id), def.id).toContain(def.topic);
      expect(def.role === 'warden', def.id).toBe(!!keyForBoss(def.id));
    }
    // The Clockwork Titan is a history warden, not history's Fiend: Memory has its own (#75 item 14h).
    expect(fiendFor('history').id).toBe('hollow-fiend');
    expect(fiendFor('history').id).not.toBe('clockwork-titan');
  });

  it("a Fiend goes by its crystal's Fiend name, every other boss by its own", () => {
    expect(spawnEnemy('null-fiend', 'numbria', '1,1', 9).name).toBe(crystalInfo('math').fiendName);
    expect(spawnEnemy('clockwork-titan', 'clockwork-depths-b3', '1,1', 9).name).toBe('The Clockwork Titan');
    expect(spawnEnemy('null-fiend', 'numbria', '1,1', 9).role).toBe('fiend');
  });

  it('bossScript: a Fiend speaks its crystal\'s lines, a warden its key\'s, any other boss its own or nothing', () => {
    expect(bossScript({ id: 'null-fiend', topic: 'math', role: 'fiend' })).toBe(BOSS_LINES.math);
    const key = keyForBoss('thicket-warden')!;
    expect(bossScript({ id: 'thicket-warden', topic: 'nature', role: 'warden' })).toEqual({ intro: key.bossIntro, defeat: key.bossDefeat });
    // A miniboss with no lines on a topic with no BOSS_LINES — no crash, just nothing.
    expect(bossScript({ id: 'no-such-boss', topic: 'nature', role: 'miniboss' })).toBeNull();
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
      for (const tier of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
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

describe('bosses get angrier in their own words (#75 item 14g — "bosses should be more menacing")', () => {
  it('every boss has two rage lines of its own, each naming it, under 30 words', () => {
    for (const def of Object.values(ENEMY_DEFS).filter((d) => d.isBoss)) {
      const lines = BOSS_RAGE[def.id];
      expect(lines, def.id).toBeDefined();
      for (const phase of [1, 2] as const) {
        const line = rageLine(def.id, def.name, phase);
        expect(line, `${def.id} ${phase}`).toContain(def.name);
        expect(line.split(/\s+/).length, `${def.id} ${phase}`).toBeLessThanOrEqual(30);
      }
      expect(lines[0]).not.toBe(lines[1]);
    }
  });

  it('a boss without its own falls back to a general pair', () => {
    expect(rageLine('nobody', 'The Mystery Boss', 1)).toBe("The Mystery Boss roars — it's getting serious!");
    expect(rageLine('nobody', 'The Mystery Boss', 2)).toBe('The Mystery Boss is furious — watch out!');
  });
});

describe('the Deep Root\'s echoes (#75 item 16d)', () => {
  const echoes = Object.values(ENEMY_DEFS).filter((e) => e.role === 'echo');
  it('three echoes, each a boss with its own intro and last words, two levels up', () => {
    expect(echoes.map((e) => e.id).sort()).toEqual(['echo-clockwork-titan', 'echo-thicket-warden', 'echo-tide-colossus']);
    for (const e of echoes) {
      expect(e.isBoss, e.id).toBe(true);
      expect(e.levelOffset, e.id).toBe(2);
      const script = bossScript(e)!;
      expect(script.intro.length, e.id).toBeGreaterThan(0);
      expect(script.defeat, e.id).toBeTruthy();
      expect(keyForBoss(e.id), e.id).toBeUndefined();
    }
  });
});
