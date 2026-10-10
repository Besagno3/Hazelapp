import { describe, it, expect } from 'vitest';
import {
  ZONES,
  ZONE_IDS,
  LEGEND_CHARS,
  WALKABLE_CHARS,
  BUILDING_CHARS,
  HUB_ZONE,
  TILE,
  VIEW_COLS,
  VIEW_ROWS,
  tileAt,
  gateIdAt,
  buildingAt,
  buildingInside,
  npcPresent,
  MET_ELDER,
  SEA_CHARS,
} from './zones';
import { edgeLinkProblem, exitSide } from '../lib/transition';
import { seaEntryCell } from '../lib/travel';
import { behindFog, reach, safeSpawn, touches } from '../lib/reach';
import { WANDER_TUNING } from '../lib/wander';
import { NPC_DEFS } from './npcs';
import { ENEMY_DEFS, fiendFor } from './enemies';
import { TOPIC_REGISTRY, actCrystals } from './topics';
import type { ZoneDef } from './zones';
import {
  ANY_CRYSTAL,
  chestTopicAt,
  fogAt,
  fogSeenFlag,
  fogsToReveal,
  placeAt,
  darkAt,
  litFlag,
  innOf,
  innWakeCell,
} from './zones';
import { RETURN_TOWNS } from './fieldSpells';
import { crystalFlag } from './topics';
import { CRYSTAL_TOPIC_IDS } from '../types';

const allZones = Object.values(ZONES);

function isWalkable(z: ZoneDef, x: number, y: number): boolean {
  return WALKABLE_CHARS.has(tileAt(z, x, y));
}

describe('zone registry (Wave 0.3)', () => {
  it('ZONES keys exactly match ZONE_IDS, each entry self-identifying', () => {
    expect(Object.keys(ZONES)).toEqual([...ZONE_IDS]);
    for (const [key, z] of Object.entries(ZONES)) {
      expect(z.id, `${key} id mismatch`).toBe(key);
    }
  });
});

