import { describe, it, expect } from 'vitest';
import { CARD_CHROME, DELIVER_MIN, GUTTER, MIN_MAP, SCALE_LINE, compassSide, fitMap, type FitIn } from './layout';

// The board's room (less its padding) at a few screens, as the game measures it: a split screen's board, a phone's width
// and its height under the header.
const town = { ratio: 1, gutter: GUTTER, under: GUTTER, done: false, clue: 50 };
const world = { ratio: 2, gutter: 0, under: SCALE_LINE, done: false, clue: 50 };
const fit = (o: Partial<FitIn> & Pick<FitIn, 'w' | 'h' | 'screenH'>, kind = town) => fitMap({ split: false, ...kind, ...o });

describe('🐉 where the card goes and how big the map is (code review round 2: untested)', () => {
  it('a desktop: the card beside the map, the map as tall as the board lets it be', () => {
    const f = fit({ w: 868, h: 490, screenH: 800, split: true });
    expect(f).toMatchObject({ beside: true, size: 472, stack: false });
    // The world, two to one: its width.
    expect(fit({ w: 868, h: 490, screenH: 800, split: true }, world).beside).toBe(true);
  });

  it('a phone held upright: the card under the map, the compass beside Deliver', () => {
    const f = fit({ w: 359, h: 593, screenH: 667 });
    expect(f.beside).toBe(false);
    expect(f.narrow).toBe(false);
    expect(f.size).toBeGreaterThanOrEqual(MIN_MAP);
    expect(f.size).toBeLessThanOrEqual(359 - GUTTER);
  });

  it('a phone held sideways (844 × 390, not split): the world’s map takes the width (UX review round 2: 290 px when split)', () => {
    const f = fit({ w: 828, h: 316, screenH: 390 }, world);
    expect(f.beside).toBe(true);
    expect(f.size).toBeGreaterThan(500);
  });

  it('never beside the map in a card too narrow for the compass (code review round 2: at 360 × 400 and 320 × 460 it stuck out)', () => {
    for (const [w, h, screenH, kind] of [
      [344, 326, 400, world],
      [304, 386, 460, town],
      [304, 300, 360, town],
    ] as const) {
      const f = fit({ w, h, screenH }, kind);
      if (f.beside) expect(w - f.size - 8 - kind.gutter, `${w} × ${h}`).toBeGreaterThanOrEqual(compassSide(screenH > 600) + CARD_CHROME);
      // Under the map, the map no wider than the board.
      else expect(f.size + kind.gutter, `${w} × ${h}`).toBeLessThanOrEqual(w);
    }
  });

  it('beside but narrow, Deliver under the compass; under but narrow, over it (code review round 2: at 280 px its word ran into the compass)', () => {
    const narrowBeside = fit({ w: 520, h: 300, screenH: 380 }, world);
    if (narrowBeside.beside) expect(narrowBeside.stack).toBe(520 - narrowBeside.size - 8 < compassSide(false) + 8 + DELIVER_MIN + CARD_CHROME);
    const fold = fit({ w: 264, h: 580, screenH: 653 });
    expect(fold.beside).toBe(false);
    expect(fold.narrow).toBe(true);
  });

  it('the map the same size as a stamp’s card comes, beside it (UX review round 1: at 1366 × 650 it shrank 60 px)', () => {
    const fly = fit({ w: 954, h: 498, screenH: 650, split: true });
    const done = fit({ w: 954, h: 498, screenH: 650, split: true, done: true });
    expect(fly.beside).toBe(true);
    expect(done.size).toBe(fly.size);
  });
});
