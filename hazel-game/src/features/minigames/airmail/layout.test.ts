import { describe, it, expect } from 'vitest';
import { CARD_CHROME, DELIVER_MIN, GLOBE_LAT_ROWS, GUTTER, MIN_MAP, SCALE_LINE, compassSide, fitMap, globeLabels, globeLongCols, latLabel, type FitIn } from './layout';

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

describe('🐉 Expert’s map labels, by a square’s size (code review rounds 1 and 2: untested in jsdom; UX review rounds 1 and 2)', () => {
  const cols = (cell: number | null) => globeLongCols(cell).map((c) => c.text);
  it('longitudes every 30° wherever a number fits, with E and W from 24 px — under that bare but for the two by 0°; every 60° under 12 px', () => {
    expect(cols(28)).toEqual(['180°', '150°W', '120°W', '90°W', '60°W', '30°W', '0°', '30°E', '60°E', '90°E', '120°E', '150°E', '180°']);
    expect(cols(18)).toEqual(['180', '150', '120', '90', '60', '30W', '0°', '30E', '60', '90', '120', '150', '180']);
    // The ends dropped where they'd touch the 150s.
    expect(cols(16)).toEqual(['150', '120', '90', '60', '30W', '0°', '30E', '60', '90', '120', '150']);
    expect(cols(10)).toEqual(['120', '60W', '0°', '60E', '120']);
    // Before the map's measured: in full.
    expect(cols(null)).toEqual(cols(28));
    expect(globeLongCols(28).map((c) => c.col)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]);
  });
  it('each threshold where it is: names from 14 px, 30° from 12, the ends from 18, letters on all from 24 (code review round 2: the bench sizes either side)', () => {
    expect([10, 13, 14, 30, null].map((c) => globeLabels(c).named)).toEqual([false, false, true, true, true]);
    expect([11, 12].map((c) => globeLabels(c).longStep)).toEqual([4, 2]);
    expect([17, 18].map((c) => globeLabels(c).ends)).toEqual([false, true]);
    expect([23, 24].map((c) => globeLabels(c).bare)).toEqual([true, false]);
  });
  it('the latitudes every 30°, the equator 0°', () => {
    expect(GLOBE_LAT_ROWS.map(latLabel)).toEqual(['60°N', '30°N', '0°', '30°S', '60°S']);
  });
});