describe('zone maps', () => {
  it('every row has the same width and only legend characters', () => {
    for (const z of allZones) {
      const width = z.map[0].length;
      for (const row of z.map) {
        expect(row.length, `${z.id} row width`).toBe(width);
        for (const ch of row) {
          expect(LEGEND_CHARS.has(ch), `${z.id} unknown tile '${ch}'`).toBe(true);
        }
      }
    }
  });

  it('default spawns are walkable', () => {
    for (const z of allZones) {
      expect(isWalkable(z, z.spawn.x, z.spawn.y), `${z.id} spawn`).toBe(true);
    }
  });

  it("every 'E' / 'P' / stairs tile has an exit entry and every exit lands on a walkable tile", () => {
    const exitChars = ['E', 'P', '>', '<'];
    for (const z of allZones) {
      for (let y = 0; y < z.map.length; y++) {
        for (let x = 0; x < z.map[y].length; x++) {
          if (exitChars.includes(z.map[y][x])) {
            const exit = z.exits.find((e) => e.x === x && e.y === y);
            expect(exit, `${z.id} ${z.map[y][x]} at ${x},${y} missing exit def`).toBeDefined();
          }
        }
      }
      for (const exit of z.exits) {
        expect(exitChars, `${z.id} exit tile ${exit.x},${exit.y}`).toContain(tileAt(z, exit.x, exit.y));
        const target = ZONES[exit.to];
        expect(target, `${z.id} exit target ${exit.to}`).toBeDefined();
        expect(
          isWalkable(target, exit.spawnX, exit.spawnY),
          `${z.id} → ${exit.to} spawn ${exit.spawnX},${exit.spawnY}`,
        ).toBe(true);
      }
    }
  });

  it('NPC and enemy placements reference known defs on walkable tiles', () => {
    for (const z of allZones) {
      for (const p of z.npcs) {
        expect(NPC_DEFS[p.defId], `${z.id} npc ${p.defId}`).toBeDefined();
        expect(isWalkable(z, p.x, p.y), `${z.id} npc ${p.defId} at ${p.x},${p.y}`).toBe(true);
      }
      for (const p of z.enemies) {
        expect(ENEMY_DEFS[p.defId], `${z.id} enemy ${p.defId}`).toBeDefined();
        expect(isWalkable(z, p.x, p.y), `${z.id} enemy ${p.defId} at ${p.x},${p.y}`).toBe(true);
      }
    }
  });

  it('every topic has a zone with its fiend placed in it', () => {
    for (const t of TOPIC_REGISTRY) {
      const z = ZONES[t.zoneId];
      expect(z.topic).toBe(t.id);
      const fiend = fiendFor(t.id);
      expect(
        z.enemies.some((e) => e.defId === fiend.id),
        `${z.id} must place ${fiend.id}`,
      ).toBe(true);
    }
  });

  it('zone enemies match the zone topic (the overworld hosts roaming critters, never bosses)', () => {
    for (const z of allZones) {
      for (const p of z.enemies) {
        if (z.kind === 'overworld') {
          // Critters wander out from the regions around them (#75 Phase 1).
          expect(ENEMY_DEFS[p.defId].isBoss ?? false, `${z.id} boss ${p.defId}`).toBe(false);
        } else {
          expect(ENEMY_DEFS[p.defId].topic, `${z.id} enemy ${p.defId} topic`).toBe(z.topic);
        }
      }
    }
  });

  it("every gate and chest has a topic for its question: its zone's, or (a chest) its fog bank's", () => {
    for (const z of allZones) {
      if (z.topic) continue;
      z.map.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          expect(ch === 'G', `${z.id} has a gate at ${x},${y} but no topic`).toBe(false);
          if (ch === 'C') {
            const bank = z.fogs?.find((f) => f.guards.x === x && f.guards.y === y);
            expect(bank?.chestTopic, `${z.id} chest at ${x},${y} has no topic`).toBeDefined();
          }
        }),
      );
    }
  });

  it('every gate is a double-wide opening sharing one identity', () => {
    for (const z of allZones) {
      // Group every 'G' tile by its canonical gate id.
      const groups = new Map<string, Array<{ x: number; y: number }>>();
      for (let y = 0; y < z.map.length; y++) {
        for (let x = 0; x < z.map[y].length; x++) {
          if (z.map[y][x] !== 'G') continue;
          const id = gateIdAt(z.id, z.map, x, y);
          (groups.get(id) ?? groups.set(id, []).get(id)!).push({ x, y });
        }
      }
      for (const [id, cells] of groups) {
        expect(cells.length, `${z.id} gate ${id} should span 2 tiles`).toBe(2);
        const [a, b] = cells;
        const adjacent = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
        expect(adjacent, `${z.id} gate ${id} tiles must be adjacent`).toBe(true);
      }
    }
  });

  it('keyGate cells resolve to a real gate group', () => {
    for (const z of allZones) {
      if (!z.keyGate) continue;
      expect(tileAt(z, z.keyGate.x, z.keyGate.y), `${z.id} keyGate must sit on a 'G'`).toBe('G');
      // The whole gate (both tiles) shares the keyGate's identity.
      const id = gateIdAt(z.id, z.map, z.keyGate.x, z.keyGate.y);
      expect(id, `${z.id} keyGate id`).toContain(':gate:');
    }
  });

  it('home is Lumina Village, safe (no enemies) — Lumina Field is retired (#75 item 8)', () => {
    expect(HUB_ZONE).toBe('lumina-village');
    const home = ZONES[HUB_ZONE];
    expect(home.enemies).toHaveLength(0);
    expect(Object.keys(ZONES)).not.toContain('lumina-field');
    // The Field's people and buildings moved in.
    expect(home.buildings!.map((b) => b.name)).toEqual(expect.arrayContaining(['Lumina Library', "Maple's Trading Post"]));
    for (const id of ['elder-lumen', 'hub-librarian', 'hub-merchant', 'hub-kid']) {
      expect(home.npcs.map((n) => n.defId), id).toContain(id);
    }
    // A new game (and a defeated hero) starts on open ground in town, not at a gate.
    expect(isWalkable(home, home.spawn.x, home.spawn.y)).toBe(true);
    expect(home.exits.some((e) => Math.abs(e.x - home.spawn.x) + Math.abs(e.y - home.spawn.y) <= 3)).toBe(false);
  });

  it('each crystal region is a place at its own corner of Dawnreach, and leads only back onto it (#75 item 8)', () => {
    const dawn = ZONES.dawnreach;
    const [w, h] = [dawn.map[0].length, dawn.map.length];
    const corners = new Set<string>();
    // Act I's crystals (#75 item 14c): later acts' crystals live past the sea.
    for (const t of actCrystals(1)) {
      const exit = dawn.exits.find((e) => e.to === t.zoneId);
      expect(exit, `${t.zoneId} is entered from Dawnreach`).toBeDefined();
      const { x, y } = exit!;
      const corner = `${x < w / 3 ? 'west' : x >= (2 * w) / 3 ? 'east' : 'middle'}-${y < h / 3 ? 'north' : y >= (2 * h) / 3 ? 'south' : 'middle'}`;
      expect(corner, `${t.zoneId} at ${x},${y}`).not.toContain('middle');
      corners.add(corner);
      expect(new Set(ZONES[t.zoneId].exits.map((e) => e.to)), t.zoneId).toEqual(new Set(['dawnreach']));
    }
    expect(corners.size).toBe(actCrystals(1).length);
  });

  it('every zone is reachable from the hub by walking exits (or sailing across a sea link, #75 item 14)', () => {
    const seen = new Set<string>([HUB_ZONE]);
    const queue: string[] = [HUB_ZONE];
    while (queue.length) {
      const id = queue.shift()!;
      const z = ZONES[id as keyof typeof ZONES];
      for (const to of [...z.exits.map((e) => e.to), ...(z.seaLinks ?? []).map((l) => l.to)]) {
        if (!seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
    for (const id of Object.keys(ZONES)) {
      expect(seen.has(id), `${id} unreachable from hub`).toBe(true);
    }
  });

  it('every exit can be walked back (zones are not one-way traps)', () => {
    for (const z of allZones) {
      for (const exit of z.exits) {
        const back = ZONES[exit.to].exits.some((e) => e.to === z.id);
        expect(back, `${z.id} → ${exit.to} has no return exit`).toBe(true);
      }
    }
  });
});

describe('town buildings (#72)', () => {
  const withBuildings = allZones.filter((z) => z.buildings?.length);

  it('the village is a town with enterable buildings', () => {
    expect(ZONES['lumina-village'].buildings?.length).toBeGreaterThanOrEqual(4);
  });

  it('every map is at least one screen (the camera clamps to the map)', () => {
    for (const z of allZones) {
      expect(z.map[0].length, `${z.id} cols`).toBeGreaterThanOrEqual(VIEW_COLS);
      expect(z.map.length, `${z.id} rows`).toBeGreaterThanOrEqual(VIEW_ROWS);
    }
  });

  it('each building is a closed wall rect with exactly one facade door', () => {
    for (const z of withBuildings) {
      for (const b of z.buildings!) {
        let doors = 0;
        for (let y = b.y; y < b.y + b.h; y++) {
          for (let x = b.x; x < b.x + b.w; x++) {
            const ch = tileAt(z, x, y);
            const edge = y === b.y || y === b.y + b.h - 1 || x === b.x || x === b.x + b.w - 1;
            const corner = (x === b.x || x === b.x + b.w - 1) && (y === b.y || y === b.y + b.h - 1);
            if (ch === 'D') {
              doors++;
              expect(y, `${b.id} door must be in the facade row`).toBe(b.y + b.h - 1);
              expect(corner, `${b.id} door not in a corner`).toBe(false);
            } else if (edge) {
              expect(ch, `${b.id} wall at ${x},${y}`).toBe('W');
            } else {
              expect('FKBTZ'.includes(ch), `${b.id} interior ${ch} at ${x},${y}`).toBe(true);
            }
          }
        }
        expect(doors, `${b.id} doors`).toBe(1);
      }
    }
  });

  it('building tiles only appear inside a building', () => {
    for (const z of allZones) {
      z.map.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (BUILDING_CHARS.has(ch)) expect(buildingAt(z, x, y), `${z.id} stray ${ch} at ${x},${y}`).not.toBeNull();
        }),
      );
    }
  });

  it('every door is reachable from the spawn, and every indoor NPC can be talked to', () => {
    for (const z of withBuildings) {
      const open = reach(z, { flags: null });
      for (const b of z.buildings!) {
        const fy = b.y + b.h - 1;
        const dx = z.map[fy].indexOf('D', b.x);
        expect(open.has(`${dx},${fy}`), `${b.id} door reachable`).toBe(true);
      }
      for (const p of z.npcs) {
        if (!buildingAt(z, p.x, p.y)) continue;
        const direct = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => open.has(`${p.x + ox},${p.y + oy}`));
        // …or across a counter: counter next to the NPC with a reachable cell beyond it.
        const viaCounter = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(
          ([ox, oy]) => tileAt(z, p.x + ox, p.y + oy) === 'K' && open.has(`${p.x + 2 * ox},${p.y + 2 * oy}`),
        );
        expect(direct || viaCounter, `${z.id} ${p.defId} reachable`).toBe(true);
      }
    }
  });

  it('buildingInside is the interior only; buildingAt includes the walls', () => {
    const z = ZONES['lumina-village'];
    const b = z.buildings![0];
    expect(buildingInside(z, b.x + 1, b.y + 1)?.id).toBe(b.id);
    expect(buildingInside(z, b.x, b.y + 1)).toBeNull();
    expect(buildingInside(z, b.x + 1, b.y + b.h - 1)).toBeNull(); // facade/door row
    expect(buildingAt(z, b.x, b.y)?.id).toBe(b.id);
    expect(buildingAt(z, b.x - 1, b.y)).toBeNull();
  });
});

