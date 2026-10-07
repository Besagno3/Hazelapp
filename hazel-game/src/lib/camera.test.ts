import { describe, it, expect } from 'vitest';
import { camAxis, worldView } from './camera';
import { visibleRange } from './terrain';

describe('camAxis', () => {
  it('keeps single-screen maps centred', () => {
    expect(camAxis(10, 704, 704)).toBe(352);
    expect(camAxis(700, 704, 704)).toBe(352);
  });
  it('follows the target on larger maps', () => {
    expect(camAxis(700, 1408, 704)).toBe(700);
  });
  it('clamps at both map edges', () => {
    expect(camAxis(20, 1408, 704)).toBe(352);
    expect(camAxis(1400, 1408, 704)).toBe(1056);
  });
});

describe('worldView', () => {
  it('is the canvas size at 1:1, and grows when the camera zooms out', () => {
    expect(worldView(704, 448, { x: 1, y: 1 })).toEqual({ w: 704, h: 448 });
    expect(worldView(704, 448, { x: 0.5, y: 0.5 })).toEqual({ w: 1408, h: 896 });
    expect(worldView(704, 448, { x: 2, y: 2 })).toEqual({ w: 352, h: 224 });
  });

  it('zoomed out on a big map: the camera stays inside the map and every visible tile is drawn', () => {
    const TILE = 32;
    const cols = 160;
    const rows = 112;
    const v = worldView(704, 448, { x: 0.5, y: 0.5 });
    for (const [tx, ty] of [
      [0, 0],
      [2500, 1800],
      [cols * TILE, rows * TILE],
    ]) {
      const cx = camAxis(tx, cols * TILE, v.w);
      const cy = camAxis(ty, rows * TILE, v.h);
      // Never shows past the map edge…
      expect(cx - v.w / 2).toBeGreaterThanOrEqual(0);
      expect(cy - v.h / 2).toBeGreaterThanOrEqual(0);
      expect(cx + v.w / 2).toBeLessThanOrEqual(cols * TILE);
      expect(cy + v.h / 2).toBeLessThanOrEqual(rows * TILE);
      // …and the drawn window covers the whole (larger) zoomed-out view.
      const r = visibleRange(cx, cy, v.w, v.h, cols, rows, TILE);
      expect(r.x0 * TILE).toBeLessThanOrEqual(cx - v.w / 2);
      expect(r.y0 * TILE).toBeLessThanOrEqual(cy - v.h / 2);
      expect(r.x1 * TILE).toBeGreaterThanOrEqual(cx + v.w / 2);
      expect(r.y1 * TILE).toBeGreaterThanOrEqual(cy + v.h / 2);
    }
  });
});
