import { describe, it, expect } from 'vitest';
import { ZONES, buildingAt, tileAt, type ZoneDef } from '../content/zones';
import {
  CORNER_ASSIST,
  SCOOT_AFTER_S,
  inFront,
  isInteractKey,
  ownsKeys,
  personPassable,
  probeDirs,
  probePoints,
  promptText,
  pushOn,
  scootPath,
  slideStep,
  cornerTarget,
} from './interact';
import type { Cell } from './reach';

/** A little test map: Lumina Village's details over our own rows (no buildings, exits or people of its own). */
function mk(map: string[], extra: Partial<ZoneDef> = {}): ZoneDef {
  return {
    ...ZONES['lumina-village'],
    map,
    spawn: { x: 0, y: 0 },
    buildings: [],
    exits: [],
    npcs: [],
    enemies: [],
    fogs: [],
    dark: undefined,
    seaLinks: undefined,
    ...extra,
  };
}

/** Every step of a path is one cell along or up/down from the last, on ground a person may walk. */
function walkable(z: ZoneDef, path: Cell[]) {
  for (let i = 0; i < path.length; i++) {
    const c = path[i];
    if (i > 0) expect(Math.abs(c.x - path[i - 1].x) + Math.abs(c.y - path[i - 1].y)).toBe(1);
    if (i > 0) expect(personPassable(tileAt(z, c.x, c.y), 'foot')).toBe(true);
    expect(z.exits.some((e) => e.x === c.x && e.y === c.y)).toBe(false);
  }
}
const last = (p: Cell[] | null) => p?.[p.length - 1];

describe('the use keys (#124)', () => {
  it('Space and Enter use things; other keys never do', () => {
    expect(isInteractKey({ key: ' ', code: 'Space' })).toBe(true);
    expect(isInteractKey({ key: 'Spacebar', code: '' })).toBe(true);
    expect(isInteractKey({ key: 'Enter', code: 'Enter' })).toBe(true);
    expect(isInteractKey({ key: 'Enter', code: 'NumpadEnter' })).toBe(true);
    for (const key of ['a', 'ArrowUp', 'Escape', 'Tab', 'e']) expect(isInteractKey({ key, code: '' })).toBe(false);
  });

  it('a focused button, link or field — or anything in a dialog — keeps Space / Enter for itself', () => {
    document.body.innerHTML = `
      <button id="b"><span id="in-b">📜 Menu</span></button>
      <a id="a" href="#x">link</a><input id="i" /><textarea id="t"></textarea>
      <div role="dialog"><p id="d">Hello!</p></div>
      <div id="plain"></div>`;
    for (const id of ['b', 'in-b', 'a', 'i', 't', 'd']) expect(ownsKeys(document.getElementById(id))).toBe(true);
    expect(ownsKeys(document.getElementById('plain'))).toBe(false);
    expect(ownsKeys(document.body)).toBe(false);
    expect(ownsKeys(null)).toBe(false);
    expect(ownsKeys(window)).toBe(false);
  });
});