describe('safeSpawn', () => {
  const z = ZONES['lumina-village'];
  const spawnPx = { x: z.spawn.x * TILE + TILE / 2, y: z.spawn.y * TILE + TILE / 2 };
  it('keeps a walkable saved position', () => {
    const pos = { x: 21 * TILE + 5, y: 5 * TILE + 5 };
    expect(safeSpawn(z, pos)).toEqual(pos);
  });
  it('falls back to the zone spawn for walls, off-map or missing positions', () => {
    expect(safeSpawn(z, { x: 4 * TILE + 5, y: 3 * TILE + 5 })).toEqual(spawnPx); // a wall
    expect(safeSpawn(z, { x: -50, y: 9999 })).toEqual(spawnPx);
    expect(safeSpawn(z, null)).toEqual(spawnPx);
  });
});

describe('zone exits slide (Zelda-style transition)', () => {
  it("edge exits ('E') sit on a map edge; place entrances ('P') sit inside the map", () => {
    for (const z of allZones) {
      for (const e of z.exits) {
        const side = exitSide(e.x, e.y, z.map[0].length, z.map.length);
        if (tileAt(z, e.x, e.y) === 'E') expect(side, `${z.id} exit ${e.x},${e.y}`).not.toBeNull();
        else expect(side, `${z.id} place ${e.x},${e.y}`).toBeNull();
      }
    }
  });

  // #76: the Field and the Village used to be "north" of each other — you
  // walked north to go either way, and the screen slid north both ways.
  // `edgeLinkProblem` (lib/transition.test.ts covers its edge cases).
  it('walking out one edge brings you in through the opposite edge, and back the same way', () => {
    // Collect them all so a failure lists every broken link with its full reason.
    const problems = allZones.flatMap((z) => z.exits.map((e) => edgeLinkProblem(z, e, ZONES[e.to])));
    expect(problems.filter(Boolean)).toEqual([]);
  });
});

