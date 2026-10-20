import { describe, it, expect } from 'vitest';
import { ZONES, ZONE_IDS, TILE, VIEW_COLS, VIEW_ROWS, buildingInside, type ZoneDef } from '../src/content/zones';
import { AVATARS } from '../src/content/avatars';
import { camAxis } from '../src/lib/camera';
import { canFlyOver } from '../src/lib/travel';
import { benchHero, screenCells } from './benchPage';

const screensOf = (z: ZoneDef) => Math.ceil(z.map.length / VIEW_ROWS) * Math.ceil(z.map[0].length / VIEW_COLS);

/** The cells whose middles the camera shows with the hero at (x, y) — as the canvas centres it. */
function seen(z: ZoneDef, x: number, y: number): Set<string> {
  const cols = z.map[0].length;
  const rows = z.map.length;
  const left = camAxis(x * TILE + TILE / 2, cols * TILE, VIEW_COLS * TILE) - (VIEW_COLS * TILE) / 2;
  const top = camAxis(y * TILE + TILE / 2, rows * TILE, VIEW_ROWS * TILE) - (VIEW_ROWS * TILE) / 2;
  const out = new Set<string>();
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const mx = cx * TILE + TILE / 2;
      const my = cy * TILE + TILE / 2;
      if (mx >= left && mx < left + VIEW_COLS * TILE && my >= top && my < top + VIEW_ROWS * TILE) out.add(`${cx},${cy}`);
    }
  }
  return out;
}

describe('bench screenCells (#82f)', () => {
  const overworlds = ZONE_IDS.map((id) => ZONES[id]).filter(canFlyOver);

  it('every screen of an overworld map is shot, and together they show every cell', () => {
    expect(overworlds.length).toBeGreaterThan(0);
    for (const z of overworlds) {
      const spots = screenCells(z);
      expect(spots, z.name).toHaveLength(screensOf(z));
      const shown = new Set(spots.flatMap((s) => [...seen(z, s.x, s.y)]));
      const missed = z.map.flatMap((row, y) => [...row].flatMap((_, x) => (shown.has(`${x},${y}`) ? [] : [`${x},${y}`])));
      expect(missed, `${z.name}: cells no shot shows`).toEqual([]);
    }
  });

  it('Dawnreach flies over the screens open ground would miss — the rows west of the Village too', () => {
    const z = ZONES.dawnreach;
    const spots = screenCells(z);
    expect(spots.some((s) => s.fly)).toBe(true);
    // Rows 27-29 at the west edge went unshot when each screen took the nearest open ground.
    const shown = new Set(spots.flatMap((s) => [...seen(z, s.x, s.y)]));
    for (const y of [27, 28, 29]) for (const x of [0, 10, 21]) expect(shown.has(`${x},${y}`), `${x},${y}`).toBe(true);
  });

  it('a hero on foot stands on open ground outdoors; only a map Ember flies over is flown', () => {
    for (const id of ZONE_IDS) {
      const z = ZONES[id];
      for (const s of screenCells(z)) {
        if (s.fly) {
          expect(canFlyOver(z), `${id} ${s.x},${s.y}`).toBe(true);
          continue;
        }
        expect('.,='.includes(z.map[s.y][s.x]), `${id} ${s.x},${s.y} is ${z.map[s.y][s.x]}`).toBe(true);
        expect(buildingInside(z, s.x, s.y), `${id} ${s.x},${s.y} indoors`).toBeFalsy();
      }
    }
  });

  it('a one-screen place still starts by its middle, on foot', () => {
    const z = ZONES['dawn-shrine'];
    expect(screensOf(z)).toBe(1);
    const [spot] = screenCells(z);
    expect(spot.fly).toBeUndefined();
    expect(Math.abs(spot.x - Math.floor(VIEW_COLS / 2)) + Math.abs(spot.y - Math.floor(VIEW_ROWS / 2))).toBeLessThan(12);
  });
});

describe('bench hero= (#115f)', () => {
  it('draws Valor unless told otherwise', () => {
    expect(benchHero(null).name).toBe('Valor');
  });

  it('draws any real hero by id', () => {
    for (const a of AVATARS) expect(benchHero(a.id)).toBe(a);
    expect(benchHero('a4').name).toBe('Kira');
  });

  it('stops on an id that is no hero, naming the real ones', () => {
    expect(() => benchHero('a9')).toThrow(/hero=a9.*a1, a2, a3, a4, a5/);
    expect(() => benchHero('')).toThrow(/no such hero/);
    expect(() => benchHero('Kira')).toThrow(/no such hero/);
  });
});
