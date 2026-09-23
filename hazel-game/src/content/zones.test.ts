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
  safeSpawn,
} from './zones';
import { exitSide } from '../lib/transition';
import { NPC_DEFS } from './npcs';
import { ENEMY_DEFS, fiendFor } from './enemies';
import { TOPIC_REGISTRY } from './topics';
import type { ZoneDef } from './zones';

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

  it("every 'E' tile has an exit entry and every exit lands on a walkable tile", () => {
    for (const z of allZones) {
      for (let y = 0; y < z.map.length; y++) {
        for (let x = 0; x < z.map[y].length; x++) {
          if (z.map[y][x] === 'E') {
            const exit = z.exits.find((e) => e.x === x && e.y === y);
            expect(exit, `${z.id} E at ${x},${y} missing exit def`).toBeDefined();
          }
        }
      }
      for (const exit of z.exits) {
        expect(tileAt(z, exit.x, exit.y), `${z.id} exit tile ${exit.x},${exit.y}`).toBe('E');
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

  it('zone enemies match the zone topic', () => {
    for (const z of allZones) {
      for (const p of z.enemies) {
        expect(ENEMY_DEFS[p.defId].topic, `${z.id} enemy ${p.defId} topic`).toBe(z.topic);
      }
    }
  });

  it('gates and chests only exist in topic zones (their questions need a topic)', () => {
    for (const z of allZones) {
      if (z.topic) continue;
      for (const row of z.map) {
        expect(row.includes('G'), `${z.id} must not contain gates`).toBe(false);
        expect(row.includes('C'), `${z.id} must not contain chests`).toBe(false);
      }
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

  it('the hub is safe (no enemies) and links to all four topic zones', () => {
    const hub = ZONES[HUB_ZONE];
    expect(hub.enemies).toHaveLength(0);
    const targets = new Set(hub.exits.map((e) => e.to));
    for (const t of TOPIC_REGISTRY) expect(targets.has(t.zoneId), `hub → ${t.zoneId}`).toBe(true);
  });

  it('every zone is reachable from the hub by walking exits', () => {
    const seen = new Set<string>([HUB_ZONE]);
    const queue: string[] = [HUB_ZONE];
    while (queue.length) {
      const id = queue.shift()!;
      for (const exit of ZONES[id as keyof typeof ZONES].exits) {
        if (!seen.has(exit.to)) {
          seen.add(exit.to);
          queue.push(exit.to);
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

/** Cells reachable on foot from (sx,sy). */
function reachable(z: ZoneDef, sx: number, sy: number): Set<string> {
  const seen = new Set<string>([`${sx},${sy}`]);
  const queue = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const key = `${nx},${ny}`;
      if (seen.has(key) || !isWalkable(z, nx, ny)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

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
      const open = reachable(z, z.spawn.x, z.spawn.y);
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
  it('every exit sits on a map edge, so it has a slide direction', () => {
    for (const z of allZones) {
      for (const e of z.exits) {
        expect(exitSide(e.x, e.y, z.map[0].length, z.map.length), `${z.id} exit ${e.x},${e.y}`).not.toBeNull();
      }
    }
  });
});