describe('every place is unique (#73)', () => {
  const placed = allZones.flatMap((z) => z.npcs.map((p) => ({ z, p, def: NPC_DEFS[p.defId] })));

  it('there is exactly one Library in the world', () => {
    const defs = Object.values(NPC_DEFS).filter((n) => n.role === 'librarian');
    expect(defs.length).toBe(1);
    expect(placed.filter((x) => x.def.role === 'librarian').length).toBe(1);
  });

  // #75 item 11 (reverses #73's one-inn rule, decided 2026-10-05).
  it('every town has exactly one inn, with its own innkeeper inside; nowhere else has one', () => {
    for (const z of allZones) {
      const inns = (z.buildings ?? []).filter((b) => b.sign === 'inn');
      const keepers = placed.filter((x) => x.z.id === z.id && x.def.role === 'innkeeper');
      const isTown = (RETURN_TOWNS as readonly string[]).includes(z.id);
      expect(inns.length, `${z.id} inns`).toBe(isTown ? 1 : 0);
      expect(keepers.length, `${z.id} innkeepers`).toBe(isTown ? 1 : 0);
      if (isTown) expect(buildingInside(z, keepers[0].p.x, keepers[0].p.y)?.id, `${z.id} innkeeper indoors`).toBe(inns[0].id);
    }
  });

  it('a defeated hero wakes just inside their inn — on its floor, with the street outside the door', () => {
    for (const id of RETURN_TOWNS) {
      const z = ZONES[id];
      const cell = innWakeCell(z)!;
      expect(cell, id).not.toBeNull();
      expect(tileAt(z, cell.x, cell.y), `${id} wakes on the inn floor`).toBe('F');
      expect(buildingInside(z, cell.x, cell.y)?.id).toBe(innOf(z)!.id);
      const door = { x: cell.x, y: cell.y + 1 };
      expect(tileAt(z, door.x, door.y)).toBe('D');
      // Out of the door and into town: the town's own front door is walkable from there.
      const around = reach(z, { from: door, flags: null });
      const out = z.exits.filter((e) => ZONES[e.to].kind === 'overworld');
      expect(out.some((e) => around.has(`${e.x},${e.y}`)), `${id}: from the inn you can walk out of town`).toBe(true);
    }
  });

  it('every town has 8+ people, and someone a new hero can talk to names another place (the rumor network)', () => {
    const places = allZones.filter((z) => z.kind !== 'overworld').map((z) => z.name.replace(/^The /, ''));
    for (const id of RETURN_TOWNS) {
      const z = ZONES[id];
      const people = new Set(z.npcs.map((p) => p.defId).filter((d) => !NPC_DEFS[d].signpost));
      expect(people.size, `${id} people`).toBeGreaterThanOrEqual(8);
      const pointsOnward = [...people].some((d) =>
        NPC_DEFS[d].lines.some((l) => {
          if (typeof l !== 'string' && l.ifFlag) return false;
          const text = typeof l === 'string' ? l : l.text;
          return places.some((name) => name !== z.name.replace(/^The /, '') && text.includes(name));
        }),
      );
      expect(pointsOnward, `${id}: someone names another place`).toBe(true);
    }
  });

  it('no NPC is ever in two places at once: one placed twice hands over on a flag (#75 item 8)', () => {
    const byDef = new Map<string, typeof placed>();
    for (const x of placed) byDef.set(x.p.defId, [...(byDef.get(x.p.defId) ?? []), x]);
    for (const [id, spots] of byDef) {
      if (spots.length === 1) continue;
      const flagNames = [...new Set(spots.flatMap(({ p }) => [p.ifFlag, p.unlessFlag].filter(Boolean) as string[]))];
      expect(flagNames.length, `${id} hands over on one flag`).toBe(1);
      for (const on of [false, true]) {
        const present = spots.filter(({ p }) => npcPresent(p, { [flagNames[0]]: on }));
        expect(present.length, `${id} with ${flagNames[0]}=${on}`).toBe(1);
      }
    }
  });

  it('Elder Lumen greets a new hero on the plaza, then keeps the Library (#75 item 8)', () => {
    const home = ZONES[HUB_ZONE];
    const lumen = home.npcs.filter((p) => p.defId === 'elder-lumen');
    const plaza = lumen.find((p) => npcPresent(p, {}))!;
    const later = lumen.find((p) => npcPresent(p, { [MET_ELDER]: true }))!;
    expect(Math.max(Math.abs(plaza.x - home.spawn.x), Math.abs(plaza.y - home.spawn.y))).toBeLessThanOrEqual(3);
    expect(buildingInside(home, plaza.x, plaza.y)).toBeNull();
    expect(buildingInside(home, later.x, later.y)?.id).toBe('lumina-library');
    expect(NPC_DEFS['elder-lumen'].lines[0]).toMatchObject({ unlessFlag: MET_ELDER, setFlag: MET_ELDER });
  });

  it('every merchant, sage, innkeeper and librarian works inside a building', () => {
    for (const { z, p, def } of placed) {
      // Shrine keepers (#75 item 9) keep their open-air shrine.
      if (def.role === 'villager' || def.role === 'keeper') continue;
      expect(buildingInside(z, p.x, p.y), `${def.id} in ${z.id}`).not.toBeNull();
    }
  });

  it('each place builds in its own architecture style', () => {
    const styleOwner = new Map<string, string>();
    for (const z of allZones) {
      const styles = new Set((z.buildings ?? []).map((b) => b.style));
      expect(styles.size, `${z.id} mixes styles`).toBeLessThanOrEqual(1);
      for (const st of styles) {
        expect(styleOwner.get(st) ?? z.id, `style ${st} reused`).toBe(z.id);
        styleOwner.set(st, z.id);
      }
    }
  });

  it('building names and ids are unique across the world', () => {
    const bs = allZones.flatMap((z) => z.buildings ?? []);
    expect(new Set(bs.map((b) => b.id)).size).toBe(bs.length);
    expect(new Set(bs.map((b) => b.name)).size).toBe(bs.length);
  });
});

