import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEA_CHARS, ZONES, fogAt, tileAt, type ZoneDef } from './zones';
import { ENEMY_DEFS, atTier, habitatOf, spawnEnemy, spawnPlaced } from './enemies';
import { battleBackdrop } from './tiles';
import { BOAT_HOME, boatAfterDefeat, boatSpot, BOAT_MENDED } from './boat';
import { RETURN_TOWNS } from './fieldSpells';
import { innOf } from './zones';
import { NPC_DEFS } from './npcs';
import { reach } from '../lib/reach';
import { encounterHabitat, meetsHero, seaEntryCell } from '../lib/travel';
import { WANDER_TUNING } from '../lib/wander';
import { HABITATS } from '../types';

/**
 * Sea critters (#75 roadmap item 14d): they swim the Silver Shallows' open
 * water, and each critter fights only a hero in its own element — a sea
 * critter a sailing hero, a land critter one on foot (#108j).
 */

const allZones = Object.values(ZONES);
const leash = WANDER_TUNING.enemy.leashTiles;
const seaFoes = allZones.flatMap((z) =>
  z.enemies.filter((p) => ENEMY_DEFS[p.defId]?.habitat === 'sea').map((p) => ({ z, p })),
);
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Every open-sea cell along a sea-linked edge where a boat sails in — one in from the edge. */
function arrivals(z: ZoneDef): { x: number; y: number }[] {
  const cols = z.map[0].length;
  const rows = z.map.length;
  const cells: { x: number; y: number }[] = [];
  for (const l of z.seaLinks ?? []) {
    const along = l.side === 'east' || l.side === 'west' ? rows : cols;
    for (let i = 0; i < along; i++) {
      const c =
        l.side === 'west' ? { x: 1, y: i } : l.side === 'east' ? { x: cols - 2, y: i } : l.side === 'north' ? { x: i, y: 1 } : { x: i, y: rows - 2 };
      if (SEA_CHARS.has(tileAt(z, c.x, c.y))) cells.push(c);
    }
  }
  return cells;
}

describe('who fights whom (#75 item 14d, #108j)', () => {
  it('on foot you meet land critters; sailing, sea critters — never the other', () => {
    expect(encounterHabitat('foot')).toBe('land');
    expect(encounterHabitat('boat')).toBe('sea');
    expect(meetsHero('land', 'foot')).toBe(true);
    expect(meetsHero('land', 'boat')).toBe(false);
    expect(meetsHero('sea', 'boat')).toBe(true);
    expect(meetsHero('sea', 'foot')).toBe(false);
    // A critter with no habitat is a land critter (every one before 14d).
    expect(meetsHero(undefined, 'foot')).toBe(true);
    expect(meetsHero(undefined, 'boat')).toBe(false);
    expect([...HABITATS]).toEqual(['land', 'sea']);
  });

  it('every enemy lives on land unless it says otherwise; the habitat rides into battle', () => {
    for (const def of Object.values(ENEMY_DEFS)) {
      const e = spawnEnemy(def.id, 'silver-shallows', 'x', 9);
      expect(habitatOf(e), def.id).toBe(def.habitat ?? 'land');
      expect(habitatOf(def)).toBe(habitatOf(e));
    }
    const puffer = spawnPlaced('silver-shallows', ZONES['silver-shallows'].enemies[0], 9);
    expect(puffer.habitat).toBe('sea');
    // Mercy easing a fight keeps it at sea.
    expect(atTier(puffer, 1).habitat).toBe('sea');
    expect(spawnEnemy('count-bat', 'numbria', 'x', 9).habitat).toBeUndefined();
  });
});

