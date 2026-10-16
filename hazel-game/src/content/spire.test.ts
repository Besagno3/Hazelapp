import { describe, it, expect } from 'vitest';
import {
  SPIRE_FLOORS,
  SPIRE_INTRO,
  SPIRE_LIVES,
  SPIRE_CLEAR_XP,
  spireClearXp,
  SPIRE_BOSS_DEFEAT,
  SPIRE_FLOOR_MAPS,
  SPIRE_THEMES,
  floorWards,
  floorZone,
  SPIRE_FALL_FLAGS,
  spireFalls,
  flagsAfterSpireFall,
  flagsAfterSpireClear,
  spireCandles,
  spireQuestionLevel,
  spireComebackLine,
} from './spire';
import { LEGEND_CHARS, WALKABLE_CHARS, VIEW_COLS, VIEW_ROWS } from './zones';
import { reach, touches } from '../lib/reach';
import { ALL_TOPICS } from './topics';

describe('Spire climb (#55)', () => {
  it('has an intro, candle-lights, and a clear reward', () => {
    expect(SPIRE_INTRO.length).toBeGreaterThanOrEqual(1);
    for (const line of SPIRE_INTRO) expect(line.length).toBeGreaterThan(10);
    expect(SPIRE_LIVES).toBeGreaterThan(0);
    expect(SPIRE_CLEAR_XP).toBeGreaterThan(0);
    expect(SPIRE_BOSS_DEFEAT.length).toBeGreaterThan(10);
  });

  it('the clear bonus is paid on the first clear only (#109)', () => {
    expect(spireClearXp(19, 10, false)).toBe(190 + SPIRE_CLEAR_XP);
    expect(spireClearXp(19, 10, true)).toBe(190);
    expect(spireClearXp(0, 10, true)).toBe(0);
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

  it('floors ask 0 to 3 levels above the kid, Umbra\'s the most (B4, #150)', () => {
    // They asked 2 to 6 above (levelBonus 1–5, plus one more in the overlay).
    expect(SPIRE_FLOORS.map((f) => f.levelBonus)).toEqual([0, 1, 2, 2, 3]);
    const first = SPIRE_FLOORS[0];
    const boss = SPIRE_FLOORS[SPIRE_FLOORS.length - 1];
    expect(spireQuestionLevel(5, first, 0)).toBe(5);
    expect(spireQuestionLevel(5, boss, 0)).toBe(8);
    // Still 1–10 at both ends.
    expect(spireQuestionLevel(10, boss, 0)).toBe(10);
    expect(spireQuestionLevel(1, first, 2)).toBe(1);
  });

  it('each fall lights one more candle and asks one level lower, up to two (B4, #150)', () => {
    const boss = SPIRE_FLOORS[SPIRE_FLOORS.length - 1];
    expect([0, 1, 2, 3].map(spireCandles)).toEqual([SPIRE_LIVES, SPIRE_LIVES + 1, SPIRE_LIVES + 2, SPIRE_LIVES + 2]);
    expect([0, 1, 2, 3].map((n) => spireQuestionLevel(6, boss, n))).toEqual([9, 8, 7, 7]);
  });

  it('a fall asks every floor a level lower for any kid, up to level 10 (B4 review round 2)', () => {
    // A level-8+ kid's floors ran past 10, and the cut at 10 ate the fall:
    // Umbra asked 10 again after a fall (and a level-9 kid's after two).
    const boss = SPIRE_FLOORS[SPIRE_FLOORS.length - 1];
    expect([0, 1, 2].map((n) => spireQuestionLevel(10, boss, n))).toEqual([10, 9, 8]);
    expect([0, 1, 2].map((n) => spireQuestionLevel(9, boss, n))).toEqual([10, 9, 8]);
    for (let base = 1; base <= 10; base++) {
      for (const f of SPIRE_FLOORS) {
        for (const n of [1, 2]) {
          const before = spireQuestionLevel(base, f, n - 1);
          expect(spireQuestionLevel(base, f, n), `level ${base}, ${f.name}, fall ${n}`).toBe(Math.max(1, before - 1));
        }
      }
    }
  });

  it('falls are save flags: counted, capped at two, forgotten on a clear (B4, #150)', () => {
    expect(SPIRE_FALL_FLAGS).toEqual(['spire-falls-1', 'spire-falls-2']);
    expect(spireFalls(undefined)).toBe(0);
    const start = { 'spire-cleared': true };
    const one = flagsAfterSpireFall(start);
    expect(one).toEqual({ 'spire-cleared': true, 'spire-falls-1': true });
    expect(start).toEqual({ 'spire-cleared': true }); // never changed in place
    const two = flagsAfterSpireFall(one);
    expect(spireFalls(one)).toBe(1);
    expect(spireFalls(two)).toBe(2);
    expect(spireFalls(flagsAfterSpireFall(two))).toBe(2);
    // Past the cap a fall writes nothing — no stray third flag (B4 review round 1).
    expect(flagsAfterSpireFall(two)).toEqual(two);
    expect(flagsAfterSpireClear(two)).toEqual({ 'spire-cleared': true });
  });

  it('back after a fall, one short line says so — in plain words (B4, #150)', () => {
    expect(spireComebackLine(0)).toBeNull();
    for (const n of [1, 2]) {
      const line = spireComebackLine(n)!;
      expect(line).toMatch(/^The Spire remembers you tried\./);
      expect(line).toMatch(n === 1 ? /One more candle/ : /Two more candles/);
      expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(30);
      expect(line).not.toMatch(/\b(test|quiz|exam|grade|score)\b/i);
    }
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
      const open = reach(floorZone(floor.theme), { flags: null });
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
    const open = reach(floorZone(boss.theme), { flags: null });
    expect(open.has(`${f.umbra!.x},${f.umbra!.y}`) || touches(open, f.umbra!.x, f.umbra!.y)).toBe(true);
  });

  it('floorZone renders a floor as a Spire-zone map with its own tileset', () => {
    const z = floorZone('stars');
    expect(z.id).toBe('crystal-spire');
    expect(z.tileset).toBe('spire-stars');
    expect(z.exits).toHaveLength(0);
  });
});
