import { describe, it, expect } from 'vitest';
import { FUN_FACTS, GENERIC_FACTS, pickFact } from './funFacts';

describe('FUN_FACTS', () => {
  it('has multiple facts for every topic', () => {
    for (const topic of Object.keys(FUN_FACTS) as (keyof typeof FUN_FACTS)[]) {
      expect(FUN_FACTS[topic].length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('FUN_FACTS — plain words for a 7-year-old (#163 review round 2)', () => {
  it('no decimal percentages, and none of the words that were pitched too old', () => {
    for (const fact of [...Object.values(FUN_FACTS).flat(), ...GENERIC_FACTS]) {
      expect(fact).not.toMatch(/\d\.\d+%/);
      expect(fact).not.toMatch(/asylum|factors|older to|slow microwaves/i);
    }
  });

  it('the rewritten ones say it simply', () => {
    expect(FUN_FACTS.history[0]).toBe('Did you know? The Great Pyramid was already over 2,000 years old when Cleopatra was born!');
    expect(FUN_FACTS.engineering[0]).toMatch(/same kind of invisible waves as a microwave oven — just much, much weaker/);
    expect(FUN_FACTS.creativity[0]).toMatch(/hospital window/);
  });
});

describe('pickFact', () => {
  it('returns a fact from the topic pool when a topic is given', () => {
    const fact = pickFact('math', 0);
    expect(FUN_FACTS.math).toContain(fact);
  });

  it('returns a generic fact when no topic is given', () => {
    const fact = pickFact(undefined, 0);
    expect(GENERIC_FACTS).toContain(fact);
  });

  it('is deterministic for a given seed', () => {
    expect(pickFact('science', 0.42)).toBe(pickFact('science', 0.42));
  });
});
