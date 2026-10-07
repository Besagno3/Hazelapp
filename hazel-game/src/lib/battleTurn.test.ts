import { describe, it, expect } from 'vitest';
import {
  DEFEND_MAX_MS,
  DEFEND_MERCY_BONUS_MS,
  DEFEND_MIN_MS,
  defendTimeMs,
  fastAnswerMs,
  FAST_STREAK,
  MAX_SPEED_BOOST,
  speedStep,
  skillAfterBattle,
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

  it('a Mirror Charm blocks the blow and bounces it back', () => {
    const raw = resolveEnemyAttack(base).dmg; // wrong answer, no guard = the full blow
    const r = resolveEnemyAttack({ ...base, mirrored: true });
    expect(r.dmg).toBe(0);
    expect(r.reflected).toBe(raw);
    expect(r.newEnemyHp).toBe(50 - raw);
  });

  it("a shielded enemy's shield takes the bounce instead", () => {
    const r = resolveEnemyAttack({ ...base, mirrored: true, enemyShielded: true });
    expect(r).toMatchObject({ dmg: 0, reflected: 0, shieldBroke: true, newEnemyHp: 50 });
  });

  it('a bounce that finishes the enemy is a win — no healer mend, no knockout', () => {
    const r = resolveEnemyAttack({ ...base, mirrored: true, enemyHp: 1, playerHp: 0, behavior: 'healer' });
    expect(r).toMatchObject({ defeated: true, knockedOut: false, mended: 0, newEnemyHp: 0 });
  });

  it('a healer mends from its HP after the bounce', () => {
    const r = resolveEnemyAttack({ ...base, mirrored: true, behavior: 'healer', enemyHp: 45 });
    expect(r.mended).toBeGreaterThan(0);
    expect(r.newEnemyHp).toBe(45 - r.reflected + r.mended);
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
    expect(defendTimeMs(6)).toBeGreaterThan(defendTimeMs(9));
    expect(defendTimeMs(9)).toBeGreaterThan(defendTimeMs(13));
  });

  it('a young reader (5–8) always gets more than 15s', () => {
    for (const age of [5, 6, 7, 8]) expect(defendTimeMs(age)).toBeGreaterThan(15_000);
  });

  it('is clamped to 10–25s', () => {
    expect(defendTimeMs(18)).toBe(DEFEND_MIN_MS);
    expect(defendTimeMs(3)).toBe(DEFEND_MAX_MS);
  });

  it('mercy adds a few seconds on top', () => {
    expect(defendTimeMs(10, true)).toBe(defendTimeMs(10) + DEFEND_MERCY_BONUS_MS);
  });
});

describe('speed trigger', () => {
  const age = 9;
  const quick = fastAnswerMs(age) - 1;

  it('"quick" is half the age countdown — more time for younger kids', () => {
    expect(fastAnswerMs(age)).toBe(defendTimeMs(age) / 2);
    expect(fastAnswerMs(6)).toBeGreaterThan(fastAnswerMs(12));
  });

  it(`${FAST_STREAK} quick correct answers in a row raise the level`, () => {
    let run = 0;
    let boosted = false;
    for (let i = 0; i < FAST_STREAK; i++) ({ run, boosted } = speedStep(run, true, quick, age, 0));
    expect(boosted).toBe(true);
    expect(run).toBe(0); // the next step needs another full streak
  });

  it('a slow answer, a wrong answer, or a hinted answer (Infinity) breaks the run', () => {
    expect(speedStep(4, true, fastAnswerMs(age) + 1, age, 0)).toEqual({ run: 0, boosted: false });
    expect(speedStep(4, false, quick, age, 0)).toEqual({ run: 0, boosted: false });
    expect(speedStep(4, true, Infinity, age, 0)).toEqual({ run: 0, boosted: false });
  });

  it(`never raises more than ${MAX_SPEED_BOOST} in one battle`, () => {
    expect(speedStep(FAST_STREAK - 1, true, quick, age, MAX_SPEED_BOOST).boosted).toBe(false);
  });

  it('the saved level after a battle keeps what speed earned, and never drops', () => {
    expect(skillAfterBattle(4, [true, false, false, false], 1)).toBe(5);
    expect(skillAfterBattle(4, [false, false], 0)).toBe(4);
    expect(skillAfterBattle(4, Array(6).fill(true), 1)).toBeGreaterThanOrEqual(5);
    expect(skillAfterBattle(10, Array(6).fill(true), 2)).toBe(10);
  });

  it('fleeing (no ramp answers) still keeps the speed boost', () => {
    expect(skillAfterBattle(4, [], 1)).toBe(5);
    expect(skillAfterBattle(4, [], 0)).toBe(4);
  });
});