describe('the sea critters of the Silver Shallows (#75 item 14d)', () => {
  it('two or three roam the Shallows, and none swim anywhere else yet', () => {
    const shallows = seaFoes.filter((f) => f.z.id === 'silver-shallows');
    expect(shallows.length).toBeGreaterThanOrEqual(2);
    expect(shallows.length).toBeLessThanOrEqual(3);
    expect(seaFoes.length).toBe(shallows.length);
    expect(new Set(shallows.map((f) => f.p.defId)).size).toBe(shallows.length);
  });

  it('are sea-life (nature) critters, never bosses, each with a name and a look of its own', () => {
    const defs = Object.values(ENEMY_DEFS).filter((d) => d.habitat === 'sea');
    expect(defs.map((d) => d.id).sort()).toEqual(['bubble-puffer', 'inkling', 'starfix']);
    for (const d of defs) {
      expect(d.topic, d.id).toBe('nature');
      expect(d.isBoss ?? false, d.id).toBe(false);
      expect(existsSync(join(process.cwd(), 'public', 'sprites', d.id, 'world.png')), d.id).toBe(true);
      expect(existsSync(join(process.cwd(), 'public', 'sprites', d.id, 'battle.png')), d.id).toBe(true);
    }
    // −1 / 0 / +1, like every zone's trio; the tougher two have a twist.
    expect(defs.map((d) => d.levelOffset).sort()).toEqual([-1, 0, 1]);
    expect(ENEMY_DEFS.inkling.behavior).toBe('trickster');
    expect(ENEMY_DEFS.starfix.behavior).toBe('healer');
  });

  it('swim open sea on a sea-linked map: home and whole leash on open water, clear of fog', () => {
    for (const { z, p } of seaFoes) {
      expect(z.seaLinks?.length, `${z.id} is a sea a boat can reach`).toBeGreaterThan(0);
      for (let y = p.y - leash; y <= p.y + leash; y++) {
        for (let x = p.x - leash; x <= p.x + leash; x++) {
          expect(SEA_CHARS.has(tileAt(z, x, y)), `${p.defId}: ${x},${y} is open sea`).toBe(true);
          // Every fog lifted or none: the Great Fogbank only thins in Act III.
          expect(fogAt(z, x, y, {}), `${p.defId}: ${x},${y} clear of fog`).toBeNull();
        }
      }
    }
  });

  it('a sailing hero can reach every one of them from where the boat sails in', () => {
    for (const { z, p } of seaFoes) {
      const entry = (z.seaLinks ?? []).map((l) => seaEntryCell(z, l.side)).find((c) => c !== null)!;
      expect(reach(z, { from: entry, aboard: true }).has(`${p.x},${p.y}`), `${p.defId} at ${p.x},${p.y}`).toBe(true);
    }
  });

  it('never swim up to any land, or the edge you sail in by — no fight on landing, climbing in or arriving', () => {
    // Any land, not just beaches and docks: the boat can be moored beside any
    // shore (Return, a load), and a hero climbs in from any cell beside it.
    for (const { z, p } of seaFoes) {
      for (let y = 0; y < z.map.length; y++) {
        for (let x = 0; x < z.map[0].length; x++) {
          if (SEA_CHARS.has(tileAt(z, x, y))) continue;
          expect(cheb(p, { x, y }), `${p.defId} at ${p.x},${p.y} vs the land at ${x},${y}`).toBeGreaterThan(leash + 1);
        }
      }
      for (const a of arrivals(z)) {
        expect(cheb(p, a), `${p.defId} at ${p.x},${p.y} vs where a boat sails in at ${a.x},${a.y}`).toBeGreaterThan(leash + 1);
      }
    }
  });

  it("Lamplighter Ness says why they never bother you on the sand", () => {
    const said = NPC_DEFS['gull-lamplighter'].lines.map((l) => (typeof l === 'string' ? l : l.text)).join(' ');
    expect(said).toMatch(/only bother boats/);
  });
});

