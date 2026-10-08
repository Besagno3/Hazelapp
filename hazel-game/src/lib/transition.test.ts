import { describe, it, expect } from 'vitest';
import { edgeLinkProblem, exitSide, needsArrivalLock, slideFrom, transitionFor } from './transition';
import { ZONES, type ZoneDef, type ZoneExit, type ZoneId } from '../content/zones';

/** A bare test zone (real id, synthetic map + exits). */
function fixture(id: ZoneId, cols: number, rows: number, exits: ZoneExit[]): ZoneDef {
  return { ...ZONES[id], id, map: Array(rows).fill('.'.repeat(cols)), exits, buildings: [], npcs: [], enemies: [] };
}

describe('exitSide', () => {
  it('names the map edge an exit is on', () => {
    expect(exitSide(10, 0, 22, 14)).toBe('north');
    expect(exitSide(10, 13, 22, 14)).toBe('south');
    expect(exitSide(0, 6, 22, 14)).toBe('west');
    expect(exitSide(21, 6, 22, 14)).toBe('east');
  });
  it('is null for an exit inside the map', () => {
    expect(exitSide(5, 5, 22, 14)).toBeNull();
  });
});

describe('slideFrom', () => {
  it('brings the new screen in from the side the hero walks toward', () => {
    expect(slideFrom('east')).toEqual({ x: 1, y: 0 });
    expect(slideFrom('west')).toEqual({ x: -1, y: 0 });
    expect(slideFrom('north')).toEqual({ x: 0, y: -1 });
    expect(slideFrom('south')).toEqual({ x: 0, y: 1 });
  });
});

describe('edgeLinkProblem (#76)', () => {
  it('catches two zones that are each "north" of the other', () => {
    // The pre-fix Field ↔ Village shape (#76): both ways out are north exits.
    const field = fixture('whispering-woods', 6, 4, [{ x: 2, y: 0, to: 'lumina-village', spawnX: 3, spawnY: 1 }]);
    const village = fixture('lumina-village', 8, 5, [{ x: 3, y: 0, to: 'whispering-woods', spawnX: 2, spawnY: 1 }]);
    expect(edgeLinkProblem(field, field.exits[0], village)).toMatch(/north edge, not the south edge/);
  });

  it('catches an edge exit that lands far from the arrival edge', () => {
    const a = fixture('numbria', 8, 5, [{ x: 7, y: 2, to: 'verdara', spawnX: 5, spawnY: 2 }]);
    const b = fixture('verdara', 8, 5, [{ x: 0, y: 2, to: 'numbria', spawnX: 6, spawnY: 2 }]);
    expect(edgeLinkProblem(a, a.exits[0], b)).toMatch(/lands 5 cells from the west edge/);
  });

  it('accepts two zones linked on two different edges (only the way back you take counts)', () => {
    const a = fixture('numbria', 8, 5, [
      { x: 7, y: 2, to: 'verdara', spawnX: 1, spawnY: 2 }, // east → B's west edge
      { x: 3, y: 4, to: 'verdara', spawnX: 3, spawnY: 1 }, // south → B's north edge
    ]);
    const b = fixture('verdara', 8, 5, [
      { x: 0, y: 2, to: 'numbria', spawnX: 6, spawnY: 2 }, // west → A's east edge
      { x: 3, y: 0, to: 'numbria', spawnX: 3, spawnY: 3 }, // north → A's south edge
    ]);
    for (const e of a.exits) expect(edgeLinkProblem(a, e, b)).toBeNull();
    for (const e of b.exits) expect(edgeLinkProblem(b, e, a)).toBeNull();
  });

  it('skips links that fade: a town with several gates onto an overworld place icon', () => {
    // Phase 1 shape: both town gates lead out beside the town's icon; the
    // overworld's way in is an entrance in the middle of its map.
    const town = fixture('lumina-village', 8, 5, [
      { x: 0, y: 2, to: 'dawnreach', spawnX: 5, spawnY: 4 },
      { x: 7, y: 2, to: 'dawnreach', spawnX: 7, spawnY: 4 },
    ]);
    const overworld = fixture('dawnreach', 12, 8, [{ x: 6, y: 4, to: 'lumina-village', spawnX: 1, spawnY: 2 }]);
    for (const e of town.exits) expect(edgeLinkProblem(town, e, overworld)).toBeNull();
    expect(edgeLinkProblem(overworld, overworld.exits[0], town)).toBeNull();
  });

  it('reports a link with no way back', () => {
    const a = fixture('numbria', 8, 5, [{ x: 7, y: 2, to: 'verdara', spawnX: 1, spawnY: 2 }]);
    const b = fixture('verdara', 8, 5, []);
    expect(edgeLinkProblem(a, a.exits[0], b)).toMatch(/no way back/);
  });
});

describe('transitionFor (#75 Phase 1)', () => {
  it('slides between neighbouring screens joined edge to edge', () => {
    expect(transitionFor('east', 'field', 'field', false)).toBe('slide');
    expect(transitionFor('north', 'town', 'field', false)).toBe('slide');
  });
  it('fades into and out of places on the overworld', () => {
    expect(transitionFor(null, 'overworld', 'town', false)).toBe('fade'); // walking onto an icon
    expect(transitionFor('west', 'town', 'overworld', false)).toBe('fade'); // leaving a town gate
    expect(transitionFor(null, 'field', 'dungeon', false)).toBe('fade'); // any mid-map entrance
  });
  it('cuts instantly for players who prefer reduced motion', () => {
    expect(transitionFor('east', 'field', 'field', true)).toBe('cut');
    expect(transitionFor(null, 'overworld', 'town', true)).toBe('cut');
  });
});

describe('needsArrivalLock (#75 Phase 1 review)', () => {
  it('locks where you land beside a way back out: into or out of a place', () => {
    expect(needsArrivalLock(null, 'overworld', 'town')).toBe(true);
    expect(needsArrivalLock('north', 'town', 'overworld')).toBe(true);
  });
  it('never locks between edge-joined screens — whatever the motion setting, holding a key keeps you walking', () => {
    expect(needsArrivalLock('east', 'field', 'field')).toBe(false);
    expect(needsArrivalLock('south', 'field', 'dungeon')).toBe(false);
    // (Reduced motion turns these slides into cuts, but the lock follows the link.)
    expect(transitionFor('east', 'field', 'field', true)).toBe('cut');
  });
});
