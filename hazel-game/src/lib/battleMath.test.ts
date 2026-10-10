import { describe, it, expect } from 'vitest';
import {
  attackDamage,
  specialDamage,
  spellDamage,
  companionAttackDamage,
  pairDamage,
  enemyAttack,
  defendReduction,
  bossPhase,
  healerMends,
  healerRegen,
  HEALER_REGEN_RATE,
  HEALER_REGEN_MAX,
  STYLE_ATTACK,
  STYLE_MAGIC,
} from './battleMath';
import { FIGHT_STYLES } from '../types';
import { EMBER_POWER } from '../content/companion';

describe('attackDamage', () => {
  it('a correct answer outdamages a glancing blow', () => {
    expect(attackDamage(true, 'balanced', {})).toBeGreaterThan(attackDamage(false, 'balanced', {}));
  });

  it('a wrong answer still lands something (never zero)', () => {
    expect(attackDamage(false, 'balanced', {})).toBeGreaterThan(0);
  });

  it('aggressive style hits hardest', () => {
    expect(attackDamage(true, 'aggressive', {})).toBeGreaterThan(attackDamage(true, 'defensive', {}));
  });

  it('Power Strike stacks raise damage', () => {
    expect(attackDamage(true, 'balanced', { attack: 3 })).toBeGreaterThan(
      attackDamage(true, 'balanced', {}),
    );
  });
});

describe('specialDamage', () => {
  it('a Special clearly outdamages a basic attack', () => {
    expect(specialDamage('balanced', {})).toBeGreaterThan(attackDamage(true, 'balanced', {}) * 2);
  });
});

describe('enemyAttack', () => {
  it('scales with level', () => {
    expect(enemyAttack(8, false, 0)).toBeGreaterThan(enemyAttack(2, false, 0));
  });

  it('bosses hit harder and enrage by phase', () => {
    expect(enemyAttack(5, true, 0)).toBeGreaterThan(enemyAttack(5, false, 0));
    expect(enemyAttack(5, true, 2)).toBeGreaterThan(enemyAttack(5, true, 0));
  });
});

describe('defendReduction', () => {
  it('a correct answer blocks far more than a miss', () => {
    expect(defendReduction(true, 'balanced', {})).toBeGreaterThan(
      defendReduction(false, 'balanced', {}),
    );
  });

  it('defensive style blocks the most', () => {
    expect(defendReduction(true, 'defensive', {})).toBeGreaterThan(
      defendReduction(true, 'aggressive', {}),
    );
  });

  it('Iron Guard gives a small passive block even on a miss', () => {
    expect(defendReduction(false, 'balanced', { defense: 4 })).toBeGreaterThan(0);
  });
});

describe('bossPhase', () => {
  it('moves 0 → 1 → 2 as HP drops through thirds', () => {
    expect(bossPhase(100, 100)).toBe(0);
    expect(bossPhase(60, 100)).toBe(1);
    expect(bossPhase(20, 100)).toBe(2);
  });
});

describe('healer archetype (Wave 0.5)', () => {
  it('mends only while hurt below half and still alive', () => {
    expect(healerMends(100, 100)).toBe(false); // unhurt
    expect(healerMends(50, 100)).toBe(false); // exactly half — not yet
    expect(healerMends(49, 100)).toBe(true);
    expect(healerMends(0, 100)).toBe(false); // defeated mid-resolution
  });

  it('regen is a whole-number fraction of max HP', () => {
    expect(healerRegen(120)).toBe(Math.round(120 * HEALER_REGEN_RATE));
    expect(Number.isInteger(healerRegen(133))).toBe(true);
  });

  it('regen is a fixed fraction up to a cap, so a big enough hit always outpaces it', () => {
    // Pure-function guarantee: regen scales linearly with maxHp at
    // HEALER_REGEN_RATE, capped at HEALER_REGEN_MAX (#75 item 12 — a far
    // region's beefier healer mends no more), so any hit above the cap makes
    // net progress. The roster-level "no healer out-mends a real hit"
    // invariant lives in enemies.test.ts, derived from ENEMY_DEFS.
    expect(healerRegen(150)).toBe(Math.round(150 * HEALER_REGEN_RATE));
    expect(healerRegen(200)).toBe(HEALER_REGEN_MAX);
    expect(healerRegen(300)).toBe(HEALER_REGEN_MAX);
  });
});

describe('companionAttackDamage', () => {
  it('power 0 (an egg) cannot fight', () => {
    expect(companionAttackDamage(true, EMBER_POWER.egg)).toBe(0);
  });

  it('Ember grows stronger with each stage', () => {
    expect(EMBER_POWER.dragon).toBeGreaterThan(EMBER_POWER.whelp);
    expect(EMBER_POWER.whelp).toBeGreaterThan(EMBER_POWER.hatchling);
  });

  it('a wrong answer is a glancing blow, never zero with any power', () => {
    expect(companionAttackDamage(false, 12)).toBeGreaterThan(0);
    expect(companionAttackDamage(false, 12)).toBeLessThan(companionAttackDamage(true, 12));
  });
});

describe('pairDamage', () => {
  it('combines hero and companion power', () => {
    expect(pairDamage('balanced', {}, EMBER_POWER.dragon, 1)).toBe(
      attackDamage(true, 'balanced', {}) + EMBER_POWER.dragon,
    );
  });

  it('outdamages a solo spell of the same multiplier', () => {
    expect(pairDamage('balanced', {}, EMBER_POWER.hatchling, 2.5)).toBeGreaterThan(spellDamage('balanced', {}, 2.5));
  });
});

describe('spell power (STYLE_MAGIC)', () => {
  it("the original three heroes' spells hit exactly as before — their spell power is their attack", () => {
    for (const style of ['aggressive', 'defensive', 'balanced'] as const) {
      expect(STYLE_MAGIC[style]).toBe(STYLE_ATTACK[style]);
      expect(spellDamage(style, {}, 2.5)).toBe(Math.round(STYLE_ATTACK[style] * 2.5));
    }
  });

  it("Nyx (mystic) has the strongest spells of every hero type, but the softest Attack", () => {
    for (const style of FIGHT_STYLES) {
      if (style === 'mystic') continue;
      expect(spellDamage('mystic', {}, 2.5), style).toBeGreaterThan(spellDamage(style, {}, 2.5));
      expect(attackDamage(true, 'mystic', {}), style).toBeLessThanOrEqual(attackDamage(true, style, {}));
    }
  });
});
