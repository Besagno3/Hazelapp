import { describe, it, expect } from 'vitest';
import { ZONES, ZONE_IDS, LEGEND_CHARS, WALKABLE_CHARS, HUB_ZONE, tileAt, gateIdAt } from './zones';
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
