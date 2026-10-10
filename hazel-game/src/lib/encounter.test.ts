import { describe, it, expect } from 'vitest';
import { CONTACT_RADIUS, contactRadius, graceOf, idleReach, meetFoe, restOf, standDown, startsBattle, staysDown, touching } from './encounter';

describe('bumping into enemies (#75 item 14d)', () => {
  it('a boss is touched from further off than a critter', () => {
    expect(contactRadius({ isBoss: false })).toBe(CONTACT_RADIUS.critter);
    expect(contactRadius({ isBoss: true })).toBe(CONTACT_RADIUS.boss);
    expect(CONTACT_RADIUS.boss).toBeGreaterThan(CONTACT_RADIUS.critter);
    expect(touching({ x: 0, y: 0 }, { x: 27, y: 0 }, 28)).toBe(true);
    expect(touching({ x: 0, y: 0 }, { x: 28, y: 0 }, 28)).toBe(false);
  });

  it('a touch starts a battle only in the enemy\'s own element, and not with a critter under Calm', () => {
    const land = { isBoss: false };
    const sea = { isBoss: false, habitat: 'sea' as const };
    const boss = { isBoss: true };
    const walking = { mode: 'foot' as const, calm: false };
    const sailing = { mode: 'boat' as const, calm: false };
    expect(startsBattle(land, walking)).toBe(true);
    expect(startsBattle(land, sailing)).toBe(false); // #108j: never from the boat
    expect(startsBattle(sea, sailing)).toBe(true);
    expect(startsBattle(sea, walking)).toBe(false);
    // Calm: critters let you pass, bosses don't — but a boss still only fights in its element.
    expect(startsBattle(land, { mode: 'foot', calm: true })).toBe(false);
    expect(startsBattle(sea, { mode: 'boat', calm: true })).toBe(false);
    expect(startsBattle(boss, { mode: 'foot', calm: true })).toBe(true);
    expect(startsBattle(boss, sailing)).toBe(false);
  });

  it('enemies already touching the hero as a scene starts stand down — only those, by their own reach', () => {
    const hero = { x: 100, y: 100 };
    const onTop = { id: 'puffer', x: 100, y: 100, isBoss: false };
    const near = { id: 'bat', x: 125, y: 100, isBoss: false }; // 25 px: touching
    const boss = { id: 'fiend', x: 100, y: 132, isBoss: true }; // 32 px: inside a boss's 34
    const clear = { id: 'slime', x: 100, y: 130, isBoss: false }; // 30 px: clear of a critter's 28
    const down = standDown([onTop, near, boss, clear], contactRadius, hero);
    expect([...down].map((f) => f.id)).toEqual(['puffer', 'bat', 'fiend']);
  });

  it('a resting critter lets the hero pass until they leave its patch — it never wakes beside them', () => {
    const home = { x: 100, y: 100 };
    const rest = restOf({ isBoss: false }, home, home, 64);
    expect(rest).toEqual({ x: 100, y: 100, reach: 92 });
    // Still inside its patch, wherever it has wandered: resting.
    expect(staysDown(rest, home)).toBe(true);
    expect(staysDown(rest, { x: 150, y: 100 })).toBe(true);
    expect(staysDown(rest, { x: 191, y: 100 })).toBe(true);
    // Out of its reach: awake — and it can't touch the hero from its leash (64 + 28 = 92).
    expect(staysDown(rest, { x: 193, y: 100 })).toBe(false);
  });

  it('a resting boss lets the hero back away or step aside, but not get past it (#112e)', () => {
    const home = { x: 100, y: 100 };
    const rest = restOf({ isBoss: true }, home, { x: 120, y: 100 }, 64); // began 20 px east of it
    expect(rest).toEqual({ x: 100, y: 100, reach: 34, from: { x: 120, y: 100 } });
    expect(staysDown(rest, { x: 120, y: 100 })).toBe(true); // standing still
    expect(staysDown(rest, { x: 120, y: 85 })).toBe(true); // a step aside
    expect(staysDown(rest, { x: 125, y: 100 })).toBe(true); // backing away…
    expect(staysDown(rest, { x: 135, y: 100 })).toBe(false); // …clear of it: awake, and out of its touch
    expect(staysDown(rest, { x: 115, y: 100 })).toBe(false); // a step towards it: awake, and touching — it fights
    // Round it at the same distance, towards its far side: awake as soon as it heads past.
    expect(staysDown(rest, { x: 120, y: 80 })).toBe(true);
    expect(staysDown(rest, { x: 119, y: 80 })).toBe(false);
    expect(touching(home, { x: 119, y: 80 }, 34)).toBe(true); // …still in its touch: it fights
    // Standing still never wakes it, whatever the rounding.
    for (const hero of [{ x: 103.7, y: 77.1 }, { x: 81.3, y: 109.9 }, { x: 100.1, y: 100.2 }, { x: 100.6, y: 100.3 }]) {
      expect(staysDown(restOf({ isBoss: true }, home, hero, 64), hero)).toBe(true);
    }
    // Begun on top of it: every way off is away.
    const onTop = restOf({ isBoss: true }, home, { x: 100.3, y: 100 }, 64);
    expect(staysDown(onTop, { x: 80, y: 100 })).toBe(true);
    expect(staysDown(onTop, { x: 135, y: 100 })).toBe(false);
  });

  it('every critter that could wander into a hero standing still stands down at the start — a Flee, a reload, a neighbour (#112e)', () => {
    const LEASH = 64;
    expect(idleReach({ isBoss: false }, LEASH)).toBe(CONTACT_RADIUS.critter + LEASH); // 92
    expect(idleReach({ isBoss: true }, LEASH)).toBe(CONTACT_RADIUS.boss); // bosses hold their ground
    const start = { x: 100, y: 100 };
    const fled = { id: 'puffer', x: 160, y: 100, isBoss: false }; // home 60 px off: it swam into the hero there
    const edge = { id: 'bat', x: 191, y: 100, isBoss: false }; // 91 px: just within reach
    const far = { id: 'slime', x: 193, y: 100, isBoss: false }; // 93 px: can't reach a hero standing still
    const boss = { id: 'fiend', x: 100, y: 140, isBoss: true }; // 40 px: a boss doesn't come to you
    const down = standDown([fled, edge, far, boss], (f) => idleReach(f, LEASH), start);
    expect([...down].map((f) => f.id)).toEqual(['puffer', 'bat']);
  });

  it('a cooldown spares only the critters touching the hero as it\'s armed — never a boss, never a person (#112t)', () => {
    const hero = { x: 100, y: 100 };
    const on = { id: 'puffer', x: 110, y: 100, enemy: { isBoss: false } }; // touching
    const near = { id: 'bat', x: 130, y: 100, enemy: { isBoss: false } }; // 30 px: not yet
    const boss = { id: 'fiend', x: 100, y: 120, enemy: { isBoss: true } }; // touching, but a boss
    const person = { id: 'echo', x: 100, y: 90 }; // no enemy at all
    expect([...graceOf([on, near, boss, person], hero)].map((a) => a.id)).toEqual(['puffer']);
    // Armed again later (Calm wearing off mid-cooldown), it's worked out afresh.
    expect([...graceOf([on, near, boss, person], { x: 128, y: 100 })].map((a) => a.id)).toEqual(['puffer', 'bat']);
  });

  describe('meeting one foe in a frame (`meetFoe`, #112e, #112t)', () => {
    const critter = { isBoss: false };
    const boss = { isBoss: true };
    const base = {
      onHero: true,
      held: false,
      resting: false,
      spared: false,
      guarded: false,
      still: false,
      closing: true,
      mode: 'foot' as const,
      calm: false,
    };
    it('walking into a foe fights — a critter or a boss, during a cooldown or not', () => {
      expect(meetFoe(critter, base)).toEqual({ fight: true, spared: false });
      expect(meetFoe(boss, { ...base, guarded: true })).toEqual({ fight: true, spared: false });
      expect(meetFoe(critter, { ...base, guarded: true })).toEqual({ fight: true, spared: false });
    });
    it('nothing happens to a resting one, or in the two frames after a cooldown is armed', () => {
      expect(meetFoe(critter, { ...base, resting: true })).toEqual({ fight: false, spared: false });
      expect(meetFoe(critter, { ...base, held: true, spared: true })).toEqual({ fight: false, spared: true });
    });
    it('one coming onto a hero standing still while guarded is spared — never a boss', () => {
      const onStill = { ...base, guarded: true, still: true, closing: false };
      expect(meetFoe(critter, onStill)).toEqual({ fight: false, spared: true });
      expect(meetFoe(boss, onStill)).toEqual({ fight: true, spared: false });
      // Not guarded (no cooldown, no toast to read): it fights, as it always has.
      expect(meetFoe(critter, { ...onStill, guarded: false })).toEqual({ fight: true, spared: false });
    });
    it('a spared one lets the hero stand or step away, even after the cooldown — walking into it fights', () => {
      const spared = { ...base, spared: true, guarded: false };
      expect(meetFoe(critter, { ...spared, still: true, closing: false })).toEqual({ fight: false, spared: true });
      expect(meetFoe(critter, { ...spared, closing: false })).toEqual({ fight: false, spared: true }); // stepping away
      expect(meetFoe(critter, spared)).toEqual({ fight: true, spared: false }); // stepping into it
      // Once it's out of the hero's touch it's no longer spared.
      expect(meetFoe(critter, { ...spared, onHero: false })).toEqual({ fight: false, spared: false });
    });
    it('a touch fights only in the enemy\'s element, and no critter under Calm', () => {
      expect(meetFoe({ isBoss: false, habitat: 'sea' }, base).fight).toBe(false);
      expect(meetFoe({ isBoss: false, habitat: 'sea' }, { ...base, mode: 'boat' }).fight).toBe(true);
      expect(meetFoe(critter, { ...base, calm: true }).fight).toBe(false);
      expect(meetFoe(boss, { ...base, calm: true }).fight).toBe(true);
    });
  });
});
