import { describe, it, expect } from 'vitest';
import {
  SPIRE_FLOORS,
  SPIRE_INTRO,
  SPIRE_LIVES,
  SPIRE_CLEAR_XP,
  SPIRE_BOSS_DEFEAT,
} from './spire';
import { ALL_TOPICS } from './topics';

describe('Spire climb (#55)', () => {
  it('has an intro, candle-lights, and a clear reward', () => {
    expect(SPIRE_INTRO.length).toBeGreaterThanOrEqual(1);
    for (const line of SPIRE_INTRO) expect(line.length).toBeGreaterThan(10);
    expect(SPIRE_LIVES).toBeGreaterThan(0);
    expect(SPIRE_CLEAR_XP).toBeGreaterThan(0);
    expect(SPIRE_BOSS_DEFEAT.length).toBeGreaterThan(10);
  });

  it('floors escalate in difficulty and end in a single boss floor', () => {
    expect(SPIRE_FLOORS.length).toBeGreaterThanOrEqual(3);
    let prevBonus = -Infinity;
    for (const f of SPIRE_FLOORS) {
      expect(f.levelBonus).toBeGreaterThanOrEqual(prevBonus); // non-decreasing
      prevBonus = f.levelBonus;
      expect(f.questions).toBeGreaterThan(0);
      expect(f.topics.length).toBeGreaterThan(0);
      expect(f.taunt.length).toBeGreaterThan(10);
    }
    const bosses = SPIRE_FLOORS.filter((f) => f.isBoss);
    expect(bosses).toHaveLength(1);
    expect(SPIRE_FLOORS[SPIRE_FLOORS.length - 1].isBoss).toBe(true);
    // The boss floor is the hardest.
    expect(SPIRE_FLOORS[SPIRE_FLOORS.length - 1].levelBonus).toBe(
      Math.max(...SPIRE_FLOORS.map((f) => f.levelBonus)),
    );
  });

  it('every floor draws from real question topics', () => {
    for (const f of SPIRE_FLOORS) {
      for (const t of f.topics) {
        expect(ALL_TOPICS, `${f.name} topic ${t}`).toContain(t);
      }
    }
  });
});
