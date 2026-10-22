import { describe, it, expect } from 'vitest';
import {
  CUTS,
  ORDERS_PER_ROUND,
  REGULARS,
  REGULAR_IDS,
  SLICE,
  add,
  amountWords,
  askedWords,
  boxWords,
  check,
  compare,
  cutHint,
  cutMakes,
  learnedLine,
  morningQueue,
  numberWords,
  orderFor,
  piesFor,
  simplify,
  slicesWords,
  verdictWords,
} from './bakery';
import { BANDS } from '../../content/minigames';
import { MINIGAMES } from '../../content/minigames';
import { NPC_DEFS } from '../../content/npcs';

const A = (n: number, d: number) => ({ n, d });

describe('amounts of pie (docs/DESIGN-MINIGAMES.md §5.2)', () => {
  it('simplify, compare and add', () => {
    expect(simplify(A(2, 4))).toEqual(A(1, 2));
    expect(simplify(A(6, 4))).toEqual(A(3, 2));
    expect(compare(A(2, 4), A(1, 2))).toBe(0);
    expect(compare(A(1, 3), A(1, 2))).toBeLessThan(0);
    expect(add(A(1, 2), A(1, 4))).toEqual(A(3, 4));
    expect(add(A(1, 3), A(1, 6))).toEqual(A(1, 2));
  });

  it('in a kid’s words', () => {
    expect(amountWords(A(1, 2))).toBe('half a pie');
    expect(amountWords(A(2, 4))).toBe('half a pie');
    expect(amountWords(A(1, 4))).toBe('a quarter of a pie');
    expect(amountWords(A(3, 4))).toBe('three quarters of a pie');
    expect(amountWords(A(1, 1))).toBe('a whole pie');
    expect(amountWords(A(2, 1))).toBe('two whole pies');
    expect(amountWords(A(3, 2))).toBe('one and a half pies');
    expect(amountWords(A(5, 4))).toBe('one and a quarter pies');
    expect(amountWords(A(2, 3))).toBe('two thirds of a pie');
    expect(amountWords(A(5, 8))).toBe('five eighths of a pie');
  });

  it('as a number on Tricky', () => {
    expect(numberWords(A(3, 4), 'percent')).toBe('75% of a pie');
    expect(numberWords(A(1, 4), 'decimal')).toBe('0.25 of a pie');
    expect(numberWords(A(3, 2), 'decimal')).toBe('1.5 pies');
    expect(numberWords(A(1, 1), 'decimal')).toBe('1 pie');
  });

  it('slices by their cut, never simplified', () => {
    expect(slicesWords(2, 4)).toBe('two quarters');
    expect(slicesWords(1, 2)).toBe('one half');
    expect(slicesWords(0, 8)).toBe('no slices');
    for (const band of BANDS) for (const cut of CUTS[band]) expect(SLICE[cut], `${cut}`).toBeDefined();
    // Gentle cuts in halves and quarters only.
    expect(CUTS.gentle).toEqual([2, 4]);
  });

  it('enough pies on the board, at least one', () => {
    expect(piesFor(A(1, 2))).toBe(1);
    expect(piesFor(A(1, 1))).toBe(1);
    expect(piesFor(A(3, 2))).toBe(2);
    expect(piesFor(A(5, 4))).toBe(2);
  });
});

