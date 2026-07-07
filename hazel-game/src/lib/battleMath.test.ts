import { describe, it, expect } from 'vitest';
import {
  attackDamage,
  specialDamage,
  enemyAttack,
  defendReduction,
  bossPhase,
  healerMends,
  healerRegen,
  HEALER_REGEN_RATE,
} from './battleMath';

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

  it('a correct answer always makes net progress — no unwinnable stall', () => {
    // Biggest possible healer critter today: moon-moth at level 10 →
    // 60 + 10*13 = 190 max HP. Even the weakest style's landed hit must
    // out-damage its regen, or a kid answering correctly could never win.
    const biggestHealerMaxHp = 60 + 10 * 13;
    expect(healerRegen(biggestHealerMaxHp)).toBeLessThan(attackDamage(true, 'defensive', {}));
  });
});