describe('a battle at sea (#75 item 14d)', () => {
  it('lost at sea, the hero wakes ashore and Old Marlow has rowed the boat home to his dock', () => {
    const flags = { [BOAT_MENDED]: true };
    const afloat = { aboard: true, boat: null, flags };
    const after = boatAfterDefeat(afloat);
    expect(after).toEqual({ aboard: false, boat: null });
    expect(boatSpot({ ...after, flags })).toEqual(BOAT_HOME);
    // Lost ashore (a land critter): the boat stays wherever it's moored.
    const moored = { zoneId: 'silver-shallows' as const, x: 19, y: 20 };
    expect(boatAfterDefeat({ aboard: false, boat: moored })).toEqual({ aboard: false, boat: moored });
  });

  it('every inn is a town on Marlow\'s own map, so a hero woken there after a sea defeat can walk to the boat', () => {
    // `boatAfterDefeat` sends the boat to Marlow's dock on Dawnreach. An inn on
    // an island (14h plans Binder's, in the Sunken Archive) would strand the
    // hero there — moor the boat at that town instead when one comes (#112o).
    const innTowns = Object.values(ZONES).filter((z) => innOf(z));
    expect(innTowns.length).toBeGreaterThan(0);
    for (const z of innTowns) {
      expect(z.exits.some((e) => e.to === BOAT_HOME.zoneId), `${z.id}'s inn opens onto ${BOAT_HOME.zoneId}`).toBe(true);
    }
    expect([...RETURN_TOWNS].sort()).toEqual(innTowns.map((z) => z.id).sort());
  });

  it("Old Marlow, who gives and mends the boat, and Vela's door stand out of every Starfall Coast critter's reach (#112w)", () => {
    const coast = ZONES['starfall-coast'];
    const marlow = coast.npcs.find((p) => p.defId === 'coast-fisher')!;
    // Each door and the doorstep below it.
    const doors = coast.map.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === 'D' ? [{ x, y }, { x, y: y + 1 }] : [])));
    expect(doors.length).toBeGreaterThan(0);
    const reachPx = 32 * WANDER_TUNING.enemy.leashTiles + 28; // its leash + a touch
    for (const e of coast.enemies) {
      // Walking up to Marlow or chatting never meets one — with a step to spare…
      expect(Math.hypot(e.x - marlow.x, e.y - marlow.y) * 32, e.defId).toBeGreaterThan(reachPx + 32);
      // …nor does stepping out of the observatory, onto its doorstep.
      for (const d of doors) expect(Math.hypot(e.x - d.x, e.y - d.y) * 32, `${e.defId} vs door ${d.x},${d.y}`).toBeGreaterThan(reachPx);
    }
  });

  it('critters moved so a sleeping one\'s "z Z" are its own stay out of reach of the way on, doors and people (#112e)', () => {
    const reachPx = 32 * WANDER_TUNING.enemy.leashTiles + 28;
    const clear = (zoneId: keyof typeof ZONES, defId: string, cells: { x: number; y: number }[]) => {
      const e = ZONES[zoneId].enemies.find((p) => p.defId === defId)!;
      for (const c of cells) expect(Math.hypot(e.x - c.x, e.y - c.y) * 32, `${defId} vs ${c.x},${c.y}`).toBeGreaterThan(reachPx);
    };
    // The Depths' only way down (the vault gate and the cells before it), the Tinkery's doorstep, Echo,
    // the way out and where you arrive.
    clear('clockwork-depths', 'hourglass-imp', [
      { x: 10, y: 8 },
      { x: 11, y: 8 },
      { x: 10, y: 7 },
      { x: 11, y: 7 },
      { x: 17, y: 6 },
      { x: 14, y: 5 },
      { x: 10, y: 0 },
      { x: 11, y: 0 },
      { x: 10, y: 2 },
    ]);
    // Moonwell Grove's gate south and the chest behind it.
    clear('moonwell-grove', 'grumblebee', [
      { x: 10, y: 10 },
      { x: 11, y: 10 },
      { x: 10, y: 11 },
    ]);
  });

  it('every map with sea critters has a battle-at-sea backdrop (256×144); land battles keep the zone one', () => {
    for (const id of new Set(seaFoes.map((f) => f.z.id))) {
      const path = battleBackdrop(id, 'sea');
      expect(path).toBe(`/backgrounds/${id}-sea.png`);
      const buf = readFileSync(join(process.cwd(), 'public', path));
      expect({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }).toEqual({ w: 256, h: 144 });
    }
    expect(battleBackdrop('silver-shallows')).toBe('/backgrounds/silver-shallows.png');
    expect(battleBackdrop('numbria', 'land')).toBe('/backgrounds/numbria.png');
  });
});
