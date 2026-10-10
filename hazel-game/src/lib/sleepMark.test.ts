import { describe, expect, it } from 'vitest';
import { SEA_CHARS, TILE, WALKABLE_CHARS, ZONES, buildingAt, buildingInside, tileAt, type ZoneDef } from '../content/zones';
import { NPC_DEFS } from '../content/npcs';
import { habitatOf, spawnPlaced } from '../content/enemies';
import { mapLabel } from '../content/regions';
import {
  EMBER_COST,
  HERO_COST,
  HERO_ROOM_COST,
  type Box,
  type Mark,
  ZZ_PATHS,
  type ZzPath,
  emberSpot,
  overlaps,
  pathBox,
  markCost,
  roofBoxes,
  sweptBoxes,
  zzPath,
} from './sleepMark';

const at = (p: { x: number; y: number }) => ({ x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 });
const REACH = 92; // a critter's leash + a touch: who falls asleep round the hero
const HERO = { w: 28, h: 36 };

/** A map's enemies and people as the canvas draws them: faces 32 px (a boss 48), a level 26 px below (32 for a boss), a name 24 px below. */
function cast(z: ZoneDef) {
  const enemies = (z.enemies ?? []).map((p) => {
    const e = spawnPlaced(z.id, p, 10);
    const c = at(p);
    const label = mapLabel(Math.max(e.level, 10), e.isBoss, e.tier);
    const marks: Mark[] = [
      { ...c, w: e.isBoss ? 48 : 32, h: e.isBoss ? 48 : 32, boss: e.isBoss },
      { x: c.x, y: c.y + (e.isBoss ? 32 : 26), w: [...label].length * 7 + 8, h: 17, boss: e.isBoss },
    ];
    return { c, boss: e.isBoss, sea: habitatOf(e) === 'sea', marks, name: `${p.defId}@${p.x},${p.y}` };
  });
  const people = z.npcs.flatMap((p) => {
    const def = NPC_DEFS[p.defId];
    const c = at(p);
    return def ? [{ c, marks: [{ ...c, w: 32, h: 32 }, { x: c.x, y: c.y + 24, w: [...def.name].length * 6 + 4, h: 12 }] as Mark[] }] : [];
  });
  const tower: Mark[] = z.lighthouse ? [{ x: (z.lighthouse.x + 1) * TILE, y: z.lighthouse.y * TILE, w: 2 * TILE, h: 4 * TILE }] : [];
  return { enemies, people, tower };
}

const hits = (c: { x: number; y: number }, p: ZzPath, marks: readonly Box[]) => sweptBoxes(c, p).some((b) => marks.some((m) => overlaps(b, m)));

