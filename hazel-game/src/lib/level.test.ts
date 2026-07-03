import { describe, it, expect } from 'vitest';
import {
  playerLevel,
  xpProgress,
  npcDefeatXp,
  growthPct,
  xpToAdvance,
  totalXpForLevel,
  XP_BASE,
} from './level';

describe('playerLevel', () => {
  it('is level 1 at 0 XP', () => {
    expect(playerLevel(0)).toBe(1);
  });

  it('advances to level 2 after the first level is cleared (XP_BASE)', () => {
    // The first level always costs exactly XP_BASE, unaffected by the curve.
    expect(playerLevel(XP_BASE - 1)).toBe(1);
    expect(playerLevel(XP_BASE)).toBe(2);
  });

  it('never drops below level 1 for negative input', () => {
    expect(playerLevel(-50)).toBe(1);
  });
});

describe('leveling curve', () => {
  it('costs strictly more XP for each successive level', () => {
    expect(xpToAdvance(2)).toBeGreaterThan(xpToAdvance(1));
    expect(xpToAdvance(3)).toBeGreaterThan(xpToAdvance(2));
    expect(xpToAdvance(10)).toBeGreaterThan(xpToAdvance(3));
  });

  it('grows by a larger percentage early and a smaller percentage later', () => {
    expect(growthPct(1)).toBeGreaterThan(growthPct(12));
    // The per-level multiplier itself tapers off.
    const earlyRatio = xpToAdvance(2) / xpToAdvance(1);
    const lateRatio = xpToAdvance(13) / xpToAdvance(12);
    expect(earlyRatio).toBeGreaterThan(lateRatio);
  });

  it('is deterministic / refresh-proof (same level → same threshold)', () => {
    expect(xpToAdvance(7)).toBe(xpToAdvance(7));
    expect(growthPct(4)).toBe(growthPct(4));
    expect(playerLevel(1234)).toBe(playerLevel(1234));
  });

  it('totalXpForLevel is the running sum of xpToAdvance', () => {
    expect(totalXpForLevel(1)).toBe(0);
    expect(totalXpForLevel(2)).toBe(xpToAdvance(1));
    expect(totalXpForLevel(3)).toBe(xpToAdvance(1) + xpToAdvance(2));
  });
});

describe('xpProgress', () => {
  it('reports the current level span, which widens as levels rise', () => {
    const p = xpProgress(XP_BASE); // exactly at the start of level 2
    expect(p.into).toBe(0);
    expect(p.needed).toBe(xpToAdvance(2));
    expect(p.needed).toBeGreaterThan(XP_BASE); // level 2 costs more than level 1
    expect(p.fraction).toBe(0);
  });

  it('stays internally consistent for an arbitrary XP total', () => {
    const xp = 640;
    const level = playerLevel(xp);
    const p = xpProgress(xp);
    expect(totalXpForLevel(level) + p.into).toBe(xp);
    expect(p.into).toBeGreaterThanOrEqual(0);
    expect(p.into).toBeLessThan(p.needed);
    expect(p.fraction).toBeCloseTo(p.into / p.needed);
  });
});

describe('npcDefeatXp', () => {
  it('rewards more for higher-level NPCs', () => {
    expect(npcDefeatXp(8)).toBeGreaterThan(npcDefeatXp(2));
  });
});
