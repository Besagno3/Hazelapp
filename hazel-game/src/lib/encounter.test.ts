import { describe, it, expect } from 'vitest';
import { CONTACT_RADIUS, contactRadius, idleReach, standDown, startsBattle, staysDown, touching } from './encounter';

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
    const reach = 92;
    // Still inside its patch, wherever it has wandered: resting.
    expect(staysDown(home, home, reach)).toBe(true);
    expect(staysDown(home, { x: 150, y: 100 }, reach)).toBe(true);
    expect(staysDown(home, { x: 191, y: 100 }, reach)).toBe(true);
    // Out of its reach: awake — and it can't touch the hero from its leash (64 + 28 = 92).
    expect(staysDown(home, { x: 193, y: 100 }, reach)).toBe(false);
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
});
