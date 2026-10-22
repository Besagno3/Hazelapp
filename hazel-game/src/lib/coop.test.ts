import { describe, it, expect } from 'vitest';
import { CHEER_CHARGE, defenderFor, partnerLevel, partnerPick } from './coop';

describe('👥 co-op rules (#178)', () => {
  it('the players block in turn: the kid playing first', () => {
    expect([0, 1, 2, 3, 4].map(defenderFor)).toEqual([0, 1, 0, 1, 0]);
  });

  it("Player 2's level is eased by the fight's mercy, as the hero's, and stays on the scale", () => {
    expect(partnerLevel(5, 0)).toBe(5);
    expect(partnerLevel(5, 1)).toBe(4);
    expect(partnerLevel(1, 2)).toBe(1);
  });

  it("Player 2 never draws a question the hero's pool holds while theirs has others", () => {
    const q = (id: string) => ({ id });
    const hero = new Set(['a', 'b']);
    // A guest at the kid's own level shares part of the batch: round and round the rest.
    expect([0, 1, 2, 3].map((n) => partnerPick([q('a'), q('x'), q('b'), q('y')], hero, n).id)).toEqual(['x', 'y', 'x', 'y']);
    // All shared (offline starters): half a round out of step with the hero's.
    const six = ['s1', 's2', 's3', 's4', 's5', 's6'];
    expect([0, 1, 2].map((n) => partnerPick(six.map(q), new Set(six), n).id)).toEqual(['s4', 's5', 's6']);
  });

  it('a right cheer adds one ◆', () => {
    expect(CHEER_CHARGE).toBe(1);
  });
});
