import { describe, expect, it } from 'vitest';
import {
  ESCORT_ARRIVE_PX,
  ESCORT_GAP,
  ESCORT_WAIT_PX,
  arrived,
  dropCrumb,
  startEscort,
  stepEscort,
  trailLength,
  waitsFor,
  type EscortState,
} from './escort';

/** The hero walks from `from` along `to`, a frame at a time at 170 px/s; the escort follows. */
function walk(s: EscortState, path: { x: number; y: number }[], threats: { x: number; y: number }[] = [], frames = 400) {
  let hero = path[0];
  let i = 1;
  const seen: { x: number; y: number }[] = [];
  for (let f = 0; f < frames; f++) {
    const next = path[i];
    if (next) {
      const d = Math.hypot(next.x - hero.x, next.y - hero.y);
      const step = 170 / 60;
      hero = d <= step ? next : { x: hero.x + ((next.x - hero.x) * step) / d, y: hero.y + ((next.y - hero.y) * step) / d };
      if (hero === next) i += 1;
    }
    s = dropCrumb(s, hero);
    s = stepEscort(s, hero, threats, 1 / 60);
    seen.push(s.at);
  }
  return { s, hero, seen };
}

describe("an escort's walk (#75 item 14g)", () => {
  it('follows the hero round a corner, a little way behind, only where the hero walked', () => {
    // East along y=100, then north up x=300: a wall in the corner's inside means
    // cutting it would walk through something.
    const path = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: -100 }];
    const { s, hero, seen } = walk(startEscort({ x: 80, y: 100 }), path);
    expect(trailLength(s, hero)).toBeGreaterThanOrEqual(ESCORT_GAP - 0.5);
    expect(trailLength(s, hero)).toBeLessThan(ESCORT_GAP + 10);
    // Never cutting the corner by more than a footstep (8 px): they kept to the trail.
    expect(seen.some((p) => p.y < 99 && p.x < 292)).toBe(false);
  });

  it('waits while a critter is near, and walks on once it has gone', () => {
    const path = [{ x: 100, y: 100 }, { x: 400, y: 100 }];
    const critter = { x: 100, y: 100 + ESCORT_WAIT_PX - 10 };
    const held = walk(startEscort({ x: 100, y: 100 }), path, [critter], 120);
    expect(held.s.waiting).toBe(true);
    expect(held.s.at).toEqual({ x: 100, y: 100 });
    // Gone: they catch up (quicker while far behind).
    const freed = walk(held.s, [held.hero, held.hero], [], 120);
    expect(freed.s.waiting).toBe(false);
    expect(trailLength(freed.s, freed.hero)).toBeLessThan(ESCORT_GAP + 10);
  });

  it('a critter further off than the wait distance never stops them', () => {
    expect(waitsFor({ x: 0, y: 0 }, [{ x: ESCORT_WAIT_PX + 1, y: 0 }])).toBe(false);
    expect(waitsFor({ x: 0, y: 0 }, [{ x: ESCORT_WAIT_PX - 1, y: 0 }])).toBe(true);
  });

  it("standing still, the hero doesn't get crowded", () => {
    const { s } = walk(startEscort({ x: 100, y: 100 }), [{ x: 110, y: 100 }, { x: 110, y: 100 }]);
    expect(s.at).toEqual({ x: 100, y: 100 });
  });

  it('arrives within reach of the goal cell', () => {
    expect(arrived({ x: 6 * 32 + 16, y: 4 * 32 + 16 + ESCORT_ARRIVE_PX - 1 }, { x: 6, y: 4 }, 32)).toBe(true);
    expect(arrived({ x: 6 * 32 + 16, y: 4 * 32 + 16 + ESCORT_ARRIVE_PX + 1 }, { x: 6, y: 4 }, 32)).toBe(false);
  });
});