describe('a sleeping critter\'s rising "z Z" (#112e)', () => {
  it('rise up and to the right when nothing is there, and take another way round a neighbour', () => {
    const me = { x: 100, y: 100 };
    expect(zzPath(me, [])).toBe(ZZ_PATHS[0]);
    const upRight: Box = { x: 132, y: 68, w: 32, h: 32 }; // a face a tile up and to the right
    const path = zzPath(me, [upRight]);
    expect(path).toBe(ZZ_PATHS[1]);
    expect(overlaps(pathBox(me, path), upRight)).toBe(false);
  });

  it('cross a boss last of all, and the hero before a neighbour', () => {
    const me = { x: 100, y: 100 };
    const on = (p: ZzPath, extra: Partial<Mark> = {}) => sweptBoxes(me, p).map((b) => ({ ...b, ...extra }));
    // Something on every way up — and a boss up and to the right.
    const path = zzPath(me, [...on(ZZ_PATHS[0], { boss: true }), ...ZZ_PATHS.slice(1).flatMap((p) => on(p))]);
    expect(path).not.toBe(ZZ_PATHS[0]);
    // Worst to cross, to least: a boss, anyone else (or a roof), the hero, where Ember stands, the room round the hero.
    const box = { x: 0, y: 0, w: 1, h: 1 };
    const order = [markCost({ ...box, boss: true }), markCost(box), HERO_COST, EMBER_COST, HERO_ROOM_COST];
    expect([...order].sort((a, b) => b - a)).toEqual(order);
    expect(new Set(order).size).toBe(order.length);
  });

  it('Ember starts on the far side of a sleeper, else a side, on ground she can stand on and off anyone\'s face', () => {
    const hero = { x: 100, y: 100 };
    const sleeper = { x: 100, y: 68 }; // a tile up
    expect(emberSpot(hero, sleeper, () => true, [])).toEqual({ dir: { x: 0, y: -1 }, at: { x: 100, y: 134 } });
    const notBelow = (_x: number, y: number) => y < 120; // rock below the hero
    expect(emberSpot(hero, sleeper, notBelow, []).at.y).toBeLessThan(120);
    // Her far-side spot taken by someone: a side.
    expect(emberSpot(hero, sleeper, () => true, [{ x: 100, y: 134 }]).at).not.toEqual({ x: 100, y: 134 });
    // On top of the sleeper, or nowhere to stand: as ever.
    expect(emberSpot(hero, hero, () => true, []).dir).toBeNull();
    expect(emberSpot(hero, sleeper, () => false, []).dir).toBeNull();
  });

  it("on every map, every critter at home has a way up clear of everyone else's face, level and name, and of roofs", () => {
    const crowded: string[] = [];
    for (const z of Object.values(ZONES)) {
      const { enemies, people, tower } = cast(z);
      for (const me of enemies.filter((e) => !e.boss)) {
        const others = [...people.flatMap((p) => p.marks), ...enemies.filter((o) => o !== me).flatMap((o) => o.marks), ...roofBoxes(z.buildings ?? [], undefined, TILE), ...tower];
        if (hits(me.c, zzPath(me.c, others), others)) crowded.push(`${z.id} ${me.name}`);
      }
    }
    expect(crowded).toEqual([]);
  });

  it('with the hero anywhere within reach (sailing, by a sea critter) the way read is the clearest there was', () => {
    const problems: string[] = [];
    for (const z of Object.values(ZONES)) {
      const { enemies, people, tower } = cast(z);
      const neighbours = (me: (typeof enemies)[number]) => [...people.flatMap((p) => p.marks), ...enemies.filter((o) => o !== me).flatMap((o) => o.marks)];
      for (const me of enemies.filter((e) => !e.boss)) {
        for (let y = 0; y < z.map.length; y++) {
          for (let x = 0; x < z.map[0].length; x++) {
            // The hero sails by a sea critter and walks by a land one.
            const ch = tileAt(z, x, y);
            if (!(me.sea ? SEA_CHARS.has(ch) : WALKABLE_CHARS.has(ch))) continue;
            const hero = at({ x, y });
            const d = Math.hypot(hero.x - me.c.x, hero.y - me.c.y);
            if (d >= REACH || d < 16) continue;
            // As `restAround` asks it: Ember beside the nearest sleeper, roofs (not the one the hero is in), the hero's room.
            const sleepersNear = enemies.filter((o) => !o.boss && o.sea === me.sea && Math.hypot(o.c.x - hero.x, o.c.y - hero.y) < REACH);
            const nearest = sleepersNear.sort((a, b) => Math.hypot(a.c.x - hero.x, a.c.y - hero.y) - Math.hypot(b.c.x - hero.x, b.c.y - hero.y))[0];
            const inside = buildingInside(z, x, y);
            const ok = (px: number, py: number) => {
              const cx = Math.floor(px / TILE);
              const cy = Math.floor(py / TILE);
              const roof = buildingAt(z, cx, cy);
              return (me.sea ? SEA_CHARS : WALKABLE_CHARS).has(tileAt(z, cx, cy)) && (!roof || roof.id === inside?.id);
            };
            const em = emberSpot(hero, nearest?.c ?? null, ok, [...people.map((p) => p.c), ...enemies.map((o) => o.c)]).at;
            const roofs = [...roofBoxes(z.buildings ?? [], inside?.id, TILE), ...tower];
            const others: Mark[] = [
              ...neighbours(me),
              ...roofs,
              { ...hero, ...HERO, weight: HERO_COST },
              { ...hero, w: HERO.w + 24, h: HERO.h + 24, weight: HERO_ROOM_COST },
              { ...em, ...HERO, weight: EMBER_COST },
            ];
            const faces = [...people.map((p) => p.c), ...enemies.filter((o) => o !== me).map((o) => o.c), hero, em];
            const path = zzPath(me.c, others, { faces, away: hero });
            const where = `${z.id} ${me.name} hero ${x},${y}`;
            const bosses = enemies.filter((o) => o.boss).flatMap((o) => o.marks);
            const heroBox = { ...hero, ...HERO };
            const clearOf = (p: ZzPath, ...sets: Box[][]) => !sets.some((set) => hits(me.c, p, set));
            if (hits(me.c, path, bosses)) problems.push(`${where}: crosses a boss`);
            // Better on the hero (it can't look like a foe asleep) than on an awake neighbour.
            if (hits(me.c, path, neighbours(me)) && ZZ_PATHS.some((p) => clearOf(p, neighbours(me)))) problems.push(`${where}: on a neighbour`);
            if (hits(me.c, path, [heroBox]) && ZZ_PATHS.some((p) => clearOf(p, [heroBox], neighbours(me)))) problems.push(`${where}: on the hero`);
            if (hits(me.c, path, roofs) && ZZ_PATHS.some((p) => clearOf(p, roofs, neighbours(me), [heroBox]))) problems.push(`${where}: under a roof`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
