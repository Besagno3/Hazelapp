import { describe, it, expect } from 'vitest';
import {
  DEFEND_MAX_MS,
  DEFEND_MERCY_BONUS_MS,
  DEFEND_MIN_MS,
  defendTimeMs,
  MERCY_AFTER,
  POWER_MULTIPLIER,
  STREAK_MAX,
  STREAK_START,
  mercyFor,
  nextIntent,
  powerMoveName,
  resolveEnemyAttack,
  resolveHeroHit,
  rollDrop,
  streakMultiplier,
  victoryCoins,
  type EnemyAttackInput,
} from './battleTurn';
import { ENEMY_DEFS } from '../content/enemies';
import { CONSUMABLE_IDS } from '../content/items';

describe('resolveHeroHit', () => {
  const base = { dmg: 30, enemyHp: 100, enemyMaxHp: 100, shielded: false, isBoss: false, lastPhase: 0 };

  it('subtracts damage and reports defeat at 0', () => {
    expect(resolveHeroHit(base)).toMatchObject({ newEnemyHp: 70, defeated: false, shieldBroke: false });
    expect(resolveHeroHit({ ...base, dmg: 500 })).toMatchObject({ newEnemyHp: 0, defeated: true });
  });

  it('a shield absorbs the first landed hit — even a glancing one', () => {
    expect(resolveHeroHit({ ...base, dmg: 3, shielded: true })).toMatchObject({ shieldBroke: true, newEnemyHp: 100 });
  });

  it('reports a boss phase crossing once, and never on the killing blow', () => {
    expect(resolveHeroHit({ ...base, isBoss: true, dmg: 40 }).phaseCrossed).toBe(1);
    expect(resolveHeroHit({ ...base, isBoss: true, dmg: 40, lastPhase: 1 }).phaseCrossed).toBeNull();
    expect(resolveHeroHit({ ...base, isBoss: true, dmg: 100 }).phaseCrossed).toBeNull();
  });
});

describe('nextIntent', () => {
  it('never charges on the first enemy turn', () => {
    expect(nextIntent(null, 0, false, 0)).toBe('attack');
    expect(nextIntent(null, 0, true, 0)).toBe('attack');
  });

  it('a charge is always followed by its power blow, then a normal turn', () => {
    expect(nextIntent('charge', 5, false, 0.99)).toBe('power');
    expect(nextIntent('power', 6, false, 0)).toBe('attack');
  });

  it('regular enemies charge on a low roll; bosses on a fixed rhythm', () => {
    expect(nextIntent('attack', 1, false, 0.1)).toBe('charge');
    expect(nextIntent('attack', 1, false, 0.5)).toBe('attack');
    expect(nextIntent('attack', 2, true, 0.99)).toBe('charge');
    expect(nextIntent('attack', 1, true, 0)).toBe('attack');
  });

  it('every boss has its own signature move name', () => {
    const bosses = Object.values(ENEMY_DEFS).filter((d) => d.isBoss);
    const names = bosses.map((b) => powerMoveName(b.id));
    expect(names).not.toContain('Mighty Blow');
    expect(new Set(names).size).toBe(bosses.length);
    expect(powerMoveName('sum-slime')).toBe('Mighty Blow');
  });
});

describe('resolveEnemyAttack', () => {
  const base: EnemyAttackInput = {
    level: 5, isBoss: false, phase: 0, intent: 'attack', guarded: false, wasCorrect: false,
    style: 'balanced', powerUps: {}, playerHp: 100, enemyHp: 50, enemyMaxHp: 100,
  };

  it('a power blow hits POWER_MULTIPLIER× as hard', () => {
    const normal = resolveEnemyAttack(base).dmg;
    expect(resolveEnemyAttack({ ...base, intent: 'power' }).dmg).toBe(normal * POWER_MULTIPLIER);
  });

  it('a guard blocks even a power blow completely', () => {
    expect(resolveEnemyAttack({ ...base, intent: 'power', guarded: true }).dmg).toBe(0);
  });

  it('a correct defend answer softens the blow', () => {
    expect(resolveEnemyAttack({ ...base, wasCorrect: true }).dmg).toBeLessThan(resolveEnemyAttack(base).dmg);
  });

  it('a healer below half HP mends at the end of its turn', () => {
    const r = resolveEnemyAttack({ ...base, behavior: 'healer', enemyHp: 40 });
    expect(r.mended).toBeGreaterThan(0);
    expect(r.newEnemyHp).toBe(40 + r.mended);
    expect(resolveEnemyAttack({ ...base, behavior: 'healer', enemyHp: 90 }).mended).toBe(0);
  });

  it('reports a knockout', () => {
    expect(resolveEnemyAttack({ ...base, playerHp: 1 }).knockedOut).toBe(true);
  });
});

describe('streaks, mercy, rewards', () => {
  it('the streak bonus starts at STREAK_START and caps at STREAK_MAX', () => {
    expect(streakMultiplier(STREAK_START - 1)).toBe(1);
    expect(streakMultiplier(STREAK_START)).toBeGreaterThan(1);
    expect(streakMultiplier(STREAK_MAX)).toBeGreaterThan(streakMultiplier(STREAK_START));
    expect(streakMultiplier(STREAK_MAX + 10)).toBe(streakMultiplier(STREAK_MAX));
  });

  it('mercy makes questions easier after MERCY_AFTER losses — and nothing else', () => {
    expect(mercyFor(MERCY_AFTER - 1)).toEqual({ levelDrop: 0 });
    expect(mercyFor(MERCY_AFTER)).toEqual({ levelDrop: 1 });
  });

  it('the first win over an enemy kind pays a coin bonus', () => {
    expect(victoryCoins(10, 0)).toBeGreaterThan(10);
    expect(victoryCoins(10, 3)).toBe(10);
  });

  it('bosses always drop; regular drops are real consumables or nothing', () => {
    expect(rollDrop(true, 0.99)).toBe('elixir');
    const seen = new Set([0, 0.1, 0.2, 0.3, 0.5, 0.99].map((r) => rollDrop(false, r)));
    expect(seen.has(null)).toBe(true);
    for (const d of seen) if (d) expect(CONSUMABLE_IDS).toContain(d);
  });
});

describe('defendTimeMs', () => {
  it('younger kids get more time', () => {
    expect(defendTimeMs(6, 1)).toBeGreaterThan(defendTimeMs(9, 1));
    expect(defendTimeMs(9, 1)).toBeGreaterThan(defendTimeMs(13, 1));
  });

  it('a young reader never gets as little as 15s', () => {
    for (const age of [5, 6, 7, 8]) expect(defendTimeMs(age, 99)).toBeGreaterThan(15_000);
  });

  it('leveling up trims it a little, never below the minimum', () => {
    expect(defendTimeMs(9, 20)).toBeLessThan(defendTimeMs(9, 1));
    expect(defendTimeMs(9, 1) - defendTimeMs(9, 20)).toBeLessThanOrEqual(3_000);
    expect(defendTimeMs(18, 99)).toBe(DEFEND_MIN_MS);
    expect(defendTimeMs(3, 1)).toBe(DEFEND_MAX_MS);
  });

  it('mercy adds a few seconds on top', () => {
    expect(defendTimeMs(10, 1, true)).toBe(defendTimeMs(10, 1) + DEFEND_MERCY_BONUS_MS);
  });
});
