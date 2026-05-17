import { describe, it, expect } from 'vitest';
import { attackBonus, defenseBonus, hpBonus, xpBonusPerCorrect, totalPowerUps } from './powerups';

describe('power-up bonuses', () => {
  it('are zero with no power-ups', () => {
    expect(attackBonus({})).toBe(0);
    expect(defenseBonus({})).toBe(0);
    expect(hpBonus({})).toBe(0);
    expect(xpBonusPerCorrect({})).toBe(0);
  });

  it('scale with the number of stacks', () => {
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
