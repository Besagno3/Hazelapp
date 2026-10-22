import { describe, it, expect } from 'vitest';
import { RING_MIN_PX, WANT_PX, ringAt, type Band } from './hit';

// Bands in px (a unit a px), so what's hit reads straight off: a wide ring, a thin one, a medium one, a wide one.
const bands: Band[] = [
  { from: 0, to: 30 },
  { from: 30, to: 38 },
  { from: 38, to: 58 },
  { from: 58, to: 88 },
];
const none = () => false;
const at = (x: number, want: (k: number) => boolean | 'out' = none) => ringAt(x, bands, 1, want, 14);

describe('🌳 which ring a tap is (code review round 2: a table, not one tap)', () => {
  it('nothing wanted: the ring under it — a thin one as wide as RING_MIN_PX, the thinner winning, never past a neighbour’s middle third', () => {
    expect(RING_MIN_PX).toBe(24);
    expect(at(15)).toBe(0);
    expect(at(34)).toBe(1);
    // The thin one reaches 8 px each side — but only 6.7 into the medium one (a third of its 20).
    expect(at(23)).toBe(1);
    expect(at(21)).toBe(0);
    expect(at(44)).toBe(1);
    expect(at(45.5)).toBe(2);
    expect(at(48)).toBe(2);
    expect(at(73)).toBe(3);
  });

  it('a ring the step wants is WANT_PX wide, before any other — “out”: only outward, not back into one counted', () => {
    expect(WANT_PX).toBe(32);
    // The medium ring (20 px) wanted: 6 px each side, so a tap on the thin one's middle is the thin one's (a third of 8).
    expect(at(36, (k) => k === 2)).toBe(2);
    expect(at(33, (k) => k === 2)).toBe(1);
    // The thin one wanted, outward only: past it into the medium, yes; back into the wide one, no.
    expect(at(43, (k) => (k === 1 ? 'out' : false))).toBe(1);
    expect(at(28, (k) => (k === 1 ? 'out' : false))).toBe(0);
    expect(at(28, (k) => k === 1)).toBe(1);
  });

  it('two the same width split at their edge; past the ends, the nearest within reach; nothing far off', () => {
    const even: Band[] = [
      { from: 0, to: 10 },
      { from: 10, to: 20 },
    ];
    expect(ringAt(9.9, even, 1, none, 14)).toBe(0);
    expect(ringAt(10.1, even, 1, none, 14)).toBe(1);
    const inner: Band[] = [{ from: 20, to: 50 }];
    expect(ringAt(10, inner, 1, none, 14)).toBe(0);
    expect(ringAt(4, inner, 1, none, 14)).toBe(null);
    expect(at(100)).toBe(3);
    expect(at(103)).toBe(null);
  });
});
