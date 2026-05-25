import { describe, it, expect } from 'vitest';
import { FUN_FACTS, GENERIC_FACTS, pickFact } from './funFacts';

describe('FUN_FACTS', () => {
  it('has multiple facts for every topic', () => {
    for (const topic of Object.keys(FUN_FACTS) as (keyof typeof FUN_FACTS)[]) {
      expect(FUN_FACTS[topic].length).toBeGreaterThanOrEqual(3);
    }
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
