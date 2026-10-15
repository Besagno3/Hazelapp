import { describe, it, expect } from 'vitest';
import {
  GREAT_FOGBANK,
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
import { edgeCrossing, flownLink, seaEntryCell } from '../lib/travel';
import { behindFog, reach, reachPath, safeSpawn, touches } from '../lib/reach';
import { zoneTier } from './regions';
import { WANDER_TUNING } from '../lib/wander';
import { NPC_DEFS, isThing, lineText, npcEmoji, npcSpriteId, visibleLines } from './npcs';
import { HALL_DEDICATED } from './spells';
import { BOSS_BADGES, ENEMY_DEFS, fiendFor } from './enemies';
import { BLANK_CHART_HELD, NAME_LEARNED, JUNO_CAME, JUNO_QUEST, JUNO_WALK, RESO_STONES, YARN_QUEST, YARN_STONES, POSY_QUEST, POSY_SAILED, POSY_WALK, questDoneFlag, questOfferedFlag, stepFlag } from './questFlags';
import { QUESTS } from './quests';
import { TOPIC_REGISTRY, actCrystals } from './topics';
import { BOAT_HOME } from './boat';
import { landable } from '../lib/travel';
import type { ZoneDef } from './zones';
import {
  ANY_CRYSTAL,
  chestTopicAt,
  topicAt,
  fogAt,
  fogSeenFlag,
  fogsToReveal,
  placeKnown,
  placeAt,
  darkAt,
  litFlag,
  INN_ONLY,
  innOf,
  innWakeCell,
  shelterOf,
} from './zones';
import { RETURN_TOWNS } from './fieldSpells';
import { crystalFlag } from './topics';
import { CRYSTAL_TOPIC_IDS } from '../types';
import { ACT2_SEEN, ACT4_SEEN, FLIGHT_FLAG, HALL_CALLED, MET_GALE, MET_ROOT_AURORA, canFly } from './story';
import { holdsKeysFor, keyFlag, keysForZone } from './keys';

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

  it('NPC and enemy placements reference known defs — on walkable tiles, or (a sea critter, #75 item 14d) open sea', () => {
    for (const z of allZones) {
      for (const p of z.npcs) {
        expect(NPC_DEFS[p.defId], `${z.id} npc ${p.defId}`).toBeDefined();
        expect(isWalkable(z, p.x, p.y), `${z.id} npc ${p.defId} at ${p.x},${p.y}`).toBe(true);
      }
      for (const p of z.enemies) {
        expect(ENEMY_DEFS[p.defId], `${z.id} enemy ${p.defId}`).toBeDefined();
        const ok = ENEMY_DEFS[p.defId].habitat === 'sea' ? SEA_CHARS.has(tileAt(z, p.x, p.y)) : isWalkable(z, p.x, p.y);
        expect(ok, `${z.id} enemy ${p.defId} at ${p.x},${p.y}`).toBe(true);
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
        } else if (z.topics) {
          // A mixed-topic zone (#75 item 16b): each critter brings one of its topics.
          expect(z.topics, `${z.id} enemy ${p.defId} topic`).toContain(ENEMY_DEFS[p.defId].topic);
        } else {
          expect(ENEMY_DEFS[p.defId].topic, `${z.id} enemy ${p.defId} topic`).toBe(z.topic);
        }
      }
    }
  });

  it("every gate and chest has a topic for its question: its zone's, or (a chest) its fog bank's", () => {
    for (const z of allZones) {
      if (z.topic || z.topics?.length) continue;
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
      // …and the Dream Root Door's (#75 item 16a), an inn Return doesn't fly to (`INN_ONLY`).
      const isTown = (RETURN_TOWNS as readonly string[]).includes(z.id) || INN_ONLY.includes(z.id);
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
      // People, not things: no signposts, quest boards or lanterns (15c review).
      const people = new Set(z.npcs.map((p) => p.defId).filter((d) => !NPC_DEFS[d].signpost && !NPC_DEFS[d].prop));
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

  it('no NPC is ever in two places at once: one placed twice hands over on a flag (#75 items 8, 14g)', () => {
    const byDef = new Map<string, typeof placed>();
    for (const x of placed) byDef.set(x.p.defId, [...(byDef.get(x.p.defId) ?? []), x]);
    // The flags turn on one at a time, in story order — some order where they're
    // always in exactly one place (Posy: offered → at the stone → done, #75 item 14g).
    const orders = (xs: string[]): string[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x) => orders(xs.filter((y) => y !== x)).map((o) => [x, ...o])));
    for (const [id, spots] of byDef) {
      if (spots.length === 1) continue;
      const flagNames = [...new Set(spots.flatMap(({ p }) => [p.ifFlag, p.unlessFlag].filter(Boolean) as string[]))];
      expect(flagNames.length, `${id} hands over on flags`).toBeGreaterThanOrEqual(1);
      const oneAtATime = orders(flagNames).some((order) =>
        order.every((_, n) => {
          const flags = Object.fromEntries(order.map((f, i) => [f, i < n]));
          return spots.filter(({ p }) => npcPresent(p, flags)).length === 1;
        }) && spots.filter(({ p }) => npcPresent(p, Object.fromEntries(order.map((f) => [f, true])))).length === 1,
      );
      expect(oneAtATime, `${id} is in exactly one place at every step`).toBe(true);
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
        // A memory of a place (#75 item 16b) may build the way that place does.
        const owner = styleOwner.get(st) ?? z.id;
        expect(owner === z.id || owner === z.echoOf, `style ${st} reused by ${z.id}`).toBe(true);
        if (!z.echoOf) styleOwner.set(st, z.id);
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

  // Every crystal's bank, and the road to Remembrance Hill that Act II opens (#75 item 14e).
  const allLifted = Object.fromEntries([...ANY_CRYSTAL, ACT2_SEEN].map((f) => [f, true]));
  /** Cells reachable on foot from the spawn, with fog blocking unless `lifted`. */
  const onFoot = (z: ZoneDef, lifted: boolean) => reach(z, { flags: lifted ? allLifted : {} });
  // Walking, and flying once Ember can (#75 item 15b) — taking off from the spawn's ground.
  const flying = (z: ZoneDef) => reach(z, { flags: allLifted, modes: ['foot', 'ember'] });
  const airOnly = new Set(dawn.places!.filter((p) => p.byAir).map((p) => `${p.x},${p.y}`));

  it('is an overworld with places (and the Silver Shallows, the sea beyond it, #75 item 14; Taleshore past the fog, #75 item 15c)', () => {
    expect(overworlds.map((z) => z.id)).toEqual(['dawnreach', 'silver-shallows', 'taleshore']);
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
      "Dragon's Roost",
      'Remembrance Hill',
      'Shrine of First Light',
      'The Crystal Spire',
    ]);
    for (const p of dawn.places!) {
      // A place only Ember reaches (#75 item 15b) is never reached on foot, fog or no fog.
      if (p.byAir) {
        expect(up.has(`${p.x},${p.y}`), `${p.name} walkable?`).toBe(false);
        continue;
      }
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
        if (airOnly.has(`${icon!.x},${icon!.y}`)) {
          // Only Ember reaches it (#75 item 15b): the hero steps out onto ground
          // Ember can take off from, and flying reaches it.
          expect(landable(tileAt(dawn, e.spawnX, e.spawnY)), `${z.id} landing spot is open ground`).toBe(true);
          expect(flying(dawn).has(`${e.spawnX},${e.spawnY}`), `${z.id} landing spot is reached by air`).toBe(true);
          continue;
        }
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
        // Once Ember can fly, the hero flies too (#75 item 15b).
        const reached = (flags: Record<string, boolean>) => {
          const open = reach(z, { flags, modes: canFly(flags) ? ['foot', 'ember'] : ['foot'], grounded: true });
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

describe("the Dragon's Roost: a peak only Ember reaches (#75 item 15b)", () => {
  const dawn = ZONES.dawnreach;
  const roost = ZONES['dragon-roost'];
  const icon = dawn.places!.find((p) => p.name === "Dragon's Roost")!;
  const bank = dawn.fogs!.find((f) => f.id === 'roost-clouds')!;
  const everything = Object.fromEntries(dawn.fogs!.flatMap((f) => f.liftedBy.map((fl) => [fl, true])));
  const plateau: { x: number; y: number }[] = [];
  for (let y = bank.y; y < bank.y + bank.h; y++) for (let x = bank.x; x < bank.x + bank.w; x++) if (x !== icon.x || y !== icon.y) plateau.push({ x, y });

  it('is an air-only place, in clouds that lift with Ember\'s wings and show no crystal on the map', () => {
    expect(icon.byAir).toBe(true);
    expect(bank.guards).toEqual({ x: icon.x, y: icon.y });
    expect(bank.liftedBy).toEqual([FLIGHT_FLAG]);
    expect(bank.unmarked).toBe(true);
    // Nobody names it before Ember can fly.
    expect(icon.knownFrom).toBe(FLIGHT_FLAG);
  });

  it('no path climbs it: never on foot or by boat, whatever has lifted', () => {
    const ground = reach(dawn, { flags: everything, modes: ['foot', 'boat'], boat: BOAT_HOME });
    expect(ground.has(`${icon.x},${icon.y}`)).toBe(false);
    for (const c of plateau) expect(ground.has(`${c.x},${c.y}`), `${c.x},${c.y}`).toBe(false);
  });

  it('by air: Ember lands on its open ground, and from there the icon is a walk away — and nothing else is', () => {
    for (const c of plateau) expect(landable(tileAt(dawn, c.x, c.y)), `${c.x},${c.y} open ground`).toBe(true);
    const air = reach(dawn, { flags: everything, modes: ['foot', 'ember'], grounded: true });
    for (const c of plateau) expect(air.has(`${c.x},${c.y}`)).toBe(true);
    const top = reach(dawn, { from: plateau, flags: everything });
    expect(top.has(`${icon.x},${icon.y}`)).toBe(true);
    expect([...top].sort()).toEqual([...plateau.map((c) => `${c.x},${c.y}`), `${icon.x},${icon.y}`].sort());
  });

  it('is a quiet mountaintop: no critters, a riddle-chest on history, the Roost Stone', () => {
    expect(roost.enemies).toEqual([]);
    expect(roost.topic).toBe('history');
    expect(roost.map.some((row) => row.includes('C'))).toBe(true);
    expect(roost.npcs.map((n) => n.defId)).toEqual(['roost-stone']);
    const open = reach(roost);
    const chest = roost.map.flatMap((row, y) => [...row].map((ch, x) => ({ ch, x, y }))).find((c) => c.ch === 'C')!;
    expect(touches(open, chest.x, chest.y)).toBe(true);
  });
});

describe('Remembrance Hill (#75 item 14e)', () => {
  const hill = ZONES['remembrance-hill'];
  const dawn = ZONES.dawnreach;
  const icon = dawn.places!.find((p) => p.name === 'Remembrance Hill')!;
  const bank = dawn.fogs!.find((f) => f.id === 'hill-fog')!;
  const allCrystals = Object.fromEntries(actCrystals(1).map((t) => [crystalFlag(t.id), true]));

  it('is a safe town past Moonwell Grove: an inn, a Return spot, no critters', () => {
    expect(hill.kind).toBe('town');
    expect(hill.enemies).toEqual([]);
    expect(RETURN_TOWNS).toContain('remembrance-hill');
    expect(hill.buildings!.map((b) => b.name)).toContain('The Hall of Names');
    expect(new Set(hill.buildings!.map((b) => b.style))).toEqual(new Set(['marble']));
  });

  it("stays in old fog through Act I — four crystals don't lift it — and opens with act2-seen", () => {
    const cell = `${icon.x},${icon.y}`;
    expect(reach(dawn, { flags: allCrystals }).has(cell)).toBe(false);
    expect(reach(dawn, { flags: { ...allCrystals, [ACT2_SEEN]: true } }).has(cell)).toBe(true);
    expect(bank.liftedBy).toEqual([ACT2_SEEN]);
    expect(bank.guards).toEqual({ x: icon.x, y: icon.y });
    // The icon sits inside its bank, so it emerges as the fog lifts on screen.
    expect(icon.x >= bank.x && icon.x < bank.x + bank.w && icon.y >= bank.y && icon.y < bank.y + bank.h).toBe(true);
    expect(fogsToReveal(dawn, { ...allCrystals, [ACT2_SEEN]: true }).map((f) => f.id)).toContain('hill-fog');
  });

  it('the fog sits on the sea and the new road only: nothing Act I walks on is covered', () => {
    const before = reach(dawn, { flags: null });
    for (let y = bank.y; y < bank.y + bank.h; y++) {
      for (let x = bank.x; x < bank.x + bank.w; x++) {
        // Every cell under the bank is on the headland — reached only through the bank.
        if (before.has(`${x},${y}`)) expect(reach(dawn, { flags: allCrystals }).has(`${x},${y}`), `${x},${y}`).toBe(false);
      }
    }
    // The Grove's own beach, where the road starts, is open from the start.
    expect(reach(dawn).has('30,47')).toBe(true);
  });

  it('nobody names it before Act II', () => {
    expect(icon.knownFrom).toBe(ACT2_SEEN);
    expect(placeKnown(icon, allCrystals)).toBe(false);
    expect(placeKnown(icon, { [ACT2_SEEN]: true })).toBe(true);
  });

  it('Keeper Mnem reads the plaques of every crystal remembered in one line, then the blank ones', () => {
    const mnem = NPC_DEFS['hill-keeper'];
    const first = mnem.lines[0];
    expect(typeof first !== 'string' && first.setFlag).toBe('met-mnem');
    const said = (flags: Record<string, boolean>) => visibleLines(mnem.lines, flags).map(lineText);
    const act2 = { 'met-mnem': true, [ACT2_SEEN]: true };
    expect(said(act2)).toContain('Four plaques shine again: Numbers, Nature, Gears and Wonder!');
    expect(said(act2).at(-1)).toMatch(/blank/);
    expect(said(act2).length).toBeLessThanOrEqual(4);
    // With Memory restored (#75 item 14i): five plaques, and he calls you in to dedicate the new one.
    const memory = { ...act2, 'crystal-history-restored': true };
    // Memory's plaque lights itself at the dedication: no count until then (the panels show it), five after.
    expect(said(memory).join(' ')).not.toMatch(/plaques shine/);
    // He says hello only the first time.
    expect(said(memory).join(' ')).not.toMatch(/Welcome to the Hall/);
    expect(said({ ...memory, [HALL_DEDICATED]: true })).toContain('Five plaques shine now: Numbers, Nature, Gears, Wonder and Memory!');
    expect(said(act2).join(' ')).toMatch(/first Sage/);
    const call = visibleLines(mnem.lines, memory).at(-1);
    expect(typeof call !== 'string' && call.setFlag).toBe(HALL_CALLED);
    // Once dedicated, no call — your name is in the Hall's heart.
    expect(said({ ...memory, [HALL_DEDICATED]: true }).at(-1)).toMatch(/Hall's heart/);
  });
});

describe('Eldergrove (#75 item 14f)', () => {
  const grove = ZONES.eldergrove;
  const sea = ZONES['silver-shallows'];
  const icon = sea.places!.find((p) => p.name === 'Eldergrove')!;
  const cells = (ch: string) =>
    grove.map.flatMap((row, y) => [...row].flatMap((c, x) => (c === ch ? [{ x, y }] : [])));

  it("is a history field on an island off the Shallows' south side, as tough as the Shallows", () => {
    expect(grove.kind).toBe('field');
    expect(grove.topic).toBe('history');
    expect(zoneTier('eldergrove')).toBe(zoneTier('silver-shallows'));
    expect(icon.icon).toBe('elder');
    expect(icon.y).toBeGreaterThan(sea.map.length / 2);
    // Its island stands alone in the sea: off the icon, only beach and sea lead away.
    const island = reach(sea, { from: icon, flags: null });
    expect([...island].every((k) => {
      const [x, y] = k.split(',').map(Number);
      return Math.abs(x - icon.x) <= 7 && Math.abs(y - icon.y) <= 6;
    })).toBe(true);
    expect([...island].some((k) => {
      const [x, y] = k.split(',').map(Number);
      return tileAt(sea, x, y) === ':';
    })).toBe(true);
  });

  it('a boat lands on its beach and the hero walks to its icon', () => {
    // Sailing in from Dawnreach, at the Shallows' west edge.
    const path = reachPath(sea, (x, y) => x === icon.x && y === icon.y, { from: { x: 1, y: 22 }, aboard: true, modes: ['boat', 'foot'] });
    expect(path, 'sail in and land on Eldergrove').not.toBeNull();
    expect(path!.at(-1)!.mode).toBe('foot');
  });

  it('three critters of the ring-trees, the Hollow Acorn shielded — and the Ringkeeper', () => {
    expect(grove.enemies.filter((e) => ENEMY_DEFS[e.defId].isBoss).map((e) => e.defId)).toEqual(['ringkeeper']);
    const kinds = [...new Set(grove.enemies.filter((e) => !ENEMY_DEFS[e.defId].isBoss).map((e) => e.defId))].sort();
    expect(kinds).toEqual(['hollow-acorn', 'ring-beetle', 'sap-sprite']);
    for (const id of kinds) expect(ENEMY_DEFS[id].topic).toBe('history');
    expect(ENEMY_DEFS['hollow-acorn'].behavior).toBe('shielded');
    expect(kinds.map((id) => ENEMY_DEFS[id].levelOffset).sort()).toEqual([-1, 0, 1]);
  });

  it('the Ring Hollow chest waits behind the gate; every chest is in reach once gates open', () => {
    const [hollow] = cells('C').filter((c) => c.x > 36);
    expect(hollow).toBeDefined();
    expect(touches(reach(grove), hollow.x, hollow.y)).toBe(false);
    for (const c of cells('C')) expect(touches(reach(grove, { gates: 'open' }), c.x, c.y), `${c.x},${c.y}`).toBe(true);
  });

  it("Fen's Hollow is the grove's shelter: a beaten hero wakes on its floor, the door below, the way out open (#75 item 14f)", () => {
    const shelter = shelterOf(grove)!;
    expect(shelter.building.name).toBe("Fen's Hollow");
    expect(tileAt(grove, shelter.cell.x, shelter.cell.y)).toBe('F');
    expect(tileAt(grove, shelter.cell.x, shelter.cell.y + 1)).toBe('D');
    const out = reach(grove, { from: shelter.cell });
    expect(grove.exits.some((e) => out.has(`${e.x},${e.y}`))).toBe(true);
    // A shelter, not an inn: no Rest. The Marsh has one too; the Archive's is its inn (#75 item 14h), and so is Chorus Isle's (15g).
    expect(innOf(grove)).toBeUndefined();
    expect(allZones.filter((z) => z.shelter).map((z) => z.id)).toEqual(['eldergrove', 'foglight-marsh', 'sunken-archive', 'chorus-isle', 'dreamroot-door']);
  });

  it("Fen, Old Ringwood and Dawdle live here — Dawdle the slowest wanderer in the game", () => {
    expect(grove.npcs.map((n) => n.defId).sort()).toEqual(['elder-dawdle', 'elder-fen', 'elder-ringwood']);
    const dawdle = NPC_DEFS['elder-dawdle'];
    expect(dawdle.pace).toBeLessThan(1);
    for (const def of Object.values(NPC_DEFS)) {
      if (def.id !== dawdle.id) expect(def.pace ?? 1, def.id).toBeGreaterThan(dawdle.pace!);
    }
    expect(NPC_DEFS['elder-ringwood'].stationary).toBe(true);
    expect(NPC_DEFS['elder-fen'].stationary).toBe(true);
  });
});

describe('Foglight Marsh (#75 item 14g)', () => {
  const marsh = ZONES['foglight-marsh'];
  const sea = ZONES['silver-shallows'];
  const icon = sea.places!.find((p) => p.name === 'Foglight Marsh')!;
  const cells = (ch: string) =>
    marsh.map.flatMap((row, y) => [...row].flatMap((c, x) => (c === ch ? [{ x, y }] : [])));
  const placed = (defId: string) => marsh.npcs.filter((p) => p.defId === defId);

  it("is a history field on the Shallows' north coast, as tough as the Shallows", () => {
    expect(marsh.kind).toBe('field');
    expect(marsh.topic).toBe('history');
    expect(zoneTier('foglight-marsh')).toBe(zoneTier('silver-shallows'));
    expect(icon.icon).toBe('marsh');
    expect(icon.y).toBeLessThan(sea.map.length / 4);
  });

  it('a boat lands on its beach and the hero walks to its icon; its exits lead back beside it', () => {
    const path = reachPath(sea, (x, y) => x === icon.x && y === icon.y, { from: { x: 1, y: 22 }, aboard: true, modes: ['boat', 'foot'] });
    expect(path, 'sail in and land below the Marsh').not.toBeNull();
    expect(path!.at(-1)!.mode).toBe('foot');
    for (const e of marsh.exits) expect(Math.abs(e.spawnX - icon.x) + Math.abs(e.spawnY - icon.y), 'lands beside the icon').toBe(1);
  });

  it('three critters of the last fog — the Bog Lantern a trickster — and the Last Fogbank, a miniboss with a badge', () => {
    const kinds = [...new Set(marsh.enemies.filter((e) => !ENEMY_DEFS[e.defId].isBoss).map((e) => e.defId))].sort();
    expect(kinds).toEqual(['bog-lantern', 'mist-newt', 'murk-toad']);
    for (const id of kinds) expect(ENEMY_DEFS[id].topic).toBe('history');
    expect(ENEMY_DEFS['bog-lantern'].behavior).toBe('trickster');
    expect(kinds.map((id) => ENEMY_DEFS[id].levelOffset).sort()).toEqual([-1, 0, 1]);
    const fog = ENEMY_DEFS['last-fogbank'];
    expect([fog.isBoss, fog.role]).toEqual([true, 'miniboss']);
    expect(BOSS_BADGES[fog.badge!].name).toBe('Foglight Badge');
    expect(fog.lines?.intro.length).toBeGreaterThan(0);
  });

  it('the Last Fogbank sits in the way of the cove\'s riddle-chest: past it, or not at all', () => {
    const boss = marsh.enemies.find((e) => e.defId === 'last-fogbank')!;
    const [chest] = cells('C').filter((c) => c.y > 20);
    expect(chest).toBeDefined();
    expect(touches(reach(marsh), chest.x, chest.y)).toBe(true);
    expect(touches(reach(marsh, { blocked: (x, y) => x === boss.x && y === boss.y }), chest.x, chest.y)).toBe(false);
  });

  it("Posy's walk: from the landing to the Nameless Stone on foot, the goal beside the stone", () => {
    const landing = placed('hill-posy').find((p) => p.ifFlag === POSY_SAILED)!;
    const quest = QUESTS.find((q) => q.id === POSY_QUEST)!;
    const escort = quest.steps[0].escort!;
    expect(escort.zoneId).toBe('foglight-marsh');
    expect(reach(marsh, { from: landing }).has(`${escort.goal.x},${escort.goal.y}`)).toBe(true);
    const stone = placed('marsh-stone')[0];
    expect(Math.abs(stone.x - escort.goal.x) + Math.abs(stone.y - escort.goal.y)).toBe(1);
    // The landing is a step from where the hero arrives.
    expect(Math.abs(landing.x - marsh.spawn.x) + Math.abs(landing.y - marsh.spawn.y)).toBeLessThanOrEqual(4);
    // …and up the boardwalk from the exit, so the walk starts heading away from it (#75 item 14g review).
    expect(landing.y).toBeLessThan(marsh.exits[0].y - 3);
  });

  it('Posy is on the Hill, then at the landing, then by the stone, then home — one place at a time', () => {
    const offered = questOfferedFlag({ id: POSY_QUEST });
    const arrived = stepFlag(POSY_WALK);
    const done = questDoneFlag({ id: POSY_QUEST });
    const where = (flags: Record<string, boolean>) =>
      allZones.flatMap((z) => z.npcs.filter((p) => p.defId === 'hill-posy' && npcPresent(p, flags)).map((p) => `${z.id}@${p.x},${p.y}`));
    expect(where({})).toEqual(['remembrance-hill@14,23']);
    // Asked, she stays on the Hill until the hero has been to the Marsh (#75 item 14g, the owner's call).
    expect(where({ [offered]: true })).toEqual(['remembrance-hill@14,23']);
    expect(where({ [offered]: true, [POSY_SAILED]: true })).toEqual(['foglight-marsh@21,23']);
    expect(where({ [offered]: true, [POSY_SAILED]: true, [arrived]: true })).toEqual(['foglight-marsh@6,3']);
    expect(where({ [offered]: true, [POSY_SAILED]: true, [arrived]: true, [done]: true })).toEqual(['remembrance-hill@14,23']);
  });

  it("no critter's patch reaches Posy's walk: she never waits on one that can't leave (#75 item 14g UX review)", () => {
    const TILE = 32;
    const leash = WANDER_TUNING.enemy.leashTiles * TILE;
    // The walk she asks for, up the boardwalks from the landing to the stone — and the
    // shortcut a child may take instead: up the middle boardwalk to its top, then west
    // over the grass round the pool (the owner's call, #125u).
    const walk = reachPath(marsh, (x, y) => x === 6 && y === 4, { from: { x: 21, y: 23 }, passable: (ch) => ch === '=' })!;
    const up = reachPath(marsh, (x, y) => x === 21 && y === 3, { from: { x: 21, y: 23 }, passable: (ch) => ch === '=' })!;
    const across = reachPath(marsh, (x, y) => x === 6 && y === 4, { from: { x: 21, y: 3 } })!;
    for (const [route, way] of [['boardwalks', walk], ['shortcut', [...up, ...across]]] as const) {
      expect(way, route).toBeTruthy();
      for (const e of marsh.enemies.filter((p) => !ENEMY_DEFS[p.defId].isBoss)) {
        const near = Math.min(...way.map((c) => Math.hypot(c.x - e.x, c.y - e.y))) * TILE;
        // Its patch's edge, plus how near a critter makes her wait (80 px).
        expect(near, `${route}: ${e.defId}@${e.x},${e.y}`).toBeGreaterThan(leash + 80);
      }
    }
  });

  it("Brume's lanterns stand by the boardwalks, dark until lit, and her Ledger's chest is in reach", () => {
    const open = reach(marsh);
    for (const side of ['west', 'north', 'east']) {
      const [dark] = placed(`marsh-lantern-${side}`);
      const [lit] = placed(`marsh-lantern-${side}-lit`);
      expect([dark.x, dark.y]).toEqual([lit.x, lit.y]);
      expect(dark.unlessFlag).toBe(stepFlag(`lantern-${side}`));
      expect(lit.ifFlag).toBe(stepFlag(`lantern-${side}`));
      expect(touches(open, dark.x, dark.y), side).toBe(true);
    }
    const ledger = marsh.keyChests![0];
    expect(ledger.item).toBe('lantern-ledger');
    expect(touches(open, ledger.x, ledger.y)).toBe(true);
  });

  it("Brume's Lamp-House is the Marsh's shelter; Slosh keeps his raft shop", () => {
    const shelter = shelterOf(marsh)!;
    expect(shelter.building.name).toBe("Brume's Lamp-House");
    expect(tileAt(marsh, shelter.cell.x, shelter.cell.y)).toBe('F');
    expect(marsh.exits.some((e) => reach(marsh, { from: shelter.cell }).has(`${e.x},${e.y}`))).toBe(true);
    const slosh = placed('marsh-slosh')[0];
    expect(buildingInside(marsh, slosh.x, slosh.y)?.name).toBe("Slosh's Raft Shop");
  });
});

describe('the Sunken Archive (#75 item 14h)', () => {
  const archive = ZONES['sunken-archive'];
  const sea = ZONES['silver-shallows'];
  const icon = sea.places!.find((p) => p.name === 'Sunken Archive')!;
  const fiend = archive.enemies.find((e) => e.defId === 'hollow-fiend')!;
  const cells = (ch: string) =>
    archive.map.flatMap((row, y) => [...row].flatMap((c, x) => (c === ch ? [{ x, y }] : [])));

  it("is Act II's crystal zone, a history field in the Shallows' north-east, as tough as the Shallows", () => {
    expect(archive.kind).toBe('field');
    expect(archive.topic).toBe('history');
    expect(TOPIC_REGISTRY.find((t) => t.id === 'history')?.zoneId).toBe('sunken-archive');
    expect(zoneTier('sunken-archive')).toBe(zoneTier('silver-shallows'));
    expect(icon.icon).toBe('archive');
    expect(icon.x).toBeGreaterThan(sea.map[0].length / 2);
    expect(icon.y).toBeLessThan(sea.map.length / 2);
    // Its island stands alone in the sea, west of the Great Fogbank.
    const island = reach(sea, { from: icon, flags: null });
    expect([...island].every((k) => {
      const [x, y] = k.split(',').map(Number);
      return Math.abs(x - icon.x) <= 6 && Math.abs(y - icon.y) <= 5;
    })).toBe(true);
    const bank = sea.fogs!.find((f) => f.id === 'great-fogbank')!;
    expect(Math.max(...[...island].map((k) => Number(k.split(',')[0])))).toBeLessThan(bank.x - 2);
  });

  it('a boat sails in from Dawnreach, lands on its beach and the hero walks to its icon; its exits lead back beside it', () => {
    const path = reachPath(sea, (x, y) => x === icon.x && y === icon.y, { from: { x: 1, y: 22 }, aboard: true, modes: ['boat', 'foot'] });
    expect(path, 'sail in and land on the Archive').not.toBeNull();
    expect(path!.at(-1)!.mode).toBe('foot');
    for (const e of archive.exits) expect(Math.abs(e.spawnX - icon.x) + Math.abs(e.spawnY - icon.y), 'lands beside the icon').toBe(1);
  });

  it('three critters of the forgotten library — the Quill Imp swift — and the Hollow Fiend, its crystal\'s Fiend', () => {
    const kinds = [...new Set(archive.enemies.filter((e) => !ENEMY_DEFS[e.defId].isBoss).map((e) => e.defId))].sort();
    expect(kinds).toEqual(['dust-tome', 'ink-wisp', 'quill-imp']);
    for (const id of kinds) expect(ENEMY_DEFS[id].topic).toBe('history');
    expect(ENEMY_DEFS['quill-imp'].behavior).toBe('swift');
    expect(kinds.map((id) => ENEMY_DEFS[id].levelOffset).sort()).toEqual([-1, 0, 1]);
    expect(fiendFor('history').id).toBe('hollow-fiend');
  });

  it('the Hollow Fiend waits behind the silver door — the Memoria Key\'s gate — and nowhere else lets you in', () => {
    const gate = gateIdAt('sunken-archive', archive.map, archive.keyGate!.x, archive.keyGate!.y);
    expect(touches(reach(archive), fiend.x, fiend.y)).toBe(false);
    // Every other gate open, the silver door shut: still no way in.
    expect(touches(reach(archive, { gates: (id) => id !== gate }), fiend.x, fiend.y)).toBe(false);
    expect(touches(reach(archive, { gates: (id) => id === gate }), fiend.x, fiend.y)).toBe(true);
  });

  it("the Silent Stacks' riddle-chest waits behind its gate; every chest is in reach once gates open", () => {
    const chests = cells('C');
    expect(chests).toHaveLength(1);
    expect(touches(reach(archive), chests[0].x, chests[0].y)).toBe(false);
    expect(touches(reach(archive, { gates: 'open' }), chests[0].x, chests[0].y)).toBe(true);
  });

  it("an island town: Binder's inn, a Return spot, and a beaten hero wakes there — the boat comes round to its beach", () => {
    expect(RETURN_TOWNS).toContain('sunken-archive');
    const inn = innOf(archive)!;
    expect(inn.name).toBe('Quiet Shelf Inn');
    expect(shelterOf(archive)!.building).toBe(inn);
    expect(innWakeCell(archive)).toEqual(shelterOf(archive)!.cell);
    // Its mooring floats at the island's beach, next to the path down from the icon.
    expect(archive.mooring!.zoneId).toBe('silver-shallows');
    expect(tileAt(sea, archive.mooring!.x, archive.mooring!.y)).toBe('~');
    expect(tileAt(sea, archive.mooring!.x, archive.mooring!.y - 1)).toBe(':');
  });

  it('Sage Chronicle, Index, Binder and five more live here — the people a town needs', () => {
    const ids = archive.npcs.map((n) => n.defId);
    for (const id of ['sage-chronicle', 'archive-index', 'archive-binder']) expect(ids).toContain(id);
    expect(NPC_DEFS['sage-chronicle']).toMatchObject({ role: 'sage', topic: 'history' });
    expect(NPC_DEFS['archive-index'].stationary).toBe(true);
    // Hush and Brine stand among tables and beds, with no room to step back after a talk (review fix).
    expect(NPC_DEFS['archive-hush'].stationary).toBe(true);
    expect(NPC_DEFS['archive-traveler'].stationary).toBe(true);
    // In Act II Elder Lumen no longer says "All four crystals" beside a HUD that counts five (review fix).
    const four = NPC_DEFS['elder-lumen'].lines.find((l) => typeof l !== 'string' && l.text.startsWith('All four crystals'));
    expect(four && typeof four !== 'string' && four.unlessFlag).toBe(ACT2_SEEN);
    // Old Quillon stands by the silver door, warning of the Fiend until it falls.
    const quillon = archive.npcs.find((n) => n.defId === 'archive-quillon')!;
    expect(Math.abs(quillon.x - archive.keyGate!.x) + Math.abs(quillon.y - archive.keyGate!.y)).toBeLessThanOrEqual(3);
  });

  it('arriving starts no fight: every critter is out of reach of the landing and the carpet up to the plaza', () => {
    const reachTiles = WANDER_TUNING.enemy.leashTiles + 1;
    for (const foe of archive.enemies.filter((e) => !ENEMY_DEFS[e.defId].isBoss)) {
      for (let y = 9; y <= 26; y++) {
        for (const x of [21, 22]) {
          const gap = Math.max(Math.abs(foe.x - x), Math.abs(foe.y - y));
          expect(gap, `${foe.defId} at ${foe.x},${foe.y} vs the carpet ${x},${y}`).toBeGreaterThan(reachTiles);
        }
      }
    }
  });
});

describe('the world remembers (#75 item 14i)', () => {
  const homeIds = [...new Set(ZONES['lumina-village'].npcs.map((p) => p.defId))];

  it('every person in Lumina Village has a "now I remember" line, only in Act II, under 30 words', () => {
    expect(homeIds.length).toBeGreaterThanOrEqual(14);
    for (const id of homeIds) {
      const lines = NPC_DEFS[id].lines;
      const act2 = lines.filter((l) => typeof l !== 'string' && l.ifFlag === ACT2_SEEN);
      expect(act2.length, id).toBeGreaterThan(0);
      for (const l of act2) expect(lineText(l).split(/\s+/).length, id).toBeLessThanOrEqual(30);
      // Before Act II nobody says them.
      const before = visibleLines(lines, { 'ember-hatched': true, 'spire-cleared': true }).map(lineText);
      for (const l of act2) expect(before, id).not.toContain(lineText(l));
    }
  });

  it("Grandmother Wick and Elder Lumen begin Aster's breadcrumbs once you've met Keeper Mnem", () => {
    const flags = { [ACT2_SEEN]: true, 'met-wick': true };
    const wick = (f: Record<string, boolean>) => visibleLines(NPC_DEFS['village-elder'].lines, f).map(lineText).join(' ');
    expect(wick(flags)).not.toMatch(/first Sage/);
    expect(wick({ ...flags, 'met-mnem': true })).toMatch(/nobody remembers the first Sage/);
    const lumen = (f: Record<string, boolean>) => visibleLines(NPC_DEFS['elder-lumen'].lines, { [MET_ELDER]: true, ...f }).map(lineText).join(' ');
    expect(lumen({ ...flags, 'met-mnem': true })).toMatch(/first Sage/);
    expect(lumen({ ...flags, 'met-mnem': true })).not.toMatch(/Aster/);
    expect(lumen({ ...flags, 'met-mnem': true, 'crystal-history-restored': true })).toMatch(/Aster/);
    // Only his newest memory line — even for a hero who never met Mnem (review round 3).
    const memoryLines = (f: Record<string, boolean>) => visibleLines(NPC_DEFS['elder-lumen'].lines, { [MET_ELDER]: true, ...f })
      .filter((l) => /Pudding|first Sage|Aster/.test(lineText(l))).length;
    expect(memoryLines({ ...flags, 'crystal-history-restored': true })).toBe(1);
    expect(memoryLines(flags)).toBe(1);
  });

  it('Act I lines that would contradict Act II stop, and Mnem never opens mid-sentence (review round 3)', () => {
    const act2 = { [ACT2_SEEN]: true, 'ember-hatched': true };
    const say = (id: string, f: Record<string, boolean>) => visibleLines(NPC_DEFS[id].lines, f).map(lineText).join(' ');
    expect(say('village-keeper', act2)).not.toMatch(/sputter/);
    expect(say('village-friend', act2)).not.toMatch(/Fiends/);
    expect(say('village-keeper', {})).toMatch(/sputter/);
    const mnem = visibleLines(NPC_DEFS['hill-keeper'].lines, { ...act2, 'met-mnem': true, 'crystal-history-restored': true }).map(lineText);
    expect(mnem[0]).not.toMatch(/^And\b/);
  });
});

describe('Taleshore and Port Lantern (#75 item 15c)', () => {
  const sea = ZONES['silver-shallows'];
  const tale = ZONES.taleshore;
  const port = ZONES['port-lantern'];
  const icon = tale.places!.find((p) => p.name === 'Port Lantern')!;

  it("is a far overworld past the Great Fogbank: no boat sails off the Shallows' east edge while the fog stands", () => {
    expect(tale.kind).toBe('overworld');
    const east = sea.map[0].length - 1;
    for (let y = 0; y < sea.map.length; y++) {
      // Every cell of the east edge is fog until the Hush Fiend falls…
      expect(fogAt(sea, east, y, {}), `row ${y} fogged`).toBeTruthy();
      // …and a boat can't enter fog, so only Ember crosses — onto Taleshore, the same row, one cell in.
      expect(edgeCrossing(sea, east, y, ZONES, 'ember')).toEqual({ side: 'east', to: 'taleshore', x: 1, y });
    }
    // Taleshore's west side is open Starfall Sea, so whatever row she crosses on, she arrives over water.
    for (let y = 0; y < tale.map.length; y++) expect(tileAt(tale, 1, y)).toBe('~');
  });

  it("Port Lantern sits on the coast, beside ground Ember can land on, and its gate lands back on that road", () => {
    expect(icon.icon).toBe('harbor');
    const out = port.exits.filter((e) => e.to === 'taleshore');
    expect(out.length).toBe(2);
    for (const e of out) {
      expect(landable(tileAt(tale, e.spawnX, e.spawnY)), 'Ember can take off where you come out').toBe(true);
      expect(Math.abs(e.spawnX - icon.x) + Math.abs(e.spawnY - icon.y)).toBeLessThanOrEqual(2);
    }
    // From that road, the town's icon is a step away on foot.
    const road = reach(tale, { from: { x: out[0].spawnX, y: out[0].spawnY } });
    expect(touches(road, icon.x, icon.y)).toBe(true);
  });

  it('Harbormaster Gale greets you by the road in, and saying hello meets the 🚩 (15c review)', () => {
    const gale = port.npcs.find((n) => n.defId === 'port-harbormaster')!;
    const gate = port.exits.find((e) => e.to === 'taleshore')!;
    expect(Math.abs(gale.x - gate.x) + Math.abs(gale.y - gate.y)).toBeLessThanOrEqual(6);
    expect(touches(reach(port), gale.x, gale.y)).toBe(true);
    const first = NPC_DEFS['port-harbormaster'].lines[0];
    expect(typeof first !== 'string' && first.setFlag).toBe(MET_GALE);
  });

  it('only Ember crosses the Great Fogbank: a boat never sails off a fogged cell (15c review round 3)', () => {
    const sea = ZONES['silver-shallows'];
    const east = sea.map[0].length - 1;
    const rows = sea.map.flatMap((r, y) => (r[east] === '~' ? [y] : []));
    expect(rows.length).toBeGreaterThan(0);
    for (const y of rows) expect(edgeCrossing(sea, east, y, ZONES, 'boat', {}), `row ${y}`).toBeNull();
    // …and no boat reaches that edge at all.
    const boatReach = reach(sea, { from: { x: 1, y: 22 }, aboard: true, modes: ['boat'] });
    for (const y of rows) expect(boatReach.has(`${east},${y}`)).toBe(false);
    // Once the fog lifts (15g), boats cross, and the link isn't flown-only any more.
    const bank = sea.fogs!.find((f) => f.id === GREAT_FOGBANK)!;
    // Lifted by the Crystal of Voices (#75 item 15g), which is now a real crystal.
    expect(bank.liftedBy).toEqual([crystalFlag('words')]);
    expect(TOPIC_REGISTRY.some((t) => crystalFlag(t.id) === bank.liftedBy[0])).toBe(true);
    const lifted = { [bank.liftedBy[0]]: true };
    expect(rows.some((y) => edgeCrossing(sea, east, y, ZONES, 'boat', lifted) !== null)).toBe(true);
    expect(flownLink('silver-shallows', 'taleshore')).toBe(true);
    expect(flownLink('silver-shallows', 'taleshore', lifted)).toBe(false);
    expect(flownLink('dawnreach', 'silver-shallows')).toBe(false);
  });

  it('things are props: they never step aside, and never wander (15c review)', () => {
    expect(isThing(NPC_DEFS['port-board'])).toBe(true);
    expect(isThing(NPC_DEFS['dawn-sign-west'] ?? Object.values(NPC_DEFS).find((d) => d.signpost))).toBe(true);
    expect(isThing(NPC_DEFS['port-harbormaster'])).toBe(false);
    for (const id of ['port-board', 'roost-stone', 'marsh-stone', 'marsh-lantern-west']) expect(NPC_DEFS[id].prop, id).toBe(true);
    for (const def of Object.values(NPC_DEFS)) if (def.prop) expect(def.stationary, def.id).toBe(true);
  });

  it('someone is out on Taleshore, past the town (15c review)', () => {
    const out = tale.npcs.map((n) => n.defId);
    expect(out).toContain('tale-rambler');
    const hob = tale.npcs.find((n) => n.defId === 'tale-rambler')!;
    expect(touches(reach(tale, { from: { x: 30, y: 21 } }), hob.x, hob.y)).toBe(true);
  });

  it('is a safe harbor town: an inn (a Return town), a candle shop selling Berry Potions, a quest board — and no library', () => {
    expect(port.kind).toBe('town');
    expect(port.enemies).toEqual([]);
    expect(RETURN_TOWNS).toContain('port-lantern');
    expect(port.buildings!.filter((b) => b.sign === 'inn')).toHaveLength(1);
    // "the … Inn in …" reads right for every inn (15c review: "the The Driftlight Inn").
    for (const id of RETURN_TOWNS) for (const b of ZONES[id].buildings ?? []) if (b.sign === 'inn') expect(b.name, id).not.toMatch(/^The /);
    expect(port.npcs.map((n) => NPC_DEFS[n.defId].role)).not.toContain('librarian');
    expect(port.npcs.map((n) => n.defId)).toContain('port-board');
    expect(new Set(port.buildings!.map((b) => b.style))).toEqual(new Set(['harbor']));
    expect(zoneTier('taleshore')).toBe(6);
  });
});

describe('Taleshore I: Driftwood Shallows, the Wayfinder Isles, Gale Atoll (#75 item 15d)', () => {
  const tale = ZONES.taleshore;
  const drift = ZONES['driftwood-shallows'];
  const isles = ZONES['wayfinder-isles'];
  const atoll = ZONES['gale-atoll'];
  const place = (name: string) => tale.places!.find((p) => p.name === name)!;

  it('the beach is at the end of a road from Port Lantern; the two islands are out at sea, reached only on Ember', () => {
    // On foot from the harbor's road to the beach's icon.
    expect(touches(reach(tale, { from: { x: 30, y: 21 } }), place('Driftwood Shallows').x, place('Driftwood Shallows').y)).toBe(true);
    for (const name of ['Wayfinder Isles', 'Gale Atoll']) {
      const p = place(name);
      expect(p.byAir, name).toBe(true);
      // No walk from the mainland reaches it…
      expect(touches(reach(tale, { from: { x: 30, y: 21 } }), p.x, p.y), name).toBe(false);
      // …but there's open ground beside it to land on, and its gate leads back out there.
      const back = ZONES[tale.exits.find((e) => e.x === p.x && e.y === p.y)!.to].exits[0];
      expect(landable(tileAt(tale, back.spawnX, back.spawnY)), name).toBe(true);
      expect(Math.abs(back.spawnX - p.x) + Math.abs(back.spawnY - p.y), name).toBeLessThanOrEqual(1);
    }
  });

  it('three geography fields at tier 6, three critters each with one archetype a place', () => {
    const behavior = { 'driftwood-shallows': 'shielded', 'wayfinder-isles': 'trickster', 'gale-atoll': 'swift' } as const;
    for (const z of [drift, isles, atoll]) {
      expect(z.kind).toBe('field');
      expect(z.topic).toBe('geography');
      expect(zoneTier(z.id)).toBe(6);
      const critters = [...new Set(z.enemies.map((e) => e.defId).filter((d) => !ENEMY_DEFS[d].isBoss))];
      expect(critters, z.id).toHaveLength(3);
      expect(critters.filter((d) => ENEMY_DEFS[d].behavior).map((d) => ENEMY_DEFS[d].behavior), z.id).toEqual([behavior[z.id as keyof typeof behavior]]);
    }
  });

  it('the Compass Golem stands in the stone circle, reachable, and guards the First Chorus Key', () => {
    const golem = isles.enemies.find((e) => e.defId === 'compass-golem')!;
    expect(touches(reach(isles), golem.x, golem.y)).toBe(true);
    expect(ENEMY_DEFS['compass-golem'].role).toBe('warden');
  });

  it("each place's riddle-chest sits behind its gate, and Salt's sea-glass chests are in reach", () => {
    for (const z of [drift, isles, atoll]) {
      const closed = reach(z);
      const open = reach(z, { gates: 'open' });
      const chests = z.map.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === 'C' ? [{ x, y }] : [])));
      const key = (c: { x: number; y: number }) => (z.keyChests ?? []).some((k) => k.x === c.x && k.y === c.y);
      for (const c of chests) {
        expect(touches(open, c.x, c.y), `${z.id} ${c.x},${c.y}`).toBe(true);
        // The riddle-chest needs its gate; a sea-glass chest doesn't.
        expect(touches(closed, c.x, c.y), `${z.id} ${c.x},${c.y}`).toBe(key(c));
      }
    }
    expect([...(drift.keyChests ?? []), ...(atoll.keyChests ?? [])].map((k) => k.item).sort()).toEqual(['seaglass-blue', 'seaglass-gold', 'seaglass-green']);
  });

  it("no critter's patch reaches Juno's walk from the landing to her dock", () => {
    const TILE = 32;
    const leash = WANDER_TUNING.enemy.leashTiles * TILE;
    const walk = reachPath(drift, (x, y) => x === 3 && y === 18, { from: { x: 23, y: 2 }, passable: (ch) => ch === '=' || ch === ':' || ch === '.' })!;
    expect(walk).toBeTruthy();
    for (const e of drift.enemies) {
      const near = Math.min(...walk.map((c) => Math.hypot(c.x - e.x, c.y - e.y))) * TILE;
      expect(near, `${e.defId}@${e.x},${e.y}`).toBeGreaterThan(leash + 80);
    }
  });

  it("Juno waits in Port Lantern, then at the beach's landing, then by her ferry, then home again", () => {
    const at = (flags: Record<string, boolean>) =>
      (['port-lantern', 'driftwood-shallows'] as const).flatMap((zid) => ZONES[zid].npcs.filter((n) => n.defId === 'port-skipper' && npcPresent(n, flags)).map((n) => `${zid}@${n.x},${n.y}`));
    const offered = { [questOfferedFlag({ id: JUNO_QUEST })]: true };
    const came = { ...offered, [JUNO_CAME]: true };
    const arrived = { ...came, [stepFlag(JUNO_WALK)]: true };
    expect(at({})).toEqual(['port-lantern@6,16']);
    expect(at(offered)).toEqual(['port-lantern@6,16']); // until you reach the beach
    expect(at(came)).toEqual(['driftwood-shallows@23,2']);
    expect(at(arrived)).toEqual(['driftwood-shallows@4,18']);
    expect(at({ ...arrived, [questDoneFlag({ id: JUNO_QUEST })]: true })).toEqual(['port-lantern@6,16']);
  });

  it("Tass's kite stall has its own style and sells the Kite Badge", () => {
    expect(atoll.buildings!.map((b) => b.style)).toEqual(['kite']);
    expect(NPC_DEFS['gale-tass'].role).toBe('merchant');
  });
});


describe('Taleshore II: the Story Reef and Inkwell Cove (#75 item 15e)', () => {
  const tale = ZONES.taleshore;
  const reef = ZONES['story-reef'];
  const cove = ZONES['inkwell-cove'];
  const place = (name: string) => tale.places!.find((p) => p.name === name)!;

  it('both are at the ends of roads from Port Lantern — north to the reef, then east to the cove', () => {
    const fromTown = reach(tale, { from: { x: 30, y: 21 } });
    for (const name of ['Story Reef', 'Inkwell Cove']) {
      const p = place(name);
      expect(p.byAir, name).toBeFalsy();
      expect(touches(fromTown, p.x, p.y), name).toBe(true);
      // Its gate leads back out beside its icon, onto the road.
      const back = ZONES[tale.exits.find((e) => e.x === p.x && e.y === p.y)!.to].exits[0];
      expect(Math.abs(back.spawnX - p.x) + Math.abs(back.spawnY - p.y), name).toBe(1);
      expect(tileAt(tale, back.spawnX, back.spawnY), name).toBe('=');
    }
  });

  it('two words fields at tier 6: a trickster on the reef, a healer in the cove', () => {
    const behavior = { 'story-reef': 'trickster', 'inkwell-cove': 'healer' } as const;
    for (const z of [reef, cove]) {
      expect(z.kind).toBe('field');
      expect(z.topic).toBe('words');
      expect(zoneTier(z.id)).toBe(6);
      const critters = [...new Set(z.enemies.map((e) => e.defId).filter((d) => !ENEMY_DEFS[d].isBoss))];
      expect(critters, z.id).toHaveLength(3);
      expect(critters.filter((d) => ENEMY_DEFS[d].behavior).map((d) => ENEMY_DEFS[d].behavior), z.id).toEqual([behavior[z.id as keyof typeof behavior]]);
    }
  });

  it('the Riddle Leviathan waits at the tip of the point, a warden, in front of the chest (round 1)', () => {
    const lev = cove.enemies.find((e) => e.defId === 'riddle-leviathan')!;
    expect(touches(reach(cove), lev.x, lev.y)).toBe(true);
    expect(ENEMY_DEFS['riddle-leviathan'].role).toBe('warden');
    // Out of the ink: water beside it.
    expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tileAt(cove, lev.x + dx, lev.y + dy) === '~')).toBe(true);
    // Nobody reaches the chest without going through its own cell (round 2: a 2-wide neck let a hero
    // hug the water's edge 37 px from it, past its 34 px touch)…
    const past = reach(cove, { blocked: (x, y) => x === lev.x && y === lev.y });
    // …and that cell is a one-wide neck: water above and below, so a hero going through is within a few px of it.
    expect(tileAt(cove, lev.x, lev.y - 1)).toBe('~');
    expect(tileAt(cove, lev.x, lev.y + 1)).toBe('~');
    const chest = cove.map.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === 'C' ? [{ x, y }] : [])));
    expect(chest).toHaveLength(1);
    expect(touches(past, chest[0].x, chest[0].y)).toBe(false);
  });

  it("the reef's riddle-chest sits behind its gate, and the cove's on the point", () => {
    const chests = (z: ZoneDef) => z.map.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === 'C' ? [{ x, y }] : [])));
    expect(chests(reef)).toHaveLength(1);
    expect(chests(cove)).toHaveLength(1);
    for (const c of chests(reef)) {
      expect(touches(reach(reef), c.x, c.y)).toBe(false);
      expect(touches(reach(reef, { gates: 'open' }), c.x, c.y)).toBe(true);
    }
    for (const c of chests(cove)) expect(touches(reach(cove), c.x, c.y)).toBe(true);
  });

  it("Yarn's three tale-stones are each in reach, dim until their riddle is answered, then glowing", () => {
    const stones = (flags: Record<string, boolean>) => reef.npcs.filter((n) => n.defId.startsWith('reef-stone') && npcPresent(n, flags)).map((n) => n.defId);
    expect(stones({})).toEqual(['reef-stone-1', 'reef-stone-2', 'reef-stone-3']);
    expect(stones({ [stepFlag(YARN_STONES[0])]: true })).toEqual(['reef-stone-1-lit', 'reef-stone-2', 'reef-stone-3']);
    const all = Object.fromEntries(YARN_STONES.map((id) => [stepFlag(id), true]));
    expect(stones(all)).toEqual(['reef-stone-1-lit', 'reef-stone-2-lit', 'reef-stone-3-lit']);
    const open = reach(reef);
    for (const n of reef.npcs.filter((n) => n.defId.startsWith('reef-stone'))) {
      expect(touches(open, n.x, n.y), n.defId).toBe(true);
      expect(isThing(NPC_DEFS[n.defId]), n.defId).toBe(true);
    }
  });

  it('a lit stone repeats the way to the next one until that one glows too (round 3)', () => {
    const said = (id: string, flags: Record<string, boolean>) => visibleLines(NPC_DEFS[id].lines, flags).map(lineText);
    const one = { [stepFlag(YARN_STONES[0])]: true };
    expect(said('reef-stone-1-lit', one)).toEqual([expect.stringMatching(/EAST, over the road/)]);
    const two = { ...one, [stepFlag(YARN_STONES[1])]: true };
    expect(said('reef-stone-1-lit', two)).toEqual([expect.stringMatching(/back where it belongs/)]);
    expect(said('reef-stone-2-lit', two)).toEqual([expect.stringMatching(/SOUTH-WEST, to the sandbar/)]);
    const three = { ...two, [stepFlag(YARN_STONES[2])]: true };
    expect(said('reef-stone-2-lit', three)).toEqual([expect.stringMatching(/back where it belongs/)]);
    // The last one sends you home to Yarn until her tale is done (round 4).
    expect(said('reef-stone-3-lit', three)).toEqual([expect.stringMatching(/Go and tell Tale-Fisher Yarn/)]);
    expect(said('reef-stone-3-lit', { ...three, [questDoneFlag({ id: YARN_QUEST })]: true })).toEqual([expect.stringMatching(/back where it belongs/)]);
  });

  it("the shop's name plate is on screen as you arrive (round 3)", () => {
    const shop = cove.buildings![0];
    // The camera centres on the spawn: VIEW_COLS wide, so it shows from spawn.x - VIEW_COLS / 2.
    expect(shop.x).toBeGreaterThanOrEqual(cove.spawn.x + 0.5 - VIEW_COLS / 2);
    // …and the cove's canvas colour matches its tileset's ground (zones.ts / tiles.py).
    expect(cove.ground).toEqual([124, 150, 134]);
  });

  it("Bess's shell shop has its own style and sells potions and Hint Feathers", () => {
    expect(cove.buildings!.map((b) => b.style)).toEqual(['shell']);
    expect(NPC_DEFS['ink-bess'].role).toBe('merchant');
  });
});

