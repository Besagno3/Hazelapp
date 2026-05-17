import { describe, it, expect } from 'vitest';
import { playerLevel, xpProgress, npcDefeatXp } from './level';

describe('playerLevel', () => {
  it('is level 1 at 0 XP', () => {
    expect(playerLevel(0)).toBe(1);
  });

  it('advances every 100 XP', () => {
    expect(playerLevel(99)).toBe(1);
    expect(playerLevel(100)).toBe(2);
    expect(playerLevel(250)).toBe(3);
  });

  it('never drops below level 1 for negative input', () => {
    expect(playerLevel(-50)).toBe(1);
  });
});

describe('xpProgress', () => {
  it('reports progress within the current level', () => {
    const p = xpProgress(150);
    expect(p.into).toBe(50);
    expect(p.needed).toBe(100);
    expect(p.fraction).toBeCloseTo(0.5);
  });
});

describe('npcDefeatXp', () => {
  it('rewards more for higher-level NPCs', () => {
    expect(npcDefeatXp(8)).toBeGreaterThan(npcDefeatXp(2));
  });
});