describe('overworld helpers (#75 Phase 1)', () => {
  const base = ZONES['lumina-village'];
  const z: ZoneDef = {
    ...base,
    map: ['....', '..P.', '....'],
    places: [{ x: 2, y: 1, icon: 'cave', name: 'A Cave' }],
    fogs: [
      { id: 'f', x: 0, y: 0, w: 2, h: 2, liftedBy: ['a', 'b'], hint: 'Too foggy!', guards: { x: 3, y: 0 }, lifted: 'Gone!' },
    ],
  };
  it('fogAt covers its rectangle until any one of its flags is set', () => {
    expect(fogAt(z, 0, 0, {})?.id).toBe('f');
    expect(fogAt(z, 1, 1, {})?.id).toBe('f');
    expect(fogAt(z, 2, 0, {})).toBeNull();
    expect(fogAt(z, 0, 0, { b: true })).toBeNull();
    expect(fogAt(z, 0, 0, { a: false })?.id).toBe('f');
  });
  it('placeAt finds the place on an entrance tile', () => {
    expect(placeAt(z, 2, 1)?.name).toBe('A Cave');
    expect(placeAt(z, 1, 1)).toBeNull();
  });
  it('ANY_CRYSTAL lists every crystal flag', () => {
    expect(ANY_CRYSTAL).toEqual(CRYSTAL_TOPIC_IDS.map((t) => `crystal-${t}-restored`));
  });
});

