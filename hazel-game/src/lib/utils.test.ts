import { describe, it, expect } from 'vitest';
import { calcAttackDamage, cn, PASS_THRESHOLD, ROUNDS_TO_UNLOCK } from './utils';

describe('calcAttackDamage', () => {
  it('returns the full base when all answers are correct', () => {
    expect(calcAttackDamage(3, 3, 30)).toBe(30);
  });

  it('returns 0 when no answers are correct', () => {
    expect(calcAttackDamage(0, 3, 30)).toBe(0);
  });

  it('rounds a partial result', () => {
    expect(calcAttackDamage(2, 3, 30)).toBe(20); // 30 * 2/3
  });
});

describe('cn', () => {
  it('merges conflicting Tailwind classes, last wins', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, 'b')).toBe('a b');
  });
});

describe('round constants', () => {
  it('pass threshold is reachable with 4 of 5 but not 3 of 5', () => {
    expect(4 / 5).toBeGreaterThanOrEqual(PASS_THRESHOLD);
    expect(3 / 5).toBeLessThan(PASS_THRESHOLD);
  });

  it('the world unlocks after three rounds', () => {
    expect(ROUNDS_TO_UNLOCK).toBe(3);
  });
});
