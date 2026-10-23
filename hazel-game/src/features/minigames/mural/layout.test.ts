import { describe, it, expect } from 'vitest';
import { BESIDE_PX, FLOOR_PX, controlsHeight, fitCanvas, type Controls } from './layout';

// How Mirror Mural's canvas fits (review rounds 1 and 2). Sizes as the bench measured the space at each screen.
const gentle: Controls = { paints: 2, pairs: false, free: false };
const pairs: Controls = { paints: 6, pairs: true, free: false };
const free: Controls = { paints: 8, pairs: false, free: true };

describe('how tall the paints and the mirror stand', () => {
  it('a row of paints, the mirror and its shadow; more rows as they wrap', () => {
    expect(controlsHeight(gentle, 352, false, true)).toBe(44 + 8 + 56 + 4);
    // Nine compact paints three across, Hang it over Not this time beside the canvas.
    expect(controlsHeight(free, BESIDE_PX, true, true)).toBe(3 * 44 + 2 * 6 + 8 + 56 + 8 + 44 + 4);
    // Opposite pairs one a row in the narrow column, Rub out on its own, with the caption.
    expect(controlsHeight(pairs, BESIDE_PX, true, true)).toBe(18 + 8 + 4 * 44 + 3 * 6 + 8 + 56 + 4);
    // Under the canvas the free canvas's two buttons share a row.
    expect(controlsHeight(free, 400, true, false)).toBe(2 * 44 + 6 + 8 + 56 + 4);
    expect(controlsHeight(free, 600, true, false)).toBe(44 + 8 + 56 + 4);
  });
});

describe('the canvas’s fit', () => {
  it('beside the paints where that leaves it bigger (a desktop), under them where that does (a tablet)', () => {
    const desk = fitCanvas({ w: 868, h: 437, heading: 40, short: false }, pairs);
    expect(desk).toEqual({ size: 397, beside: true, compact: false, tight: false });
    const tablet = fitCanvas({ w: 436, h: 620, heading: 40, short: false }, gentle);
    expect(tablet.beside).toBe(false);
    expect(tablet.size).toBe(436);
  });

  it('the tablet’s free canvas: compact paints save a row, so it stays big (review round 2: it shrank to 52 px squares)', () => {
    const fit = fitCanvas({ w: 436, h: 620, heading: 40, short: false }, free);
    expect(fit).toMatchObject({ beside: false, compact: true });
    expect(fit.size).toBeGreaterThan(400);
  });

  it('beside only if the paints fit the column’s height — compact ones, if full-size ones don’t', () => {
    expect(fitCanvas({ w: 520, h: 300, heading: 40, short: false }, free)).toMatchObject({ beside: true, compact: true });
    expect(fitCanvas({ w: 520, h: 250, heading: 40, short: false }, free).beside).toBe(false);
  });

  it('a short screen: compact paints, beside the canvas when that leaves it bigger', () => {
    expect(fitCanvas({ w: 464, h: 288, heading: 0, short: true }, gentle)).toEqual({ size: 272, beside: true, compact: true, tight: false });
    expect(fitCanvas({ w: 464, h: 288, heading: 0, short: true }, pairs)).toMatchObject({ size: 272, beside: true });
  });

  it('200% zoom (640×400): under it beats beside — and never under the floor', () => {
    const fit = fitCanvas({ w: 364, h: 328, heading: 0, short: true }, gentle);
    expect(fit).toMatchObject({ beside: false, tight: false });
    expect(fit.size).toBeGreaterThanOrEqual(FLOOR_PX);
  });

  it('too small to tap well (review round 2: 640×560 stretched the canvas over its mirror): the floor, under, and it scrolls', () => {
    expect(fitCanvas({ w: 308, h: 260, heading: 40, short: false }, gentle)).toEqual({ size: FLOOR_PX, beside: false, compact: true, tight: true });
    expect(fitCanvas({ w: 368, h: 254, heading: 40, short: false }, pairs).tight).toBe(true);
  });

  it('Expert’s axis numbers come out of the canvas’s size, not its squares (PR 14: 640×505 fitted 23 px squares)', () => {
    const expert = { ...gentle, axes: 16 };
    const space = { w: 308, h: 330, heading: 40, short: false };
    expect(fitCanvas(space, gentle).tight).toBe(false);
    expect(fitCanvas(space, expert)).toEqual({ size: FLOOR_PX + 16, beside: false, compact: true, tight: true });
    // Room enough: the same fit as without them.
    expect(fitCanvas({ w: 900, h: 600, heading: 40, short: false }, expert)).toEqual(fitCanvas({ w: 900, h: 600, heading: 40, short: false }, gentle));
  });
});

describe('a laptop at 1024×600', () => {
  it('beside the canvas: full-size paints where they fit the column (a picture, the free canvas), compact where they don’t (the pairs)', () => {
    const space = { w: 612, h: 286, heading: 40, short: false };
    expect(fitCanvas(space, gentle)).toEqual({ size: 246, beside: true, compact: false, tight: false });
    expect(fitCanvas(space, free)).toEqual({ size: 246, beside: true, compact: false, tight: false });
    expect(fitCanvas(space, pairs)).toEqual({ size: 246, beside: true, compact: true, tight: false });
  });
});