describe('Dawnreach, the overworld (#75 Phase 1)', () => {
  const overworlds = allZones.filter((z) => z.kind === 'overworld');
  const dawn = ZONES.dawnreach;

  const allLifted = Object.fromEntries(ANY_CRYSTAL.map((f) => [f, true]));
  /** Cells reachable on foot from the spawn, with fog blocking unless `lifted`. */
  const onFoot = (z: ZoneDef, lifted: boolean) => reach(z, { flags: lifted ? allLifted : {} });

  it('is an overworld with places (and the Silver Shallows, the sea beyond it, #75 item 14)', () => {
    expect(overworlds.map((z) => z.id)).toEqual(['dawnreach', 'silver-shallows']);
    expect(dawn.places?.length).toBeGreaterThanOrEqual(8);
  });

  it("every 'P' tile is a place with an exit, and each place is named after the zone it leads to", () => {
    for (const z of allZones) {
      const pTiles = z.map.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === 'P' ? [[x, y]] : [])));
      expect(pTiles.length, `${z.id} P tiles vs places`).toBe(z.places?.length ?? 0);
      for (const p of z.places ?? []) {
        expect(tileAt(z, p.x, p.y), `${z.id} place ${p.name}`).toBe('P');
        const exit = z.exits.find((e) => e.x === p.x && e.y === p.y);
        expect(exit, `${p.name} has an exit`).toBeDefined();
        expect(p.name).toBe(ZONES[exit!.to].name);
      }
    }
  });

  it('on foot, every place is reachable — except the ones a fog bank guards, until it lifts', () => {
    const down = onFoot(dawn, false);
    const up = onFoot(dawn, true);
    const guarded = new Set((dawn.fogs ?? []).map((f) => `${f.guards.x},${f.guards.y}`));
    expect(dawn.places!.filter((p) => guarded.has(`${p.x},${p.y}`)).map((p) => p.name).sort()).toEqual([
      'Shrine of First Light',
      'The Crystal Spire',
    ]);
    for (const p of dawn.places!) {
      expect(up.has(`${p.x},${p.y}`), `${p.name} reachable once the fog lifts`).toBe(true);
      expect(down.has(`${p.x},${p.y}`), `${p.name} reachable through the fog?`).toBe(!guarded.has(`${p.x},${p.y}`));
    }
  });

  it('every gate onto the overworld lands right beside its own icon, on open ground you can walk from', () => {
    const roam = onFoot(dawn, true);
    for (const z of allZones) {
      for (const e of z.exits.filter((x) => x.to === 'dawnreach')) {
        const icon = dawn.places!.find((p) => dawn.exits.some((x) => x.x === p.x && x.y === p.y && x.to === z.id));
        expect(icon, `${z.id} has an icon on Dawnreach`).toBeDefined();
        const gap = Math.max(Math.abs(e.spawnX - icon!.x), Math.abs(e.spawnY - icon!.y));
        expect(gap, `${z.id} gate ${e.x},${e.y} lands ${gap} from its icon`).toBeLessThanOrEqual(2);
        expect(gap, `${z.id} gate lands ON its icon`).toBeGreaterThan(0);
        expect(roam.has(`${e.spawnX},${e.spawnY}`), `${z.id} landing spot is connected`).toBe(true);
      }
    }
  });

  it("no critter can wander up to a doorstep: you never step out of a place into a fight (#75 item 8)", () => {
    const reach = WANDER_TUNING.enemy.leashTiles;
    const landings = allZones.flatMap((z) => z.exits.filter((e) => e.to === 'dawnreach').map((e) => ({ from: z.id, x: e.spawnX, y: e.spawnY })));
    for (const foe of dawn.enemies) {
      expect(isWalkable(dawn, foe.x, foe.y), `${foe.defId} at ${foe.x},${foe.y} stands on open ground`).toBe(true);
      for (const l of landings) {
        const gap = Math.max(Math.abs(foe.x - l.x), Math.abs(foe.y - l.y));
        expect(gap, `${foe.defId} at ${foe.x},${foe.y} vs ${l.from}'s doorstep ${l.x},${l.y}`).toBeGreaterThan(reach + 1);
      }
    }
  });

  it('fog banks sit inside the map, cover walkable ground, and are lifted by real flags', () => {
    for (const z of allZones) {
      for (const f of z.fogs ?? []) {
        expect(f.liftedBy.length, `${f.id} lifted by something`).toBeGreaterThan(0);
        expect(f.x >= 0 && f.y >= 0 && f.x + f.w <= z.map[0].length && f.y + f.h <= z.map.length, f.id).toBe(true);
        // Ground you could walk — or sea a boat could sail (#75 item 14).
        let walkable = 0;
        for (let y = f.y; y < f.y + f.h; y++)
          for (let x = f.x; x < f.x + f.w; x++) if (isWalkable(z, x, y) || SEA_CHARS.has(tileAt(z, x, y))) walkable++;
        expect(walkable, `${f.id} blocks a real path`).toBeGreaterThan(0);
        expect(f.hint.length).toBeGreaterThan(0);
        expect(f.lifted.length).toBeGreaterThan(0);
      }
    }
  });

  // #75 item 7: each bank keeps you from one thing, which you can then reach.
  it('each fog bank shuts its reward away until one of its own flags lifts it', () => {
    for (const z of allZones) {
      for (const f of z.fogs ?? []) {
        const key = `${f.guards.x},${f.guards.y}`;
        // A bank out at sea (#75 item 14) keeps the boat from the water beyond it.
        if (SEA_CHARS.has(tileAt(z, f.guards.x, f.guards.y))) {
          const entry = (z.seaLinks ?? []).map((l) => seaEntryCell(z, l.side)).find((c) => c !== null)!;
          expect(entry, `${z.id} has a way in by sea`).toBeTruthy();
          const bySea = (flags: Record<string, boolean>) => reach(z, { from: entry, aboard: true, flags }).has(key);
          expect(bySea({}), `${f.id}: sea beyond it reachable through the fog`).toBe(false);
          for (const flag of f.liftedBy) expect(bySea({ [flag]: true }), `${f.id}: ${flag} opens the way`).toBe(true);
          continue;
        }
        expect(isWalkable(z, f.guards.x, f.guards.y) || tileAt(z, f.guards.x, f.guards.y) === 'C', `${f.id} guards something real`).toBe(true);
        // Reach the reward by its neighbours (a chest is bumped, not stood on).
        const reached = (flags: Record<string, boolean>) => {
          const open = reach(z, { flags });
          return open.has(key) || touches(open, f.guards.x, f.guards.y);
        };
        expect(reached({}), `${f.id}: reward reachable through the fog`).toBe(false);
        for (const flag of f.liftedBy) {
          expect(reached({ [flag]: true }), `${f.id}: ${flag} opens the way`).toBe(true);
        }
      }
    }
  });

  it('every Act I crystal clears exactly one pocket of its own, with a chest on its topic inside', () => {
    for (const topic of actCrystals(1).map((t) => t.id)) {
      const own = (dawn.fogs ?? []).filter((f) => f.liftedBy.length === 1 && f.liftedBy[0] === crystalFlag(topic));
      expect(own.length, topic).toBe(1);
      const f = own[0];
      expect(tileAt(dawn, f.guards.x, f.guards.y), `${f.id} guards a chest`).toBe('C');
      expect(f.chestTopic).toBe(topic);
      expect(chestTopicAt(dawn, f.guards.x, f.guards.y)).toBe(topic);
      expect(f.hint).toContain(TOPIC_REGISTRY.find((t) => t.id === topic)!.crystalName);
    }
    expect(chestTopicAt(ZONES.numbria, 0, 0)).toBe('math');
  });

  it('a bank waits to be shown: lifted, not yet seen → revealed once', () => {
    const math = { [crystalFlag('math')]: true };
    const ids = (flags: Record<string, boolean>) => fogsToReveal(dawn, flags).map((f) => f.id).sort();
    expect(ids({})).toEqual([]);
    expect(ids(math)).toEqual(['math-fog', 'shrine-fog', 'spire-fog']);
    expect(ids({ ...math, [fogSeenFlag('spire-fog')]: true })).toEqual(['math-fog', 'shrine-fog']);
  });

  it('a save shut in behind fog — or standing in it — starts at the zone spawn instead', () => {
    const spawnPx = { x: dawn.spawn.x * TILE + TILE / 2, y: dawn.spawn.y * TILE + TILE / 2 };
    const px = (x: number, y: number) => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
    // Inside the math pocket, beside its chest; and inside the Spire's fog, where its gate lands.
    expect(safeSpawn(dawn, px(20, 15), {})).toEqual(spawnPx);
    expect(safeSpawn(dawn, px(40, 44), {})).toEqual(spawnPx);
    expect(behindFog(dawn, {}).has('40,44')).toBe(true);
    // Once lifted, both are fine places to stand; out in the open always was.
    expect(safeSpawn(dawn, px(20, 15), { [crystalFlag('math')]: true })).toEqual(px(20, 15));
    expect(safeSpawn(dawn, px(40, 44), { [crystalFlag('science')]: true })).toEqual(px(40, 44));
    expect(safeSpawn(dawn, px(48, 36), {})).toEqual(px(48, 36));
  });
});