describe('what the hero would use (#124)', () => {
  it('looks the way they face first, then to the sides, then behind', () => {
    expect(probeDirs({ x: 0, y: 1 })).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
    ]);
    expect(probeDirs({ x: -1, y: 0 }).map((d) => `${d.x},${d.y}`)).toEqual(['-1,0', '0,1', '0,-1', '1,0']);
    // A diagonal: both of its ways first, the stronger one leading; behind it last.
    const diag = probeDirs({ x: Math.SQRT1_2, y: -Math.SQRT1_2 }).map((d) => `${d.x},${d.y}`);
    expect(diag.slice(0, 2)).toEqual(['1,0', '0,-1']);
    expect(diag[3]).toBe('-1,0');
    expect(new Set(diag).size).toBe(4);
    // Never moved yet: facing the camera, as they spawn.
    expect(probeDirs({ x: 0, y: 0 })[0]).toEqual({ x: 0, y: 1 });
  });

  it('probes just past the side of the box it faces: the middle, then by each corner', () => {
    const right = probePoints(100, 50, { x: 1, y: 0 }, 11, 10);
    expect(right[0]).toEqual({ x: 121, y: 50 });
    expect(right.map((p) => p.x)).toEqual([121, 121, 121]);
    expect(right.slice(1).map((p) => p.y)).toEqual([41, 59]);
    const up = probePoints(100, 50, { x: 0, y: -1 }, 11, 10);
    expect(up[0]).toEqual({ x: 100, y: 29 });
    expect(up.slice(1).map((p) => p.x)).toEqual([91, 109]);
  });

  it('someone counts when they are near enough and on the side the hero faces', () => {
    const hero = { x: 0, y: 0 };
    const down = { x: 0, y: 1 };
    expect(inFront(hero, { x: 0, y: 30 }, down, 36)).toBe(true);
    expect(inFront(hero, { x: 12, y: 30 }, down, 36)).toBe(true); // a little to one side
    expect(inFront(hero, { x: 30, y: 10 }, down, 36)).toBe(false); // off to the side: the side probe's
    expect(inFront(hero, { x: 0, y: -30 }, down, 36)).toBe(false); // behind
    expect(inFront(hero, { x: 0, y: 40 }, down, 36)).toBe(false); // too far
    expect(inFront(hero, { x: 0, y: 0 }, down, 36)).toBe(true); // right on top of them
  });

  it('the prompt names the key on a keyboard and the tap on a touch screen', () => {
    expect(promptText('Open chest', false)).toBe('Space: Open chest');
    expect(promptText('Talk', true)).toBe('Tap: Talk');
  });
});

describe('doorway corner assist (#124)', () => {
  const T = 32;
  const door = 5; // the one open cell in the wall, centred at 176 px
  const open = (c: number) => c === door;

  it('slides a hero a little off the doorway into line with it', () => {
    expect(cornerTarget(176, open, T)).toBe(176); // already lined up
    for (const off of [-CORNER_ASSIST, -14, -8, -6, 6, 8, 14, CORNER_ASSIST]) expect(cornerTarget(176 + off, open, T)).toBe(176);
  });

  it('but not one walking into the wall well away from it', () => {
    expect(cornerTarget(176 - CORNER_ASSIST - 1, open, T)).toBeNull();
    expect(cornerTarget(176 + 30, open, T)).toBeNull();
    expect(cornerTarget(176, () => false, T)).toBeNull(); // a plain wall
  });

  it('picks the nearer of two openings', () => {
    const two = (c: number) => c === 4 || c === 5; // a two-wide gap, cells centred at 144 and 176
    expect(cornerTarget(150, two, T)).toBe(144);
    expect(cornerTarget(170, two, T)).toBe(176);
  });

  it('slides at most a step a frame, and stops once there', () => {
    expect(slideStep(160, 176, 3)).toBe(3);
    expect(slideStep(190, 176, 3)).toBe(-3);
    expect(slideStep(175, 176, 3)).toBe(1);
    expect(slideStep(176, 176, 3)).toBe(0);
  });
});