describe('Taleshore III: Songstone Cliffs and the Quiet Quarter (#75 item 15f)', () => {
  const tale = ZONES.taleshore;
  const cliffs = ZONES['songstone-cliffs'];
  const quarter = ZONES['quiet-quarter'];
  const place = (name: string) => tale.places!.find((p) => p.name === name)!;

  it('both are at the ends of road branches from Port Lantern, the way back on the road beside each icon', () => {
    const fromTown = reach(tale, { from: { x: 30, y: 21 } });
    for (const name of ['Songstone Cliffs', 'Quiet Quarter']) {
      const p = place(name);
      expect(p.byAir, name).toBeFalsy();
      expect(touches(fromTown, p.x, p.y), name).toBe(true);
      const back = ZONES[tale.exits.find((e) => e.x === p.x && e.y === p.y)!.to].exits[0];
      expect(Math.abs(back.spawnX - p.x) + Math.abs(back.spawnY - p.y), name).toBe(1);
      expect(tileAt(tale, back.spawnX, back.spawnY), name).toBe('=');
    }
  });

  it('a music field and a words field at tier 6: a swift critter on the cliffs, a shielded one in the quarter', () => {
    expect(cliffs.topic).toBe('music');
    expect(quarter.topic).toBe('words');
    const behavior = { 'songstone-cliffs': 'swift', 'quiet-quarter': 'shielded' } as const;
    for (const z of [cliffs, quarter]) {
      expect(z.kind).toBe('field');
      expect(zoneTier(z.id)).toBe(6);
      const critters = [...new Set(z.enemies.map((e) => e.defId))];
      expect(critters, z.id).toHaveLength(3);
      expect(critters.filter((d) => ENEMY_DEFS[d].behavior).map((d) => ENEMY_DEFS[d].behavior), z.id).toEqual([behavior[z.id as keyof typeof behavior]]);
    }
  });

  it("each place's riddle-chest is behind its gate", () => {
    for (const z of [cliffs, quarter]) {
      const chests = z.map.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === 'C' ? [{ x, y }] : [])));
      expect(chests, z.id).toHaveLength(1);
      expect(touches(reach(z), chests[0].x, chests[0].y), z.id).toBe(false);
      expect(touches(reach(z, { gates: 'open' }), chests[0].x, chests[0].y), z.id).toBe(true);
    }
  });

  it("Reso's songstones are high, middle and low ledges — top, middle, bottom — each in reach, rung by its step", () => {
    const at = (id: string) => cliffs.npcs.find((n) => n.defId === id)!;
    const [high, middle, low] = ['songstone-high', 'songstone-middle', 'songstone-low'].map(at);
    expect(high.y).toBeLessThan(10); // the top ledge, above the first cliff
    expect(middle.y).toBeGreaterThan(11);
    expect(middle.y).toBeLessThan(20);
    expect(low.y).toBeGreaterThan(20); // the bottom ledge, with Reso
    for (const s of [high, middle, low]) expect(touches(reach(cliffs), s.x, s.y), s.defId).toBe(true);
    const shown = (flags: Record<string, boolean>) => cliffs.npcs.filter((n) => n.defId.startsWith('songstone') && npcPresent(n, flags)).map((n) => n.defId);
    expect(shown({})).toEqual(['songstone-high', 'songstone-middle', 'songstone-low']);
    expect(shown({ [stepFlag(RESO_STONES[0])]: true })).toEqual(['songstone-high-rung', 'songstone-middle', 'songstone-low']);
    // A rung stone says which is next until that one rings too (round 1).
    const said = (id: string, flags: Record<string, boolean>) => visibleLines(NPC_DEFS[id].lines, flags).map(lineText);
    expect(said('songstone-high-rung', { [stepFlag(RESO_STONES[0])]: true })).toEqual([expect.stringMatching(/Next: the MIDDLE songstone/)]);
    expect(said('songstone-high-rung', { [stepFlag(RESO_STONES[1])]: true })).toEqual([expect.stringMatching(/still ringing: DIIING/)]);
    expect(said('songstone-middle-rung', {})).toEqual([expect.stringMatching(/Last: the LOW songstone/)]);
  });

  it("the quarter's two buildings are its own style; Sotto sells there", () => {
    expect(quarter.buildings!.map((b) => b.style)).toEqual(['hush', 'hush']);
    expect(NPC_DEFS['quiet-sotto'].role).toBe('merchant');
  });
});

