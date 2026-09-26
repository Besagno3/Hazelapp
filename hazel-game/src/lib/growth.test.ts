import { describe, it, expect } from 'vitest';
import { challengeLevel, growthSteps, MAX_GROWTH_STEPS, playerStanding } from './growth';
import { ageToStartLevel, DEFAULT_AGE } from './age';

describe('growth', () => {
  it('starts every player at their age baseline', () => {
    expect(growthSteps(1)).toBe(0);
    expect(challengeLevel(8, 1)).toBe(ageToStartLevel(8));
  });

  it('adds a step every 5 player levels, capped', () => {
    expect(growthSteps(5)).toBe(0);
    expect(growthSteps(6)).toBe(1);
    expect(growthSteps(11)).toBe(2);
    expect(growthSteps(500)).toBe(MAX_GROWTH_STEPS);
    expect(challengeLevel(8, 11)).toBe(ageToStartLevel(8) + 2);
  });

  it('getting older raises the baseline on its own', () => {
    expect(challengeLevel(9, 1)).toBeGreaterThan(challengeLevel(8, 1));
  });

  it('stays within the 1–10 question range', () => {
    expect(challengeLevel(4, 1)).toBeGreaterThanOrEqual(1);
    expect(challengeLevel(18, 99)).toBeLessThanOrEqual(10);
  });

  it('reads age from the sign-up birth date and level from XP', () => {
    const now = new Date();
    const s = playerStanding({ birthYear: now.getFullYear() - 8, birthMonth: 1, xp: 550 });
    expect(s).toEqual({ age: 8, level: 6 });
    expect(playerStanding(null)).toEqual({ age: DEFAULT_AGE, level: 1 });
  });
});
