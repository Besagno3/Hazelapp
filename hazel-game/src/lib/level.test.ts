import { describe, it, expect } from 'vitest';
import { furthestLevel, gainXp, levelState, npcDefeatXp, xpForLevel, xpProgress } from './level';

describe('xpForLevel', () => {
  it('starts at 100 and climbs gently, 25 more each level', () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBe(125);
    expect(xpForLevel(3)).toBe(150);
    expect(xpForLevel(10)).toBe(325);
  });

  it('keeps climbing as levels scale', () => {
    for (let l = 1; l < 100; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
  });
});

describe('levelState', () => {
  it('is level 1 with no profile', () => {
    expect(levelState(null)).toEqual({ level: 1, levelXp: 0 });
  });

  it('uses the saved level', () => {
    expect(levelState({ xp: 5000, level: 4, levelXp: 30 })).toEqual({ level: 4, levelXp: 30 });
  });

  it('keeps the old flat-100 level for a profile saved before levels were stored', () => {
    expect(levelState({ xp: 0 })).toEqual({ level: 1, levelXp: 0 });
    expect(levelState({ xp: 250 })).toEqual({ level: 3, levelXp: 50 });
    expect(levelState({ xp: 1000 })).toEqual({ level: 11, levelXp: 0 });
  });

  it('never drops below level 1 for negative input', () => {
    expect(levelState({ xp: -50 })).toEqual({ level: 1, levelXp: 0 });
  });
});

describe('gainXp', () => {
  it('fills the current level without leveling up', () => {
    expect(gainXp({ level: 1, levelXp: 0 }, 99)).toEqual({ level: 1, levelXp: 99 });
  });

  it('levels up and carries the extra XP over', () => {
    expect(gainXp({ level: 1, levelXp: 90 }, 30)).toEqual({ level: 2, levelXp: 20 });
  });

  it('clears several levels in one go', () => {
    // 100 (L1) + 125 (L2) + 150 (L3) = 375 → level 4 with 5 left over
    expect(gainXp({ level: 1, levelXp: 0 }, 380)).toEqual({ level: 4, levelXp: 5 });
  });

  it('never lowers a saved level', () => {
    expect(gainXp({ level: 11, levelXp: 0 }, 10)).toEqual({ level: 11, levelXp: 10 });
  });
});

describe('furthestLevel', () => {
  it('prefers the higher level, then the more XP into it', () => {
    expect(furthestLevel({ level: 3, levelXp: 0 }, { level: 2, levelXp: 120 })).toEqual({ level: 3, levelXp: 0 });
    expect(furthestLevel({ level: 3, levelXp: 10 }, { level: 3, levelXp: 40 })).toEqual({ level: 3, levelXp: 40 });
  });
});

describe('xpProgress', () => {
  it('reports progress within the current level', () => {
    const p = xpProgress({ level: 2, levelXp: 50 });
    expect(p.into).toBe(50);
    expect(p.needed).toBe(125);
    expect(p.fraction).toBeCloseTo(0.4);
  });
});

describe('npcDefeatXp', () => {
  it('rewards more for higher-level NPCs', () => {
    expect(npcDefeatXp(8)).toBeGreaterThan(npcDefeatXp(2));
  });
});
