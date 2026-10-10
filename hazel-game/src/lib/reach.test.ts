import { describe, it, expect } from 'vitest';
import { TILE, ZONES, gateFlag, gateIdAt, litFlag, tileAt, type ZoneDef } from '../content/zones';
import { BOAT_HOME } from '../content/boat';
import { EXIT_STEP_OFF, behindFog, reach, reachPath, safeSpawn, touches } from './reach';

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
const has = (open: Set<string>, ...cells: [number, number][]) => cells.every(([x, y]) => open.has(`${x},${y}`));

describe('reach (#75 item 14b)', () => {
  it('walks 4-way over walkable tiles from the spawn, never through a wall or a corner gap', () => {
    const z = mk(['..#.', '.#..', '....']);
    const open = reach(z);
    expect(has(open, [0, 0], [1, 0], [0, 2], [3, 2], [3, 0], [2, 1])).toBe(true);
    expect(open.has('2,0')).toBe(false); // a wall
    const diag = mk(['.#', '#.']);
    expect(reach(diag).has('1,1')).toBe(false); // no squeezing between two corners
  });

  it('starts wherever it is told, and a start always counts as reached', () => {
    const z = mk(['.#.', '.#.']);
    expect(reach(z, { from: { x: 2, y: 1 } }).has('0,0')).toBe(false);
    expect(has(reach(z, { from: [{ x: 0, y: 0 }, { x: 2, y: 0 }] }), [0, 1], [2, 1])).toBe(true);
    expect(reach(z, { from: { x: 1, y: 0 } }).has('1,0')).toBe(true); // standing in a wall
  });

  it('gates: closed walls, open passes, flags as the canvas does, or per gate', () => {
    const z = mk(['.G.'], { id: 'numbria' });
    const gid = gateIdAt('numbria', z.map, 1, 0);
    expect(reach(z).has('2,0')).toBe(false);
    expect(reach(z, { gates: 'open' }).has('2,0')).toBe(true);
    expect(reach(z, { gates: 'flags' }).has('2,0')).toBe(false);
    expect(reach(z, { gates: 'flags', flags: { [gateFlag(gid)]: true } }).has('2,0')).toBe(true);
    expect(reach(z, { gates: (id) => id === gid }).has('2,0')).toBe(true);
    expect(reach(z, { gates: () => false }).has('2,0')).toBe(false);
  });

  it('fog and pitch dark block unless lifted or lit; null flags ignores both', () => {
    const fog = { id: 'f', x: 1, y: 0, w: 1, h: 1, liftedBy: ['up'], hint: '…', guards: { x: 2, y: 0 }, lifted: '…' };
    const z = mk(['...'], { fogs: [fog] });
    expect(reach(z).has('2,0')).toBe(false);
    expect(reach(z, { flags: { up: true } }).has('2,0')).toBe(true);
    expect(reach(z, { flags: null }).has('2,0')).toBe(true);
    const dark = mk(['...'], { id: 'echo-mine', dark: { pitch: [{ x: 1, y: 0, w: 1, h: 1 }], hint: '…', lit: '…', guards: { x: 2, y: 0 } } });
    expect(reach(dark).has('2,0')).toBe(false);
    expect(reach(dark, { flags: { [litFlag('echo-mine')]: true } }).has('2,0')).toBe(true);
    expect(behindFog(z, {})).toEqual(new Set(['1,0', '2,0']));
  });

  it('exits: pass walks over them; stop reaches them and goes no further', () => {
    const z = mk(['..P..'], { exits: [{ x: 2, y: 0, to: 'dawnreach', spawnX: 0, spawnY: 0 }] });
    expect(reach(z).has('4,0')).toBe(true);
    const stop = reach(z, { exits: 'stop' });
    expect(stop.has('2,0')).toBe(true);
    expect(stop.has('3,0')).toBe(false);
    // Standing on an exit to start with isn't stepping onto it.
    expect(reach(z, { from: { x: 2, y: 0 }, exits: 'stop' }).has('4,0')).toBe(true);
  });

  it('a custom tile rule and blocked cells', () => {
    const z = mk(['.:|.']);
    expect(reach(z).has('3,0')).toBe(true);
    expect(reach(z, { passable: (ch) => '.:'.includes(ch) }).has('3,0')).toBe(false);
    expect(reach(z, { blocked: (x) => x === 1 }).has('3,0')).toBe(false);
  });

  it('the boat: climb in only at its mooring, sail open sea, go ashore on a beach or a dock', () => {
    // Two shores across a strait; the boat waits at (1,1) beside the west dock.
    const z = mk(['.~~~.', '.~~~:', '|~~~.', '.....'.replace(/./g, '#')]);
    const onFoot = reach(z, { from: { x: 0, y: 2 } });
    expect(onFoot.has('4,0')).toBe(false);
    const withBoat = reach(z, { from: { x: 0, y: 2 }, modes: ['foot', 'boat'], boat: { x: 1, y: 2 } });
    expect(has(withBoat, [1, 2], [3, 1], [4, 1], [4, 0])).toBe(true); // across, ashore on the beach, up the shore
    // A boat moored by the far shore: no climbing in from this one.
    expect(reach(z, { from: { x: 0, y: 2 }, modes: ['foot', 'boat'], boat: { x: 3, y: 0 } }).has('4,1')).toBe(false);
    // Ashore only onto a beach or a dock — not onto grass.
    const grassOnly = mk(['.~.', '#~#']);
    expect(reach(grassOnly, { from: { x: 1, y: 1 }, aboard: true, modes: ['boat', 'foot'] }).has('0,0')).toBe(false);
    // Afloat only, the boat stays at sea.
    expect(reach(z, { from: { x: 2, y: 1 }, aboard: true }).has('4,1')).toBe(false);
  });

  it('reachPath: the fewest steps, each with how the hero gets about', () => {
    const z = mk(['|~~:']);
    const path = reachPath(z, (x) => x === 3, { modes: ['foot', 'boat'], boat: { x: 1, y: 0 } })!;
    expect(path.map((s) => `${s.x}${s.mode[0]}`)).toEqual(['0f', '1b', '2b', '3f']);
    expect(reachPath(z, (x) => x === 3)).toBeNull();
    expect(reachPath(z, (x) => x === 0)).toEqual([{ x: 0, y: 0, mode: 'foot' }]);
  });

  it('touches: a cell beside one reached', () => {
    const open = new Set(['1,1']);
    expect(touches(open, 1, 2)).toBe(true);
    expect(touches(open, 2, 2)).toBe(false);
  });

  it('on the real maps: Marlow’s dock reaches the Shallows’ edge by boat, Numbria’s lake stays land-locked', () => {
    const dawn = ZONES.dawnreach;
    const dock = { x: BOAT_HOME.x - 1, y: BOAT_HOME.y };
    const out = reach(dawn, { from: dock, modes: ['foot', 'boat'], boat: BOAT_HOME, flags: null });
    expect(out.has('79,30')).toBe(true);
    expect(out.has('13,8')).toBe(false);
  });

  it('no road on Dawnreach runs through a place: with every fog lifted, stopping at exits reaches the same open ground', () => {
    const dawn = ZONES.dawnreach;
    const lifted = Object.fromEntries((dawn.fogs ?? []).flatMap((f) => f.liftedBy.map((fl) => [fl, true])));
    const exits = new Set(dawn.exits.map((e) => `${e.x},${e.y}`));
    const pass = [...reach(dawn, { flags: lifted })].filter((c) => !exits.has(c));
    const stop = [...reach(dawn, { flags: lifted, exits: 'stop' })].filter((c) => !exits.has(c));
    expect(stop.sort()).toEqual(pass.sort());
  });
});

