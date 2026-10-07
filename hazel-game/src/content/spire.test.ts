import { describe, it, expect } from 'vitest';
import {
  SPIRE_FLOORS,
  SPIRE_INTRO,
  SPIRE_LIVES,
  SPIRE_CLEAR_XP,
  SPIRE_BOSS_DEFEAT,
  SPIRE_FLOOR_MAPS,
  SPIRE_THEMES,
  floorWards,
  floorZone,
} from './spire';
import { LEGEND_CHARS, WALKABLE_CHARS, VIEW_COLS, VIEW_ROWS } from './zones';
import { ALL_TOPICS } from './topics';

describe('Spire climb (#55)', () => {
  it('has an intro, candle-lights, and a clear reward', () => {
    expect(SPIRE_INTRO.length).toBeGreaterThanOrEqual(1);
    for (const line of SPIRE_INTRO) expect(line.length).toBeGreaterThan(10);
    expect(SPIRE_LIVES).toBeGreaterThan(0);
    expect(SPIRE_CLEAR_XP).toBeGreaterThan(0);
    expect(SPIRE_BOSS_DEFEAT.length).toBeGreaterThan(10);
  });

  it('floors escalate in difficulty and end in a single boss floor', () => {
    expect(SPIRE_FLOORS.length).toBeGreaterThanOrEqual(3);
    let prevBonus = -Infinity;
    for (const f of SPIRE_FLOORS) {
      expect(f.levelBonus).toBeGreaterThanOrEqual(prevBonus); // non-decreasing
      prevBonus = f.levelBonus;
      expect(f.questions).toBeGreaterThan(0);
      expect(f.topics.length).toBeGreaterThan(0);
      expect(f.taunt.length).toBeGreaterThan(10);
    }
    const bosses = SPIRE_FLOORS.filter((f) => f.isBoss);
    expect(bosses).toHaveLength(1);
    expect(SPIRE_FLOORS[SPIRE_FLOORS.length - 1].isBoss).toBe(true);
    // The boss floor is the hardest.
    expect(SPIRE_FLOORS[SPIRE_FLOORS.length - 1].levelBonus).toBe(
      Math.max(...SPIRE_FLOORS.map((f) => f.levelBonus)),
    );
  });

  it('every floor draws from real question topics', () => {
    for (const f of SPIRE_FLOORS) {
      for (const t of f.topics) {
        expect(ALL_TOPICS, `${f.name} topic ${t}`).toContain(t);
      }
    }
  });
});

// ─── Walkable floor maps (#74) ───────────────────────────────────────────────

const FLOOR_CHARS = new Set([...LEGEND_CHARS, 'Q', 'U', 'Y']);

function reachableFrom(map: string[], sx: number, sy: number): Set<string> {
  const seen = new Set([`${sx},${sy}`]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const k = `${nx},${ny}`;
      if (seen.has(k) || !WALKABLE_CHARS.has(map[ny]?.[nx] ?? '#')) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}
const touches = (open: Set<string>, x: number, y: number) =>
  [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => open.has(`${x + dx},${y + dy}`));

describe('Spire floor maps (#74)', () => {
  it('every floor has its own theme and its own music', () => {
    expect(new Set(SPIRE_FLOORS.map((f) => f.theme)).size).toBe(SPIRE_FLOORS.length);
    expect(new Set(SPIRE_FLOORS.map((f) => f.music)).size).toBe(SPIRE_FLOORS.length);
    expect([...SPIRE_THEMES].sort()).toEqual(SPIRE_FLOORS.map((f) => f.theme).sort());
  });

  it('maps are one screen, use only legend chars, and arrive on a walkable tile', () => {
    for (const theme of SPIRE_THEMES) {
      const f = SPIRE_FLOOR_MAPS[theme];
      expect(f.map.length, theme).toBe(VIEW_ROWS);
      for (const row of f.map) {
        expect(row.length, theme).toBe(VIEW_COLS);
        for (const ch of row) expect(FLOOR_CHARS.has(ch), `${theme} '${ch}'`).toBe(true);
      }
      expect(WALKABLE_CHARS.has(f.map[f.spawn.y][f.spawn.x]), `${theme} spawn`).toBe(true);
    }
  });

  it('each climbing floor has one rune seal per question, all reachable, plus reachable stairs', () => {
    for (const floor of SPIRE_FLOORS.filter((f) => !f.isBoss)) {
      const f = SPIRE_FLOOR_MAPS[floor.theme];
      const open = reachableFrom(f.map, f.spawn.x, f.spawn.y);
      const wards = floorWards(floor.theme);
      expect(wards.length, `${floor.theme} seals`).toBe(floor.questions);
      for (const w of wards) expect(touches(open, w.x, w.y), `${floor.theme} seal ${w.id}`).toBe(true);
      const stairs = f.map.flatMap((row, y) => [...row].map((ch, x) => ({ ch, x, y }))).filter((c) => c.ch === 'U');
      expect(stairs.length, `${floor.theme} stairs`).toBeGreaterThan(0);
      expect(stairs.some((c) => touches(open, c.x, c.y)), `${floor.theme} stairs reachable`).toBe(true);
    }
  });

  it("the throne floor has no seals or stairs — only Umbra, reachable from the door", () => {
    const boss = SPIRE_FLOORS.find((f) => f.isBoss)!;
    const f = SPIRE_FLOOR_MAPS[boss.theme];
    expect(floorWards(boss.theme)).toHaveLength(0);
    expect(f.map.join('')).not.toContain('U');
    expect(f.umbra).toBeDefined();
    const open = reachableFrom(f.map, f.spawn.x, f.spawn.y);
    expect(open.has(`${f.umbra!.x},${f.umbra!.y}`) || touches(open, f.umbra!.x, f.umbra!.y)).toBe(true);
  });

  it('floorZone renders a floor as a Spire-zone map with its own tileset', () => {
    const z = floorZone('stars');
    expect(z.id).toBe('crystal-spire');
    expect(z.tileset).toBe('spire-stars');
    expect(z.exits).toHaveLength(0);
  });
});