describe('Chorus Isle: the Crystal of Voices (#75 item 15g)', () => {
  const tale = ZONES.taleshore;
  const isle = ZONES['chorus-isle'];
  const place = tale.places!.find((p) => p.name === 'Chorus Isle')!;
  const fiend = isle.enemies.find((e) => e.defId === 'hush-fiend')!;

  it('an island far out west on Taleshore that only Ember reaches; the way back is grass she can take off from', () => {
    expect(place.byAir).toBe(true);
    expect(touches(reach(tale, { from: { x: 30, y: 21 } }), place.x, place.y)).toBe(false);
    const back = isle.exits[0];
    expect(Math.abs(back.spawnX - place.x) + Math.abs(back.spawnY - place.y)).toBe(1);
    expect(landable(tileAt(tale, back.spawnX, back.spawnY))).toBe(true);
    expect(tale.exits.find((e) => e.x === place.x && e.y === place.y)!.to).toBe('chorus-isle');
  });

  it("Act III's crystal zone: words, tier 6, the Hush Fiend restores the Crystal of Voices", () => {
    expect(isle.topic).toBe('words');
    expect(zoneTier(isle.id)).toBe(6);
    expect(actCrystals(3).map((t) => t.zoneId)).toEqual(['chorus-isle']);
    expect(fiendFor('words')?.id).toBe('hush-fiend');
    expect(ENEMY_DEFS['hush-fiend']).toMatchObject({ role: 'fiend', isBoss: true, topic: 'words' });
  });

  it('its gate takes BOTH Chorus Keys: shut with one, open with two — and only the gate stands between', () => {
    expect(keysForZone('chorus-isle').map((k) => k.id)).toEqual(['chorus-a', 'chorus-b']);
    expect(holdsKeysFor('chorus-isle', {})).toBe(false);
    expect(holdsKeysFor('chorus-isle', { [keyFlag('chorus-a')]: true })).toBe(false);
    expect(holdsKeysFor('chorus-isle', { [keyFlag('chorus-b')]: true })).toBe(false);
    expect(holdsKeysFor('chorus-isle', { [keyFlag('chorus-a')]: true, [keyFlag('chorus-b')]: true })).toBe(true);
    // Single-key gates don't change.
    expect(holdsKeysFor('sunken-archive', { [keyFlag('memoria')]: true })).toBe(true);
    expect(holdsKeysFor('numbria', { [keyFlag('chorus-a')]: true })).toBe(false);
    expect(tileAt(isle, isle.keyGate!.x, isle.keyGate!.y)).toBe('G');
    expect(touches(reach(isle), fiend.x, fiend.y)).toBe(false);
    expect(touches(reach(isle, { gates: 'open' }), fiend.x, fiend.y)).toBe(true);
  });

  it("a Return town: Brio's inn, Sage Aria's hall and Coda's cottage in its own chorus style, 8+ people", () => {
    expect(RETURN_TOWNS).toContain('chorus-isle');
    expect(innOf(isle)?.id).toBe('resting-note-inn');
    expect(new Set(isle.buildings!.map((b) => b.style))).toEqual(new Set(['chorus']));
    expect(NPC_DEFS['sage-aria']).toMatchObject({ role: 'sage', topic: 'words' });
    expect(NPC_DEFS['chorus-brio'].role).toBe('innkeeper');
  });

  it("Coda's three refrains are in key-item chests in the open grass, no gate in the way", () => {
    const open = reach(isle);
    expect(isle.keyChests!.map((c) => c.item).sort()).toEqual(['refrain-bedtime', 'refrain-noon', 'refrain-sunrise']);
    for (const c of isle.keyChests!) {
      expect(tileAt(isle, c.x, c.y), `${c.item}`).toBe('C');
      expect(touches(open, c.x, c.y), `${c.item}`).toBe(true);
    }
  });

  it('Old Cadence names whichever Chorus Key is still missing', () => {
    const said = (flags: Record<string, boolean>) => visibleLines(NPC_DEFS['chorus-cadence'].lines, flags).map(lineText).join(' ');
    expect(said({})).toMatch(/Two locks, two Chorus Keys!/);
    expect(said({ [keyFlag('chorus-a')]: true })).toMatch(/The other lock needs the Second/);
    expect(said({ [keyFlag('chorus-b')]: true })).toMatch(/The other lock needs the First/);
    const both = { [keyFlag('chorus-a')]: true, [keyFlag('chorus-b')]: true };
    expect(said(both)).toMatch(/You hold BOTH Chorus Keys/);
    expect(said(both)).not.toMatch(/other lock/);
    const after = said({ ...both, [crystalFlag('words')]: true });
    expect(after).toMatch(/Crystal of Voices rings again/);
    // Once the Fiend is gone he doesn't warn about it any more (round 2).
    expect(after).not.toMatch(/It lives in the hollow/);
  });
});

