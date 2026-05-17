import { describe, it, expect } from 'vitest';
import { generateNpcs } from './npc';

const TOPICS = ['math', 'science', 'engineering', 'creativity'];

describe('generateNpcs', () => {
  it('produces the requested number of NPCs', () => {
    expect(generateNpcs(10, 4)).toHaveLength(4);
  });

  it('gives every NPC a valid level (1-10), topic, and positive HP', () => {
    for (const npc of generateNpcs(8, 4)) {
      expect(npc.level).toBeGreaterThanOrEqual(1);
      expect(npc.level).toBeLessThanOrEqual(10);
      expect(TOPICS).toContain(npc.topic);
      expect(npc.maxHp).toBeGreaterThan(0);
    }
  });

  it('scales NPC level with the player age', () => {
    const avgLevel = (age: number) => {
      const sample = Array.from({ length: 40 }, () => generateNpcs(age, 4)).flat();
      return sample.reduce((sum, n) => sum + n.level, 0) / sample.length;
    };
    expect(avgLevel(6)).toBeLessThan(avgLevel(15));
  });
});
