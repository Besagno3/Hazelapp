import { describe, it, expect } from 'vitest';
import { playerLevel, xpProgress, npcDefeatXp, xpForLevel, xpToReachLevel } from './level';

describe('playerLevel', () => {
  it('is level 1 at 0 XP', () => {
    expect(playerLevel(0)).toBe(1);
  });

  it('needs proportionally more XP for each level (100, 200, 300, …)', () => {
    expect(playerLevel(99)).toBe(1);
    expect(playerLevel(100)).toBe(2);
    expect(playerLevel(299)).toBe(2);
    expect(playerLevel(300)).toBe(3);
    expect(playerLevel(599)).toBe(3);
    expect(playerLevel(600)).toBe(4);
  });

  it('never drops below level 1 for negative input', () => {
    expect(playerLevel(-50)).toBe(1);
  });
});

describe('xpProgress', () => {
  it('reports progress within the current level', () => {
    const p = xpProgress(200);
    expect(p.into).toBe(100);
    expect(p.needed).toBe(200);
    expect(p.fraction).toBeCloseTo(0.5);
  });

  it('starts each level at zero with that level\'s requirement', () => {
    expect(xpProgress(0)).toEqual({ into: 0, needed: 100, fraction: 0 });
    expect(xpProgress(600)).toEqual({ into: 0, needed: 400, fraction: 0 });
  });
});

describe('level curve', () => {
  it('grows the per-level requirement with each level', () => {
    for (let l = 1; l < 20; l++) {
      expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
      expect(xpToReachLevel(l + 1) - xpToReachLevel(l)).toBe(xpForLevel(l));
    }
  });
});

describe('npcDefeatXp', () => {
  it('rewards more for higher-level NPCs', () => {
    expect(npcDefeatXp(8)).toBeGreaterThan(npcDefeatXp(2));
  });
});
