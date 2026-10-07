import { describe, expect, it } from 'vitest';
import { TILE, ZONES } from '../content/zones';
import { FOG_PUFF_FRAMES, FOG_PUFF_SIZE } from '../content/tiles';
import { FOG_OVERHANG, fogPuffs, puffAt } from './fog';

const banks = ZONES.dawnreach.fogs!;
const centre = (f: (typeof banks)[number]) => ({ x: (f.x + f.w / 2) * TILE, y: (f.y + f.h / 2) * TILE });

describe('fogPuffs (#75 item 7)', () => {
  it('lays a bank out the same way every time', () => {
    for (const f of banks) expect(fogPuffs(f)).toEqual(fogPuffs(f));
  });

  it('leaves no holes: every cell of the bank sits well inside some puff', () => {
    for (const f of banks) {
      const puffs = fogPuffs(f);
      for (let y = f.y; y < f.y + f.h; y++) {
        for (let x = f.x; x < f.x + f.w; x++) {
          const cx = (x + 0.5) * TILE;
          const cy = (y + 0.5) * TILE;
          const near = Math.min(...puffs.map((p) => Math.hypot(p.x - cx, p.y - cy) - (FOG_PUFF_SIZE / 2) * p.scale * 0.6));
          expect(near, `${f.id} cell ${x},${y}`).toBeLessThan(0);
        }
      }
    }
  });

  it('spills past the edge by at most FOG_OVERHANG, however the puffs drift', () => {
    for (const f of banks) {
      for (const p of fogPuffs(f)) {
        for (const t of [0, 1.3, 4.7, 9.9, 20]) {
          const at = puffAt(p, t, 0, centre(f));
          const r = (FOG_PUFF_SIZE / 2) * at.scale;
          expect(at.x - r).toBeGreaterThanOrEqual(f.x * TILE - FOG_OVERHANG);
          expect(at.x + r).toBeLessThanOrEqual((f.x + f.w) * TILE + FOG_OVERHANG);
          expect(at.y - r).toBeGreaterThanOrEqual(f.y * TILE - FOG_OVERHANG);
          expect(at.y + r).toBeLessThanOrEqual((f.y + f.h) * TILE + FOG_OVERHANG);
        }
      }
    }
  });

  it('mixes puff shapes and has neighbours turning both ways', () => {
    const puffs = fogPuffs(banks.find((f) => f.id === 'spire-fog')!);
    expect(new Set(puffs.map((p) => p.frame)).size).toBe(FOG_PUFF_FRAMES);
    expect(puffs.some((p) => p.speed > 0) && puffs.some((p) => p.speed < 0)).toBe(true);
    expect(puffs.every((p) => p.frame >= 0 && p.frame < FOG_PUFF_FRAMES)).toBe(true);
  });
});

describe('puffAt', () => {
  const f = banks[0];
  const p = fogPuffs(f)[0];
  it('drifts over time, and stays put with reduced motion', () => {
    expect(puffAt(p, 0, 0, centre(f))).not.toEqual(puffAt(p, 2, 0, centre(f)));
    expect(puffAt(p, 0, 0, centre(f), true)).toEqual(puffAt(p, 2, 0, centre(f), true));
  });
  it('lifting spreads it up and away and fades it out', () => {
    const before = puffAt(p, 1, 0, centre(f));
    const half = puffAt(p, 1, 0.5, centre(f));
    const gone = puffAt(p, 1, 1, centre(f));
    expect(half.y).toBeLessThan(before.y);
    expect(half.opacity).toBeCloseTo(before.opacity / 2);
    expect(gone.opacity).toBe(0);
    // Reduced motion: a lift only fades.
    const still = puffAt(p, 1, 0.5, centre(f), true);
    expect([still.x, still.y]).toEqual([p.x, p.y]);
    expect(still.opacity).toBeCloseTo(p.opacity / 2);
  });
});
