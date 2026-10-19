import { describe, it, expect } from 'vitest';
import { LEAF_MILESTONES, LEAVES_TUNING, LEAVES_XP, leafPace, leafPool, leavesAccuracy, leavesFlag, lowestLeaf, newMilestones, pressLeaf, startLeaves, stepLeaves } from './leaves';
import { TYPING_LESSONS, typingLessonFlag } from '../content/typing';

const pool = [
  { ch: 'f', code: 'KeyF' },
  { ch: 'j', code: 'KeyJ' },
];
const press = (key: string, code: string, held: string[] = [], holdRule = false) => ({ key, code, held: new Set([code, ...held]), holdRule });

/** Time passes until the next leaf starts (no leaf falls that far in the meantime). */
function untilSpawn(s = startLeaves()) {
  return stepLeaves(s, leafPace(s.caught).spawnMs, pool, () => 0);
}

describe('🍂 Falling Leaves (#159 item 7)', () => {
  it('the pool is the keys the lessons cleared so far have taught: f and j after lesson 1, more after each, never space', () => {
    expect(leafPool({}).map((k) => k.ch).sort()).toEqual(['f', 'j']);
    const two = { [typingLessonFlag(TYPING_LESSONS[0].id)]: true, [typingLessonFlag(TYPING_LESSONS[1].id)]: true };
    expect(leafPool(two).map((k) => k.ch).sort()).toEqual(['d', 'f', 'j', 'k']);
    // Lesson 3 cleared without lesson 2 counts for nothing: the pool stops at the first not cleared.
    const gap = { [typingLessonFlag(TYPING_LESSONS[0].id)]: true, [typingLessonFlag(TYPING_LESSONS[2].id)]: true };
    expect(leafPool(gap).map((k) => k.ch).sort()).toEqual(['f', 'j']);
    const all: Record<string, boolean> = {};
    for (const l of TYPING_LESSONS) all[typingLessonFlag(l.id)] = true;
    const chars = leafPool(all).map((k) => k.ch);
    expect(chars).not.toContain(' ');
    expect(chars).toContain('z');
    expect(chars).toContain(',');
    expect(new Set(chars).size).toBe(chars.length);
  });

  it('a leaf starts when it is time, a character not already falling, and falls to the ground in its time', () => {
    let s = stepLeaves(startLeaves(), 100, pool, () => 0);
    expect(s.leaves).toEqual([]);
    s = untilSpawn();
    expect(s.leaves).toHaveLength(1);
    expect(s.leaves[0]).toMatchObject({ ch: 'f', code: 'KeyF', y: 0 });
    expect(s.leaves[0].x).toBeGreaterThanOrEqual(8);
    // The next picks the other character (f is falling), then none (both are).
    s = stepLeaves(s, leafPace(0).spawnMs, pool, () => 0);
    expect(s.leaves.map((l) => l.ch)).toEqual(['f', 'j']);
    const before = s.leaves.length;
    s = stepLeaves(s, leafPace(0).spawnMs, pool, () => 0);
    expect(s.leaves.length).toBe(before);
    // Falling: halfway after half the fall time; on the ground after all of it — a miss.
    let t = untilSpawn();
    t = stepLeaves(t, leafPace(0).fallMs / 2, [], () => 0);
    expect(t.leaves[0].y).toBeCloseTo(0.5, 5);
    t = stepLeaves(t, leafPace(0).fallMs / 2, [], () => 0);
    expect(t.leaves).toEqual([]);
    expect(t.missed).toBe(1);
    expect(t.over).toBe(false);
  });

  it('the right key catches the lowest such leaf; a key with no leaf is wrong; the hold nudges without the other hand', () => {
    let s = untilSpawn();
    const r = pressLeaf(s, press('f', 'KeyF'));
    expect(r.event).toBe('caught');
    expect(r.leaf?.ch).toBe('f');
    expect(r.next.caught).toBe(1);
    expect(r.next.leaves).toEqual([]);
    s = untilSpawn();
    expect(pressLeaf(s, press('j', 'KeyJ')).event).toBe('wrong');
    expect(pressLeaf(s, press('j', 'KeyJ')).next.wrong).toBe(1);
    expect(pressLeaf(s, press('Shift', 'ShiftLeft')).event).toBe('none');
    expect(pressLeaf(s, press('ArrowUp', 'ArrowUp')).event).toBe('none');
    // With the hold on: f wants J held; J going down first is an anchor, not a wrong key.
    expect(pressLeaf(s, press('j', 'KeyJ', [], true)).event).toBe('none');
    expect(pressLeaf(s, press('f', 'KeyF', [], true)).event).toBe('hold');
    expect(pressLeaf(s, press('f', 'KeyF', ['KeyJ'], true)).event).toBe('caught');
    // Two f leaves: the lower one is caught.
    const two = { ...s, leaves: [{ ...s.leaves[0], id: 1, y: 0.2 }, { ...s.leaves[0], id: 2, y: 0.7 }] };
    expect(lowestLeaf(two, 'f')?.id).toBe(2);
    expect(pressLeaf(two, press('f', 'KeyF')).next.leaves.map((l) => l.id)).toEqual([1]);
    expect(leavesAccuracy({ ...s, caught: 3, wrong: 1 })).toBe(0.75);
    expect(leavesAccuracy(startLeaves())).toBe(1);
  });

  it("with the hold on, a bare F or J while the lowest leaf wants it held is anchoring, not a wrong-hand nudge (review round 1)", () => {
    const s = untilSpawn();
    const f = { ...s.leaves[0], id: 1, ch: 'f', code: 'KeyF', y: 0.2 };
    const k = { ...s.leaves[0], id: 2, ch: 'k', code: 'KeyK', y: 0.6 };
    const both = { ...s, leaves: [f, k] };
    // k is lowest and wants F held: F alone is the anchor going down.
    expect(pressLeaf(both, press('f', 'KeyF', [], true)).event).toBe('none');
    // F with J held really types f: the f leaf is caught.
    expect(pressLeaf(both, press('f', 'KeyF', ['KeyJ'], true)).event).toBe('caught');
    // With the f leaf lowest, F alone is a wrong-hand f: the nudge.
    const fLow = { ...s, leaves: [{ ...f, y: 0.8 }, { ...k, y: 0.1 }] };
    expect(pressLeaf(fLow, press('f', 'KeyF', [], true)).event).toBe('hold');
  });

  it('a capital of a falling letter is a caps nudge, not a wrong key; a bare space is nothing (review round 2)', () => {
    const s = untilSpawn();
    expect(s.leaves[0].ch).toBe('f');
    const caps = pressLeaf(s, press('F', 'KeyF'));
    expect(caps.event).toBe('caps');
    expect(caps.leaf?.ch).toBe('f');
    expect(caps.next.wrong).toBe(0);
    expect(caps.next.leaves).toHaveLength(1);
    expect(pressLeaf(s, press('J', 'KeyJ')).event).toBe('wrong');
    expect(pressLeaf(s, press(' ', 'Space')).event).toBe('none');
  });

  it('the round ends on the third leaf on the ground, or when the clock runs out; nothing moves after', () => {
    let s = startLeaves();
    for (let i = 0; i < 3; i++) {
      s = untilSpawn(s);
      s = stepLeaves(s, leafPace(0).fallMs, [], () => 0);
    }
    expect(s.missed).toBe(LEAVES_TUNING.maxMissed);
    expect(s.over).toBe(true);
    expect(stepLeaves(s, 1000, pool, () => 0)).toBe(s);
    expect(pressLeaf(s, press('f', 'KeyF')).event).toBe('none');
    const timed = stepLeaves(startLeaves(), LEAVES_TUNING.roundMs, [], () => 0);
    expect(timed.over).toBe(true);
  });

  it('leaves fall and start faster the more are caught, down to a floor', () => {
    expect(leafPace(0)).toEqual({ fallMs: LEAVES_TUNING.fallMs, spawnMs: LEAVES_TUNING.spawnMs });
    expect(leafPace(10).fallMs).toBeLessThan(leafPace(0).fallMs);
    expect(leafPace(10).spawnMs).toBeLessThan(leafPace(0).spawnMs);
    expect(leafPace(1000)).toEqual({ fallMs: LEAVES_TUNING.fallMinMs, spawnMs: LEAVES_TUNING.spawnMinMs });
  });

  it('milestones pay once: 10, 25 and 50 in one round', () => {
    expect(LEAF_MILESTONES).toEqual([10, 25, 50]);
    expect(newMilestones(9, {})).toEqual([]);
    expect(newMilestones(10, {})).toEqual([10]);
    expect(newMilestones(30, {})).toEqual([10, 25]);
    expect(newMilestones(30, { [leavesFlag(10)]: true })).toEqual([25]);
    expect(LEAVES_XP).toBeGreaterThan(0);
  });
});