describe('orders', () => {
  it('every order at every band can be boxed with that band’s cuts, on at most two pies', () => {
    for (const band of BANDS) {
      for (let round = 0; round < 30; round++) {
        for (let i = 0; i < ORDERS_PER_ROUND; i++) {
          const o = orderFor(band, round, i);
          expect(CUTS[band].some((c) => cutMakes(c, o.amount)), `${band} ${round}.${i}`).toBe(true);
          expect(piesFor(o.amount)).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('Gentle orders halves and quarters only; Medium thirds, sixths, eighths and more than a pie', () => {
    const gentle = Array.from({ length: 21 }, (_, k) => orderFor('gentle', Math.floor(k / 3), k % 3));
    expect(gentle.every((o) => [1, 2, 4].includes(simplify(o.amount).d))).toBe(true);
    const medium = Array.from({ length: 24 }, (_, k) => orderFor('medium', Math.floor(k / 3), k % 3));
    const ds = new Set(medium.map((o) => simplify(o.amount).d));
    for (const d of [3, 6, 8]) expect(ds.has(d), `${d}`).toBe(true);
    expect(medium.some((o) => o.amount.n > o.amount.d)).toBe(true);
  });

  it('Tricky asks in percentages and decimals, and boxes two people’s orders together', () => {
    const tricky = Array.from({ length: 24 }, (_, k) => orderFor('tricky', Math.floor(k / 3), k % 3));
    expect(tricky.some((o) => /\d%/.test(o.words) && o.asNumber)).toBe(true);
    expect(tricky.some((o) => /\d\.\d/.test(o.words) && o.asNumber)).toBe(true);
    const shared = tricky.filter((o) => o.with);
    expect(shared.length).toBeGreaterThan(0);
    for (const o of shared) {
      expect(o.with!.regular).not.toBe(o.regular);
      expect(compare(add(o.with!.mine, o.with!.amount), o.amount)).toBe(0);
      expect(o.words).toContain('in one box');
    }
    expect(orderFor('gentle', 0, 0).with).toBeUndefined();
  });

  it('three mornings meet all eight regulars, each a real villager', () => {
    for (const band of BANDS) {
      const met = new Set(Array.from({ length: 9 }, (_, k) => orderFor(band, Math.floor(k / 3), k % 3).regular));
      expect(met.size).toBe(REGULAR_IDS.length);
    }
    expect(MINIGAMES['dots-bakery'].pages).toBe(REGULARS.length);
    for (const r of REGULARS) expect(NPC_DEFS[r.npc], r.npc).toBeDefined();
  });

  it('a morning brings regulars not in the book yet first, so one morning a visit still fills it (review round 1)', () => {
    const none = () => false;
    expect(morningQueue(none, 0).slice(0, 3)).toEqual(['wick', 'sol', 'marigold']);
    expect(morningQueue(none, 1).slice(0, 3)).toEqual(['rook', 'nib', 'pip']);
    const met = new Set<string>(['wick', 'sol', 'marigold']);
    const q = morningQueue((id) => met.has(id), 0);
    expect(q.slice(0, 3)).toEqual(['rook', 'nib', 'pip']);
    expect(new Set(q).size).toBe(REGULAR_IDS.length);
    // Visit after visit, each first morning fills three more pages until the book is whole.
    for (let visit = 0; visit < 3; visit++) for (const id of morningQueue((id) => met.has(id), 0).slice(0, 3)) met.add(id);
    expect(met.size).toBe(REGULAR_IDS.length);
    // Who asks follows the queue; what's asked still goes by the slot.
    const o = orderFor('tricky', 0, 1, q);
    expect(o.regular).toBe('nib');
    expect(o.amount).toEqual(orderFor('tricky', 0, 1).amount);
    expect(o.with!.regular).not.toBe('nib');
  });
});

describe('the box', () => {
  const order = orderFor('gentle', 0, 2); // three quarters of a pie

  it('right, too little or too much — any cut that makes it is right', () => {
    expect(order.amount).toEqual(A(3, 4));
    expect(check(3, 4, order)).toBe('right');
    expect(check(1, 2, order)).toBe('too-little');
    expect(check(4, 4, order)).toBe('too-much');
    expect(check(6, 8, order)).toBe('right');
  });

  it('is said back in words, not scolded', () => {
    expect(boxWords(0, 4)).toBe('The box is empty.');
    expect(boxWords(3, 4)).toBe('Three quarters of a pie.');
    expect(boxWords(2, 4)).toBe('Two quarters — that’s half a pie.');
    expect(boxWords(4, 4)).toBe('Four quarters — that’s a whole pie.');
    expect(boxWords(5, 4)).toBe('Five quarters — that’s one and a quarter pies.');
    expect(verdictWords(3, 4, order)).toBe('Just right!');
    expect(verdictWords(2, 4, order)).toBe('A little more — the order is three quarters of a pie.');
    expect(verdictWords(4, 4, order)).toBe('A little less — the order is three quarters of a pie.');
  });

  it('on Tricky, never works the order out for the kid: a number stays a number, a shared order two shares (review round 1)', () => {
    const percent = orderFor('tricky', 0, 0); // 75% of a pie
    expect(askedWords(percent)).toBe('75% of a pie');
    expect(cutHint(2, percent)).toBe('Halves can’t make 75% of a pie exactly. Try another cut!');
    expect(verdictWords(2, 4, percent)).toBe('A little more — the order is 75% of a pie.');
    const shared = orderFor('tricky', 0, 1); // half and a quarter
    expect(askedWords(shared)).toBe('half a pie and a quarter of a pie');
    expect(verdictWords(4, 4, shared)).toBe('A little less — the order is half a pie and a quarter of a pie.');
    expect(askedWords(orderFor('gentle', 0, 0))).toBe('half a pie');
  });

  it('a cut that can’t make the order says so', () => {
    const third = orderFor('medium', 1, 2); // one third
    expect(third.amount).toEqual(A(1, 3));
    expect(cutHint(4, third)).toBe('Quarters can’t make a third of a pie exactly. Try another cut!');
    expect(cutHint(6, third)).toBeNull();
  });

  it('what a right box teaches', () => {
    expect(learnedLine(2, 4, orderFor('gentle', 0, 0))).toBe('Two quarters is the same as half a pie.');
    expect(learnedLine(3, 4, order)).toBe('Three quarters of a pie: cut a pie into four equal slices and take three.');
    expect(learnedLine(3, 4, orderFor('tricky', 0, 0))).toBe('75% of a pie is three quarters of a pie.');
    expect(learnedLine(3, 4, orderFor('tricky', 0, 1))).toBe('Half a pie and a quarter of a pie make three quarters of a pie.');
    // More than a pie: never "cut a pie into two and take three" (review round 1).
    const oneAndAHalf = orderFor('medium', 1, 0);
    expect(oneAndAHalf.amount).toEqual(A(3, 2));
    expect(learnedLine(3, 2, oneAndAHalf)).toBe('Three halves is the same as one and a half pies.');
    expect(learnedLine(6, 4, oneAndAHalf)).toBe('Six quarters is the same as one and a half pies.');
    expect(learnedLine(5, 4, orderFor('medium', 2, 0))).toBe('Five quarters is the same as one and a quarter pies.');
  });
});