describe('safeSpawn on an exit (#75 item 14b)', () => {
  it('a save standing where stairs were drawn later steps off them onto open floor', () => {
    const b1 = ZONES['clockwork-depths'];
    const stairs = b1.exits.find((e) => tileAt(b1, e.x, e.y) === '>')!;
    const at = { x: stairs.x * TILE + TILE / 2, y: stairs.y * TILE + TILE / 2 };
    const p = safeSpawn(b1, at, {});
    const cell = { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
    expect(b1.exits.some((e) => e.x === cell.x && e.y === cell.y)).toBe(false);
    expect(Math.max(Math.abs(cell.x - stairs.x), Math.abs(cell.y - stairs.y))).toBeLessThanOrEqual(2);
    expect(p).not.toEqual({ x: b1.spawn.x * TILE + TILE / 2, y: b1.spawn.y * TILE + TILE / 2 });
  });

  it('a save on any exit of any map loads a few walkable steps off it (or, shut in by fog, at the spawn)', () => {
    for (const z of Object.values(ZONES)) {
      const shut = behindFog(z, {});
      for (const e of z.exits) {
        const p = safeSpawn(z, { x: e.x * TILE + 4, y: e.y * TILE + 4 }, {});
        const cell = { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
        const where = `${z.id} exit ${e.x},${e.y}`;
        expect(z.exits.some((o) => o.x === cell.x && o.y === cell.y), where).toBe(false);
        if (shut.has(`${e.x},${e.y}`)) {
          expect(cell, where).toEqual(z.spawn);
          continue;
        }
        const walk = reachPath(z, (x, y) => x === cell.x && y === cell.y, { from: e, flags: {}, gates: 'flags', exits: 'stop' });
        expect(walk, where).not.toBeNull();
        expect(walk!.length - 1, where).toBeLessThanOrEqual(EXIT_STEP_OFF);
      }
    }
  });

  it('never steps a save across a wall: the step off an exit is walked', () => {
    // An exit walled in on three sides, its fourth another exit; open floor just over the wall (0,0).
    const z = mk(['.#...', '#P#..', '#P#..', '#....'], {
      spawn: { x: 4, y: 0 },
      exits: [
        { x: 1, y: 1, to: 'dawnreach', spawnX: 0, spawnY: 0 },
        { x: 1, y: 2, to: 'dawnreach', spawnX: 0, spawnY: 0 },
      ],
    });
    // Not (0,0) behind the wall, not through the other exit: the spawn.
    expect(safeSpawn(z, { x: 1 * TILE + 16, y: 1 * TILE + 16 }, {})).toEqual({ x: 4 * TILE + 16, y: 16 });
    // From the lower exit, the floor below is a step away.
    expect(safeSpawn(z, { x: 1 * TILE + 16, y: 2 * TILE + 16 }, {})).toEqual({ x: 1 * TILE + 16, y: 3 * TILE + 16 });
  });

  it('a start off the map is dropped, not wrapped onto another cell', () => {
    const z = mk(['..', '..']);
    expect(reach(z, { from: { x: 2, y: 0 } }).size).toBe(0);
    expect(reach(z, { from: [{ x: 5, y: 5 }, { x: 0, y: 0 }] })).toEqual(new Set(['0,0', '1,0', '0,1', '1,1']));
  });
});