describe('dark places (#75 item 9)', () => {
  const dark = allZones.filter((z) => z.dark);
  const lit = (z: ZoneDef) => ({ [litFlag(z.id)]: true });

  it('the Echo Mine (pitch dark past its door) and the Gear Halls (dim, #75 item 10) — both underground', () => {
    expect(dark.map((z) => z.id).sort()).toEqual(['clockwork-depths-b2', 'echo-mine']);
    for (const z of dark) expect(z.kind).toBe('dungeon');
    // The mine waits for Glow; the Gear Halls are on the way to the Titan, so
    // they're only dim — wide enough to cross without a light.
    expect(ZONES['echo-mine'].dark!.dim).toBeUndefined();
    expect(ZONES['clockwork-depths-b2'].dark!.dim).toBeGreaterThanOrEqual(150);
  });

  it('its pitch dark sits inside the map over walkable ground', () => {
    for (const z of dark) {
      for (const r of z.dark!.pitch) {
        expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= z.map[0].length && r.y + r.h <= z.map.length, z.id).toBe(true);
        let walkable = 0;
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (isWalkable(z, x, y)) walkable++;
        expect(walkable, `${z.id} pitch covers a way through`).toBeGreaterThan(0);
      }
    }
  });

  it('shuts its chest away until Glow lights the place, then lets you reach it', () => {
    for (const z of dark) {
      const { x, y } = z.dark!.guards;
      expect(tileAt(z, x, y), `${z.id} guards a chest`).toBe('C');
      expect(z.topic, `${z.id}'s chest has a topic`).toBeDefined();
      expect(touches(reach(z, { flags: {} }), x, y), `${z.id} unlit`).toBe(false);
      expect(touches(reach(z, { flags: lit(z) }), x, y), `${z.id} lit`).toBe(true);
    }
  });

  it('the dark is only a wall until it is lit; a lit place is open everywhere', () => {
    const mine = ZONES['echo-mine'];
    const r = mine.dark!.pitch[0];
    expect(darkAt(mine, r.x, r.y, {})).toBe(true);
    expect(darkAt(mine, r.x, r.y, lit(mine))).toBe(false);
    expect(darkAt(ZONES.dawnreach, 10, 10, {})).toBe(false);
    // Lit, every walkable cell is reachable from the door (nothing left behind).
    const open = reach(mine, { flags: lit(mine) });
    const walkable = mine.map.flatMap((row, y) => [...row].map((_, x) => [x, y])).filter(([x, y]) => isWalkable(mine, x, y));
    expect(walkable.filter(([x, y]) => !open.has(`${x},${y}`))).toEqual([]);
  });

  it('the hero waits outside the dark: the door, the spawn and Miner Mabel are in the light', () => {
    const mine = ZONES['echo-mine'];
    const open = reach(mine, { flags: {} });
    for (const e of mine.exits) expect(open.has(`${e.x},${e.y}`)).toBe(true);
    const mabel = mine.npcs.find((p) => p.defId === 'mine-miner')!;
    expect(open.has(`${mabel.x},${mabel.y}`)).toBe(true);
  });
});