describe('stepping aside for the hero (#124)', () => {
  it('counts how long the hero keeps walking into the same person', () => {
    let push = pushOn(null, 'mabel', 0.5);
    push = pushOn(push, 'mabel', 0.5);
    expect(push).toEqual({ who: 'mabel', t: 1 });
    push = pushOn(push, 'mabel', 0.6);
    expect(push!.t).toBeGreaterThanOrEqual(SCOOT_AFTER_S);
    expect(pushOn(push, 'moss', 0.1)).toEqual({ who: 'moss', t: 0.1 }); // someone else: from the start
    expect(pushOn(push, null, 0.1)).toBeNull(); // stopped, or turned away
  });

  it('in the open, they step a few cells off the line the hero walks', () => {
    const z = mk(Array(9).fill('.........'));
    const path = scootPath(z, { from: { x: 4, y: 4 }, hero: { x: 4, y: 5 }, heroCells: [{ x: 4, y: 5 }], push: { x: 0, y: -1 }, flags: {} });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 4, y: 4 });
    walkable(z, path!);
    const end = last(path)!;
    expect(end.x).not.toBe(4); // out of the hero's way
    expect(Math.max(Math.abs(end.x - 4), Math.abs(end.y - 5))).toBeGreaterThanOrEqual(2);
    const steps = Math.abs(end.x - 4) + Math.abs(end.y - 4);
    expect(steps).toBeGreaterThanOrEqual(2);
    expect(steps).toBeLessThanOrEqual(5);
  });

  it('in a corridor, they go on through it and step aside in the room beyond', () => {
    const z = mk(['#######', '#.....#', '#.....#', '###.###', '###.###', '###.###', '#.....#']);
    const path = scootPath(z, { from: { x: 3, y: 4 }, hero: { x: 3, y: 5 }, heroCells: [{ x: 3, y: 5 }], push: { x: 0, y: -1 }, flags: {} });
    walkable(z, path!);
    expect(path).toEqual([
      { x: 3, y: 4 },
      { x: 3, y: 3 },
      { x: 3, y: 2 },
      { x: 2, y: 2 },
    ]);
  });

  it('hemmed in at a dead end, they squeeze past the hero to the other side', () => {
    const z = mk(['#####', '##.##', '##.##', '##.##', '#...#', '#...#']);
    const path = scootPath(z, { from: { x: 2, y: 2 }, hero: { x: 2, y: 3 }, heroCells: [{ x: 2, y: 3 }], push: { x: 0, y: -1 }, flags: {} });
    walkable(z, path!);
    expect(path!.some((c) => c.x === 2 && c.y === 3)).toBe(true); // through the hero
    expect(last(path)).toEqual({ x: 2, y: 5 });
  });

  it('never walks out of (or into) a building, and never stops in its doorway', () => {
    const z = mk(['..........', '.WWWWWWW..', '.WFFFFFW..', '.WFFFFFW..', '.WFFFFFW..', '.WWWDWWW..', '..........'], {
      buildings: [{ id: 'shop', name: 'Shop', x: 1, y: 1, w: 7, h: 5, roof: 'red', style: 'cottage' }],
    });
    const path = scootPath(z, { from: { x: 4, y: 4 }, hero: { x: 4, y: 3 }, heroCells: [{ x: 4, y: 3 }], push: { x: 0, y: 1 }, flags: {} });
    expect(path).not.toBeNull();
    walkable(z, path!);
    for (const c of path!) {
      expect(buildingAt(z, c.x, c.y)?.id).toBe('shop');
      expect(tileAt(z, c.x, c.y)).toBe('F');
    }
  });

  it('keeps off exits, hidden passages, stairs and other people', () => {
    const z = mk(['.........', '.........', '..EH.H<..', '...H.H...', '.........', '.........'], { exits: [{ x: 2, y: 2, to: 'dawnreach', spawnX: 0, spawnY: 0 }] });
    const o = { from: { x: 4, y: 2 }, hero: { x: 4, y: 3 }, heroCells: [{ x: 4, y: 3 }], push: { x: 0, y: -1 }, flags: {} };
    const free = scootPath(z, o);
    walkable(z, free!);
    const taken = last(free)!;
    const around = scootPath(z, { ...o, blocked: (x, y) => x === taken.x && y === taken.y });
    walkable(z, around!);
    expect(around!.some((c) => c.x === taken.x && c.y === taken.y)).toBe(false);
  });

  it('with nowhere to go at all, they stay put', () => {
    const z = mk(['###', '#.#', '###']);
    expect(scootPath(z, { from: { x: 1, y: 1 }, hero: { x: 1, y: 2 }, heroCells: [], push: { x: 0, y: -1 }, flags: {} })).toBeNull();
  });
});
