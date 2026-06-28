import { describe, it, expect } from 'vitest';
import {
  npcWanders,
  pickWanderDir,
  withinLeash,
  clampToLeash,
  pickAmbientLine,
  WANDER_TUNING,
  AMBIENT_TUNING,
} from './wander';
import { NPC_DEFS } from '../content/npcs';
import { QUESTS } from '../content/quests';

describe('npcWanders', () => {
  it('lets pure-flavor villagers roam', () => {
    expect(npcWanders({ role: 'villager' })).toBe(true);
  });

  it('keeps every service role put', () => {
    for (const role of ['sage', 'merchant', 'innkeeper', 'librarian'] as const) {
      expect(npcWanders({ role })).toBe(false);
    }
  });

  it('keeps villagers explicitly marked stationary put (quest-givers, story, signposts)', () => {
    expect(npcWanders({ role: 'villager', stationary: true })).toBe(false);
  });
});

describe('pickWanderDir', () => {
  it('idles for low rng values', () => {
    expect(pickWanderDir(() => 0)).toEqual({ x: 0, y: 0 });
  });

  it('returns a unit-length step for moving values', () => {
    for (const r of [0.4, 0.55, 0.7, 0.85, 0.99]) {
      const d = pickWanderDir(() => r);
      const len = Math.hypot(d.x, d.y);
      expect(len).toBeGreaterThan(0.99);
      expect(len).toBeLessThan(1.01);
    }
  });

  it('never indexes out of range at rng→1', () => {
    const d = pickWanderDir(() => 0.999999);
    expect(Number.isFinite(d.x)).toBe(true);
    expect(Number.isFinite(d.y)).toBe(true);
  });
});

describe('leash', () => {
  it('treats points inside the radius as within leash', () => {
    expect(withinLeash(105, 100, 100, 100, 10)).toBe(true);
    expect(withinLeash(120, 100, 100, 100, 10)).toBe(false);
  });

  it('leaves in-leash points untouched', () => {
    expect(clampToLeash(105, 100, 100, 100, 10)).toEqual({ x: 105, y: 100 });
  });

  it('pulls strayed points back onto the leash edge', () => {
    const c = clampToLeash(140, 100, 100, 100, 10);
    expect(c.x).toBeCloseTo(110);
    expect(c.y).toBeCloseTo(100);
    expect(Math.hypot(c.x - 100, c.y - 100)).toBeCloseTo(10);
  });
});

describe('npcWanders over the real roster', () => {
  it('keeps every quest-giver findable (stationary)', () => {
    for (const q of QUESTS) {
      expect(npcWanders(NPC_DEFS[q.giverNpcId]), `${q.giverNpcId} must not wander`).toBe(false);
    }
  });

  it('never lets a service NPC wander', () => {
    for (const def of Object.values(NPC_DEFS)) {
      if (def.role !== 'villager') expect(npcWanders(def), `${def.id}`).toBe(false);
    }
  });

  it('still lets pure-flavor villagers roam (the world feels alive)', () => {
    expect(npcWanders(NPC_DEFS['village-friend'])).toBe(true); // Bramble
    expect(Object.values(NPC_DEFS).some((d) => npcWanders(d))).toBe(true);
  });
});

describe('tuning constants', () => {
  it('wander speeds stay well under the player (170) and enemies roam wider', () => {
    expect(WANDER_TUNING.npc.speed).toBeGreaterThan(0);
    expect(WANDER_TUNING.enemy.speed).toBeGreaterThan(0);
    expect(WANDER_TUNING.npc.speed).toBeLessThan(170);
    expect(WANDER_TUNING.enemy.speed).toBeLessThan(170);
    expect(WANDER_TUNING.enemy.leashTiles).toBeGreaterThanOrEqual(WANDER_TUNING.npc.leashTiles);
  });

  it('ambient timing is sane (positive life, non-negative spans)', () => {
    expect(AMBIENT_TUNING.life).toBeGreaterThan(0);
    expect(AMBIENT_TUNING.firstMin).toBeGreaterThanOrEqual(0);
    expect(AMBIENT_TUNING.firstSpan).toBeGreaterThanOrEqual(0);
    expect(AMBIENT_TUNING.gapMin).toBeGreaterThan(0);
    expect(AMBIENT_TUNING.gapSpan).toBeGreaterThanOrEqual(0);
  });
});

describe('pickAmbientLine', () => {
  it('returns null with no lines', () => {
    expect(pickAmbientLine([], () => 0)).toBeNull();
  });

  it('picks a line by rng', () => {
    const lines = ['a', 'b', 'c'];
    expect(pickAmbientLine(lines, () => 0)).toBe('a');
    expect(pickAmbientLine(lines, () => 0.5)).toBe('b');
    expect(pickAmbientLine(lines, () => 0.99)).toBe('c');
  });
});
