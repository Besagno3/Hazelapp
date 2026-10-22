import { describe, it, expect } from 'vitest';
import { allAsked, duelScores, duelTurn, duelWinner, otherSeat, withDuelStarters, DUEL_QUESTIONS_EACH, DUEL_TURNS } from './duel';
import type { Question } from '../types';

const q = (id: string): Question => ({ id, topic: 'math', level: 3, text: id, options: ['a', 'b', 'c', 'd'], correctIndex: 0 });

describe('🆚 Quiz Duel rules (#186)', () => {
  it('turns go the kid playing, then Player 2, round and round — five each', () => {
    expect(DUEL_QUESTIONS_EACH).toBe(5);
    expect(DUEL_TURNS).toBe(10);
    const order = Array.from({ length: DUEL_TURNS }, (_, t) => duelTurn(t));
    expect(order.map((o) => o.seat)).toEqual([0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
    expect(order.map((o) => o.number)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(otherSeat(0)).toBe(1);
    expect(otherSeat(1)).toBe(0);
  });

  it('the most right answers wins; the same number is a tie', () => {
    expect(duelScores([[true, false, true], [false, false, true]])).toEqual([2, 1]);
    expect(duelWinner([2, 1])).toBe(0);
    expect(duelWinner([1, 4])).toBe(1);
    expect(duelWinner([3, 3])).toBe('tie');
    expect(duelWinner([0, 0])).toBe('tie');
  });

  it("a starter fills a player's empty slots — never one either player has had", () => {
    const asked: [Question[], Question[]] = [[q('a1')], []];
    const out = withDuelStarters(asked, 1, 1, 'math', 3);
    expect(out[0]).toBe(asked[0]);
    expect(out[1]).toHaveLength(2);
    expect(out[1].every((x) => x.id.startsWith('starter-math-'))).toBe(true);
    // And the next gap, for the kid playing, takes yet another.
    const again = withDuelStarters(out, 0, 1, 'math', 3);
    expect(again[0]).toHaveLength(2);
    const ids = allAsked(again).map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('…and leaves the duel as it is once a question came for the slot', () => {
    const asked: [Question[], Question[]] = [[q('a1')], [q('b1')]];
    expect(withDuelStarters(asked, 1, 0, 'math', 3)).toBe(asked);
  });
});