describe("Chartmaker's Rest: Act III's last place (#75 item 15h)", () => {
  const tale = ZONES.taleshore;
  const rest = ZONES['chartmakers-rest'];
  const place = tale.places!.find((p) => p.name === "Chartmaker's Rest")!;

  it('an island north-west of Port Lantern that only Ember reaches; the way back is grass she can take off from', () => {
    expect(place.byAir).toBe(true);
    expect(touches(reach(tale, { from: { x: 30, y: 21 } }), place.x, place.y)).toBe(false);
    for (const back of rest.exits) {
      expect(back.to).toBe('taleshore');
      expect(Math.abs(back.spawnX - place.x) + Math.abs(back.spawnY - place.y)).toBe(1);
      expect(landable(tileAt(tale, back.spawnX, back.spawnY))).toBe(true);
    }
    expect(tale.exits.find((e) => e.x === place.x && e.y === place.y)!.to).toBe('chartmakers-rest');
    expect(zoneTier(rest.id)).toBe(6);
  });

  it('a safe story zone: no critters, the Chartmaker in his study, Pen and Inka outside', () => {
    expect(rest.enemies).toEqual([]);
    expect(RETURN_TOWNS).not.toContain('chartmakers-rest');
    const study = rest.buildings!.find((b) => b.id === 'chart-study')!;
    expect(study.style).toBe('chart');
    const chartmaker = rest.npcs.find((n) => n.defId === 'chart-chartmaker')!;
    expect(chartmaker.x >= study.x && chartmaker.x < study.x + study.w && chartmaker.y >= study.y && chartmaker.y < study.y + study.h).toBe(true);
    expect(rest.npcs.map((n) => n.defId).sort()).toEqual(['chart-chartmaker', 'chart-inka', 'chart-pen']);
    const open = reach(rest);
    for (const n of rest.npcs) expect(touches(open, n.x, n.y), n.defId).toBe(true);
  });

  it("Pen's nest is a key-item chest holding the Compass Quill, open to walk to", () => {
    expect(rest.keyChests!.map((c) => c.item)).toEqual(['compass-quill']);
    const nest = rest.keyChests![0];
    expect(tileAt(rest, nest.x, nest.y)).toBe('C');
    expect(touches(reach(rest), nest.x, nest.y)).toBe(true);
  });

  it('before Voices the Chartmaker says to free it first; with the chart, he says to keep it safe', () => {
    const said = (flags: Record<string, boolean>) => visibleLines(NPC_DEFS['chart-chartmaker'].lines, flags).map(lineText).join(' ');
    expect(said({})).toMatch(/Crystal of Voices sings again\. Free it/);
    expect(said({ [crystalFlag('words')]: true })).not.toMatch(/Free it/);
    expect(said({ [crystalFlag('words')]: true, [BLANK_CHART_HELD]: true })).toMatch(/Keep the Blank Chart safe/);
    // Inka, visited before the quill is found, says what she needs (round 4).
    const inka = (flags: Record<string, boolean>) => visibleLines(NPC_DEFS['chart-inka'].lines, flags).map(lineText).join(' ');
    const offered = { [crystalFlag('words')]: true, [questOfferedFlag({ id: 'blank-chart' })]: true };
    expect(inka(offered)).toMatch(/Bring me his Compass Quill/);
    expect(inka({ ...offered, [stepFlag('chart-quill-ink')]: true })).not.toMatch(/Bring me his Compass Quill/);
    // Inked, she points back to him, and says who she is first before he's asked (saas UX review).
    expect(inka({ ...offered, [stepFlag('chart-quill-ink')]: true })).toMatch(/^It worked! Run the Starlit Quill back/);
    expect(inka({})).toMatch(/^I'm Inka!/);
  });
});

describe('Chorus Isle after round 2 (#75 item 15g)', () => {
  it("Coda's songs wait for the hush to lift: hummed before Voices, sung out loud after", () => {
    const done = { 'quest:coda-refrains:done': true };
    const said = (flags: Record<string, boolean>) => visibleLines(NPC_DEFS['chorus-coda'].lines, flags).map(lineText).join(' ');
    expect(questDoneFlag({ id: 'coda-refrains' })).toBe('quest:coda-refrains:done');
    expect(said(done)).toMatch(/very quietly, until the Hush Fiend is gone/);
    expect(said(done)).not.toMatch(/out loud/);
    expect(said({ ...done, [crystalFlag('words')]: true })).toMatch(/out loud/);
  });
});

describe('the Crystal of Voices in the hollow (#75 item 15g, round 4)', () => {
  it("stands on the Hush Fiend's own spot, only once Voices is restored", () => {
    const isle = ZONES['chorus-isle'];
    const crystal = isle.npcs.find((n) => n.defId === 'chorus-crystal')!;
    const fiend = isle.enemies.find((e) => e.defId === 'hush-fiend')!;
    expect({ x: crystal.x, y: crystal.y }).toEqual({ x: fiend.x, y: fiend.y });
    expect(npcPresent(crystal, {})).toBe(false);
    expect(npcPresent(crystal, { [crystalFlag('words')]: true })).toBe(true);
  });
});

describe('the Dream Root Door (#75 item 16a)', () => {
  const door = ZONES['dreamroot-door'];
  const grounds = ZONES['crystal-spire'];

  it("is safe, under the Spire: no critters, a save crystal, Keeper Aurora's inn — and no Return spot", () => {
    expect(door.kind).toBe('dungeon');
    expect(door.enemies).toEqual([]);
    expect(door.map.some((r) => r.includes('S'))).toBe(true);
    const inn = innOf(door)!;
    expect(inn.name).toBe('Lamplight Rest');
    const aurora = door.npcs.find((p) => p.defId === 'root-aurora')!;
    expect(NPC_DEFS['root-aurora'].role).toBe('innkeeper');
    expect(buildingInside(door, aurora.x, aurora.y)?.id).toBe(inn.id);
    expect(RETURN_TOWNS).not.toContain('dreamroot-door');
    expect(INN_ONLY).toContain('dreamroot-door');
  });

  it('beaten here, you wake in the Lamplight Rest, Aurora looking after you; from there the stairs up are walkable', () => {
    const shelter = shelterOf(door)!;
    expect(shelter.host).toBe('Keeper Aurora');
    expect(shelter.cell).toEqual(innWakeCell(door));
    const out = reach(door, { from: shelter.cell });
    const up = door.exits.find((e) => e.to === 'crystal-spire')!;
    expect(out.has(`${up.x},${up.y}`)).toBe(true);
  });

  it("the stairs down sit under a knot of old fog on the Spire's grounds from the start, lifted only as Act IV opens", () => {
    const stairs = grounds.exits.find((e) => e.to === 'dreamroot-door')!;
    expect(tileAt(grounds, stairs.x, stairs.y)).toBe('>');
    expect(fogAt(grounds, stairs.x, stairs.y, {})).not.toBeNull();
    expect(fogAt(grounds, stairs.x, stairs.y, { [BLANK_CHART_HELD]: true })).not.toBeNull();
    expect(fogAt(grounds, stairs.x, stairs.y, { [ACT4_SEEN]: true })).toBeNull();
    // Act I's grounds still walk from the gate to the Spire.
    const open = reach(grounds, { flags: {} });
    expect(touches(open, grounds.spire!.x, grounds.spire!.y)).toBe(true);
  });

  it('while the fifth memory waits below, Aurora says so — the 🚩 never leads to silence (16a reviews)', () => {
    const say = (flags: Record<string, boolean>) => visibleLines(NPC_DEFS['root-aurora'].lines, flags).map(lineText).join(' ');
    expect(say({ [stepFlag('name-chronicle')]: true })).toMatch(/Someone below still remembers her/);
    expect(say({ [stepFlag('name-chronicle')]: true, [NAME_LEARNED]: true })).not.toMatch(/Someone below/);
    expect(say({})).not.toMatch(/Someone below/);
    // Gone once Young Wick has said it (16a code review round 2).
    expect(say({ [stepFlag('name-chronicle')]: true, [stepFlag('name-young-wick')]: true })).not.toMatch(/Someone below/);
  });

  it("Aurora's welcome is always her first line, and it says hello for the 🚩 (16a code review round 3)", () => {
    for (const flags of [{}, { [ACT4_SEEN]: true }, { [stepFlag('name-chronicle')]: true }, { [NAME_LEARNED]: true }]) {
      const first = visibleLines(NPC_DEFS['root-aurora'].lines, flags)[0];
      expect(typeof first === 'string' ? null : first.setFlag).toBe(MET_ROOT_AURORA);
    }
  });

  it('nobody still says the name is lost once it is learned (16a UX review round 2)', () => {
    const say = (id: string, flags: Record<string, boolean>) => visibleLines(NPC_DEFS[id].lines, flags).map(lineText).join(' ');
    const learned = { [crystalFlag('history')]: true, [crystalFlag('words')]: true, 'met-mnem': true, [ACT2_SEEN]: true, [ACT4_SEEN]: true, [BLANK_CHART_HELD]: true, [stepFlag('name-wick')]: true, [NAME_LEARNED]: true };
    expect(say('village-elder', learned)).not.toMatch(/Especially me/);
    expect(say('village-elder', learned)).toMatch(/Aster! With the daisy/);
    expect(say('hill-keeper', learned)).not.toMatch(/Still no name/);
    expect(say('woods-sprite', learned)).not.toMatch(/ALMOST remembering/);
    expect(say('chart-chartmaker', learned)).not.toMatch(/mystery worth solving/);
    expect(say('elder-lumen', learned)).not.toMatch(/I don't know it/);
  });

  it('Keeper Aurora moves down as Act IV opens: on the grounds before, at the Door after', () => {
    const before = grounds.npcs.find((p) => p.defId === 'spire-keeper')!;
    expect(npcPresent(before, {})).toBe(true);
    expect(npcPresent(before, { [ACT4_SEEN]: true })).toBe(false);
    expect(NPC_DEFS['root-aurora'].spriteId).toBe('spire-keeper');
  });
});

describe("Wisp's new face (#75 item 16a)", () => {
  it('Wisp looks new once the name is learned — in the world and in talk', () => {
    const wisp = NPC_DEFS['woods-sprite'];
    expect(npcSpriteId(wisp, {})).toBe('woods-sprite');
    expect(npcSpriteId(wisp, { [NAME_LEARNED]: true })).toBe('wisp-named');
    expect(npcEmoji(wisp, { [NAME_LEARNED]: true })).toBe('🌼');
    expect(npcSpriteId(NPC_DEFS['village-elder'], { [NAME_LEARNED]: true })).toBe('village-elder');
  });
});

describe('Lumina-That-Was (#75 item 16b)', () => {
  const ids = ['memory-field', 'memory-village', 'first-classroom'] as const;

  it('lies below the Dream Root Door: down past Old Knot, the three places joined edge to edge', () => {
    const door = ZONES['dreamroot-door'];
    const down = door.exits.filter((e) => e.to === 'memory-field');
    expect(down.length).toBe(2);
    const open = reach(door, { flags: {} });
    for (const e of down) expect(open.has(`${e.x},${e.y}`)).toBe(true);
    expect(ZONES['memory-field'].exits.map((e) => e.to).sort()).toEqual(['dreamroot-door', 'dreamroot-door', 'first-classroom', 'first-classroom', 'memory-village', 'memory-village']);
    for (const id of ids) {
      const z = ZONES[id];
      const area = reach(z, { flags: {}, gates: 'open' });
      for (const e of z.exits) expect(area.has(`${e.x},${e.y}`), `${id} exit to ${e.to}`).toBe(true);
    }
  });

  it('mixed topics: each chest, gate and riddle keeps one of its zone\'s topics, every time', () => {
    for (const id of ids) {
      const z = ZONES[id];
      expect(z.topic).toBeUndefined();
      expect(z.topics!.length).toBeGreaterThanOrEqual(2);
      for (let y = 0; y < z.map.length; y++)
        for (let x = 0; x < z.map[y].length; x++) {
          expect(z.topics).toContain(topicAt(z, x, y, 'math'));
          expect(topicAt(z, x, y, 'math')).toBe(topicAt(z, x, y, 'math'));
        }
    }
    const room = ZONES['first-classroom'];
    expect(chestTopicAt(room, 17, 8)).toBe(topicAt(room, 17, 8, 'math'));
    // A zone with one topic is unchanged.
    expect(topicAt(ZONES.numbria, 3, 3, 'words')).toBe('math');
  });

  it('beaten anywhere down here, you wake at the Dream Root Door (#104g)', () => {
    for (const id of ids) expect(ZONES[id].shelterIn, id).toBe('dreamroot-door');
  });

  it('Young Wick stands in the old village; the Unnamed Dog, Young Lumen, Monitor Prim and the slates are all placed', () => {
    const at = (def: string) => ids.find((id) => ZONES[id].npcs.some((p) => p.defId === def));
    expect(at('memory-young-wick')).toBe('memory-village');
    expect(at('memory-dog')).toBe('memory-village');
    expect(at('memory-young-lumen')).toBe('memory-field');
    expect(at('class-prim')).toBe('first-classroom');
    for (const n of [1, 2, 3]) expect(at(`class-slate-${n}`)).toBe('first-classroom');
  });

  it('Old Knot says the way down is open now', () => {
    const say = visibleLines(NPC_DEFS['root-knot'].lines, {}).map(lineText).join(' ');
    expect(say).toMatch(/untangled the way down/);
    expect(say).not.toMatch(/knotted shut/);
  });
});
