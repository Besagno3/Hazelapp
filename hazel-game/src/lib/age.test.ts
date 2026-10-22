import { describe, it, expect } from 'vitest';
import {
  calcAge,
  ageToStartLevel,
  clampLevel,
  skillLevelFor,
  nextSkillLevel,
  nextSkillLevelFromBattle,
  bankRamp,
  playerAge,
  DEFAULT_AGE,
  MAX_PLAYER_AGE,
  MIN_SKILL_LEVEL,
  MAX_SKILL_LEVEL,
} from './age';
// ?raw: the SQL test's text — its table of ages is checked against calcAge too.
import progressHistoryTest from '../../supabase/ci/progress_history.test.sql?raw';

describe('calcAge', () => {
  it('returns whole years', () => {
    expect(calcAge(2014, 1, new Date('2026-06-15'))).toBe(12);
  });

  it('subtracts a year before the birth month', () => {
    expect(calcAge(2014, 12, new Date('2026-06-15'))).toBe(11);
  });

  it('does not subtract during the birth month', () => {
    expect(calcAge(2014, 6, new Date('2026-06-15'))).toBe(12);
  });

  // A corrected birth date moves each topic start's age by the change in the
  // kid's age today, worked out by the database (0026's kid_age_on, #183):
  // the cases its SQL test checks it with, read from that test, give the same
  // ages here — so the server's age and the app's can't drift apart.
  it("agrees with the database's kid_age_on on the cases its test checks (#183)", () => {
    const block = progressHistoryTest.match(/from \(values -- age cases\n([\s\S]*?)\) as cases/)?.[1] ?? '';
    const cases = [...block.matchAll(/\((\d{4}), (\d{1,2}), '(\d{4})-(\d{2})-(\d{2})', (\d+)\)/g)].map((m) => m.slice(1).map(Number));
    expect(cases.length).toBeGreaterThanOrEqual(10);
    for (const [year, month, y, m, d, age] of cases) {
      // The day on this device's calendar, as the app's `new Date()` is.
      expect(calcAge(year, month, new Date(y, m - 1, d)), `born ${year}-${month}, on ${y}-${m}-${d}`).toBe(age);
    }
  });
});

describe('playerAge', () => {
  it('is the age from the birth date, capped at 18 (#156)', () => {
    const now = new Date().getFullYear();
    expect(MAX_PLAYER_AGE).toBe(18);
    expect(playerAge({ birthYear: now - 6, birthMonth: 1 })).toBe(6);
    expect(playerAge({ birthYear: now - 18, birthMonth: 1 })).toBe(18);
    expect(playerAge({ birthYear: now - 25, birthMonth: 1 })).toBe(18);
    expect(playerAge(null)).toBe(DEFAULT_AGE);
  });
});

describe('clampLevel', () => {
  it('clamps below the minimum', () => {
    expect(clampLevel(-3)).toBe(MIN_SKILL_LEVEL);
  });

  it('clamps above the maximum', () => {
    expect(clampLevel(99)).toBe(MAX_SKILL_LEVEL);
  });
});

describe('ageToStartLevel', () => {
  it('starts young children near the minimum', () => {
    expect(ageToStartLevel(6)).toBe(1);
  });

  it('rises one a year, then teens start mid-range, not at the hardest (#156)', () => {
    expect(ageToStartLevel(9)).toBe(4);
    expect(ageToStartLevel(11)).toBe(6);
    expect(ageToStartLevel(13)).toBe(6);
    expect(ageToStartLevel(18)).toBe(6);
  });
});

describe('skillLevelFor', () => {
  it('uses the stored level when present', () => {
    expect(skillLevelFor({ math: 7 }, 'math', 10)).toBe(7);
  });

  it('falls back to the age start level when unset', () => {
    expect(skillLevelFor({}, 'science', 10)).toBe(ageToStartLevel(10));
  });
});

describe('nextSkillLevel', () => {
  it('raises by 2 on a flawless run', () => {
    expect(nextSkillLevel(5, [true, true, true, true, true])).toBe(7);
  });

  it('raises by 1 on a strong consecutive run', () => {
    expect(nextSkillLevel(5, [true, true, true, false, true])).toBe(6);
  });

  it('lowers by at most 1 on a weak round', () => {
    expect(nextSkillLevel(5, [false, false, false, false, true])).toBe(4);
  });

  it('stays clamped within range', () => {
    expect(nextSkillLevel(MAX_SKILL_LEVEL, [true, true, true, true, true])).toBe(MAX_SKILL_LEVEL);
    expect(nextSkillLevel(MIN_SKILL_LEVEL, [false, false, false, false, false])).toBe(
      MIN_SKILL_LEVEL,
    );
  });
});

describe('nextSkillLevelFromBattle', () => {
  it('matches nextSkillLevel when the player performed well', () => {
    expect(nextSkillLevelFromBattle(5, [true, true, true, true, true])).toBe(
      nextSkillLevel(5, [true, true, true, true, true]),
    );
  });

  it('never lowers the skill — a weak battle holds steady', () => {
    expect(nextSkillLevelFromBattle(5, [false, false, false, false, false])).toBe(5);
  });

  it('still respects the [1, 10] clamp on raises', () => {
    expect(
      nextSkillLevelFromBattle(MAX_SKILL_LEVEL, [true, true, true, true, true]),
    ).toBe(MAX_SKILL_LEVEL);
  });
});

describe('bankRamp — what a level change rests on (#153 review round 2)', () => {
  it('the bank answers, when they are most of the round', () => {
    expect(bankRamp([true, true, true], 5)).toEqual([true, true, true]);
    expect(bankRamp([true, false], 2)).toEqual([true, false]);
  });

  it('none, when starter questions were half the round or more — one or two bank answers are too few to judge', () => {
    expect(bankRamp([false], 5)).toEqual([]);
    expect(bankRamp([true, true], 4)).toEqual([]);
    expect(bankRamp([], 5)).toEqual([]);
    // So a round passed 4 of 5 never drops on its one bank question…
    expect(nextSkillLevel(4, bankRamp([false], 5))).toBe(4);
    // …and a round failed 1 of 5 never climbs two on it.
    expect(nextSkillLevel(4, bankRamp([true], 5))).toBe(4);
  });
});
