import { describe, it, expect } from 'vitest';
import {
  attackBonus,
  defenseBonus,
  hpBonus,
  xpBonusPerCorrect,
  totalPowerUps,
  effectiveStacks,
  choicesForLevel,
  POWER_UPS,
} from './powerups';

describe('power-up bonuses', () => {
  it('are zero with no power-ups', () => {
    expect(attackBonus({})).toBe(0);
    expect(defenseBonus({})).toBe(0);
    expect(hpBonus({})).toBe(0);
    expect(xpBonusPerCorrect({})).toBe(0);
  });

  it('scale linearly through the first 5 stacks', () => {
    expect(attackBonus({ attack: 3 })).toBe(attackBonus({ attack: 1 }) * 3);
    expect(hpBonus({ vitality: 2 })).toBeGreaterThan(hpBonus({ vitality: 1 }));
  });
});

describe('totalPowerUps', () => {
  it('sums every stack', () => {
    expect(totalPowerUps({ attack: 2, scholar: 1, vitality: 1 })).toBe(4);
  });

  it('is zero for an empty set', () => {
    expect(totalPowerUps({})).toBe(0);
  });
});

// #27 — diminishing returns past 5 stacks.
describe('effectiveStacks', () => {
  it('is identity for stacks 0-5', () => {
    for (let s = 0; s <= 5; s++) {
      expect(effectiveStacks(s)).toBe(s);
    }
  });

  it('adds half a stack per real stack between 6 and 10', () => {
    expect(effectiveStacks(6)).toBe(5.5);
    expect(effectiveStacks(10)).toBe(7.5);
  });

  it('adds a quarter stack per real stack past 10', () => {
    expect(effectiveStacks(11)).toBe(7.75);
    expect(effectiveStacks(20)).toBe(10);
  });

  it('still rises monotonically far past the soft cap', () => {
    expect(effectiveStacks(50)).toBeGreaterThan(effectiveStacks(20));
  });
});

describe('bonus soft-cap kicks in past 5 stacks', () => {
  it('attack(5) = 30, attack(10) is less than linear 60', () => {
    expect(attackBonus({ attack: 5 })).toBe(30);
    expect(attackBonus({ attack: 10 })).toBeLessThan(60);
    expect(attackBonus({ attack: 10 })).toBeGreaterThan(30);
  });

  it('vitality(20) is far less than linear 500', () => {
    expect(hpBonus({ vitality: 20 })).toBeLessThan(500);
  });
});

// #27 — 2-of-4 random offer per level-up.
describe('choicesForLevel', () => {
  it('returns the requested count of power-ups', () => {
    expect(choicesForLevel(2, 2)).toHaveLength(2);
    expect(choicesForLevel(2, 3)).toHaveLength(3);
  });

  it('only returns power-ups from the catalogue', () => {
    const ids = new Set(POWER_UPS.map((pu) => pu.id));
    for (const pu of choicesForLevel(7, 2)) {
      expect(ids.has(pu.id)).toBe(true);
    }
  });

  it('is deterministic per level (no reroll by refresh)', () => {
    const a = choicesForLevel(5, 2).map((p) => p.id);
    const b = choicesForLevel(5, 2).map((p) => p.id);
    expect(a).toEqual(b);
  });

  it('rotates the offer across consecutive levels', () => {
    // Across 8 consecutive level-ups we should hit at least 3 distinct power-ups.
    const seen = new Set<string>();
    for (let l = 2; l <= 9; l++) {
      for (const pu of choicesForLevel(l, 2)) seen.add(pu.id);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});
