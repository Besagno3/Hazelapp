import { describe, expect, it } from 'vitest';
import { SEA_CHARS, TILE, WALKABLE_CHARS, ZONES, buildingAt, buildingInside, fogAt, tileAt, type ZoneDef } from '../content/zones';
import { NPC_DEFS } from '../content/npcs';
import { habitatOf, spawnPlaced } from '../content/enemies';
import { mapLabel } from '../content/regions';
import {
  BOSS_MARGIN,
  EMBER_COST,
  FACE_BOX,
  FOE_FACE,
  HERO_AFLOAT_BOX,
  HERO_BOX,
  HERO_COST,
  HERO_ROOM_COST,
  PATCH_COST,
  type Box,
  type Mark,
  ZZ_PATHS,
  type ZzPath,
  edgeBoxes,
  emberSpot,
  levelPlate,
  overlaps,
  patchBox,
  pathBox,
  markCost,
  roofBoxes,
  sweptBoxes,
  zzPath,
} from './sleepMark';

const at = (p: { x: number; y: number }) => ({ x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 });
const LEASH = 64;
const REACH = LEASH + 28; // a critter's leash + a touch: who falls asleep round the hero
const NEAR_BOSS = 8; // letters this near a boss's face or level read as its (round 14: 4 px under the Tide Colossus's)

/** A map's enemies and people as the canvas draws them: faces 32 px (a boss 48), a level plate 26 px below (32 for a boss), a name 24 px below. */
function cast(z: ZoneDef) {
  const enemies = (z.enemies ?? []).map((p) => {
    const e = spawnPlaced(z.id, p, 10);
    const c = at(p);
    const label = mapLabel(Math.max(e.level, 10), e.isBoss, e.tier);
    const marks: Mark[] = [
      { ...c, w: e.isBoss ? 48 : 32, h: e.isBoss ? 48 : 32, boss: e.isBoss },
      { x: c.x, y: c.y + (e.isBoss ? 32 : 26), ...levelPlate(label), boss: e.isBoss },
    ];
    return { c, boss: e.isBoss, sea: habitatOf(e) === 'sea', marks, face: marks[0], patch: patchBox(c, LEASH), name: `${p.defId}@${p.x},${p.y}` };
  });
  const people = z.npcs.flatMap((p) => {
    const def = NPC_DEFS[p.defId];
    const c = at(p);
    return def ? [{ c, marks: [{ ...c, w: 32, h: 32 }, { x: c.x, y: c.y + 24, w: [...def.name].length * 6 + 4, h: 12 }] as Mark[] }] : [];
  });
  const tower: Mark[] = z.lighthouse ? [{ x: (z.lighthouse.x + 1) * TILE, y: z.lighthouse.y * TILE, w: 2 * TILE, h: 4 * TILE }] : [];
  // Past the map's edges, letters are cut off: kept in like from under a roof.
  tower.push(...edgeBoxes(z.map[0].length, z.map.length, TILE));
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
    // Even a few px short of a boss's level reads as its: kept `BOSS_MARGIN` clear, at the cost of a neighbour.
    const [z, Z] = sweptBoxes(me, ZZ_PATHS[0]);
    const crown: Mark = { x: Z.x, y: Z.y - Z.h / 2 - 15 / 2 - 5, w: 40, h: 15, boss: true }; // 5 px above the top "Z"
    expect(overlaps(Z, crown) || overlaps(z, crown)).toBe(false);
    expect(zzPath(me, [crown, ...ZZ_PATHS.slice(1).flatMap((p) => on(p))])).not.toBe(ZZ_PATHS[0]);
    expect(BOSS_MARGIN).toBeGreaterThan(5);
    // A letter by an awake critter's face weighs more than one by the hero's: it could look asleep.
    expect(FOE_FACE).toBeGreaterThan(1);
    // Covering the hero outweighs everything after it, however much of that adds up.
    const onHero = on(ZZ_PATHS[0], { weight: HERO_COST });
    const rest = ZZ_PATHS.slice(1).flatMap((p) => [PATCH_COST, EMBER_COST, PATCH_COST, HERO_ROOM_COST].flatMap((weight) => on(p, { weight })));
    expect(hits(me, zzPath(me, [...onHero, ...rest]), onHero)).toBe(false);
    // Worst to cross, to least: a boss, anyone else (or a roof), the hero, where an awake critter roams, where Ember stands, the room round the hero.
    const box = { x: 0, y: 0, w: 1, h: 1 };
    const order = [markCost({ ...box, boss: true }), markCost(box), HERO_COST, PATCH_COST, EMBER_COST, HERO_ROOM_COST];
    expect(markCost(patchBox({ x: 0, y: 0 }, LEASH))).toBe(PATCH_COST);
    expect([...order].sort((a, b) => b - a)).toEqual(order);
    expect(new Set(order).size).toBe(order.length);
  });

  it('Ember starts on the far side of a sleeper, else a side, on ground she can stand on and off anyone\'s face', () => {
    const hero = { x: 100, y: 100 };
    const sleeper = { x: 100, y: 68 }; // a tile up
    expect(emberSpot(hero, sleeper, () => true, [])).toEqual({ dir: { x: 0, y: -1 }, at: { x: 100, y: 134 } });
    const notBelow = (_x: number, y: number) => y < 120; // rock below the hero
    expect(emberSpot(hero, sleeper, notBelow, []).at.y).toBeLessThan(120);
    // Her far-side spot taken by someone — her box on their face, not only its centre near it: a side.
    expect(emberSpot(hero, sleeper, () => true, [{ x: 100, y: 160, w: 32, h: 32 }]).at).not.toEqual({ x: 100, y: 134 });
    // On top of the sleeper: where she trails anyway — so the letters are planned round where she goes.
    const trailing = { x: 1, y: 0 };
    expect(emberSpot(hero, hero, () => true, [], trailing)).toEqual({ dir: trailing, at: { x: 74, y: 108 } });
    // Nowhere to stand: still off the sleeper (a dragon flies) — never on it.
    expect(emberSpot(hero, sleeper, () => false, [], trailing)).toEqual({ dir: { x: 0, y: -1 }, at: { x: 100, y: 134 } });
    // A tile below a sleeper on the shore — water below, the sides crowded: off the sleeper still.
    const water = (_x: number, y: number) => y < 120;
    const crowded = [{ ...sleeper, w: 32, h: 32 }, { x: 70, y: 108, w: 32, h: 32 }, { x: 130, y: 108, w: 32, h: 32 }];
    const spot = emberSpot(hero, sleeper, water, crowded).at;
    expect(overlaps({ ...spot, w: 28, h: 36 }, { ...sleeper, w: 32, h: 32 })).toBe(false);
    // No sleeper: her usual first spot.
    expect(emberSpot(hero, null, () => true, []).at).toEqual({ x: 76, y: 108 });
  });

  it("on every map, every critter at home has a way up clear of everyone else's face, level and name, of roofs and of the map's edges", () => {
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

  it('with the hero anywhere within reach — on a cell or between, sailing by a sea critter — the way read is the clearest there was, and Ember starts off the sleeper', () => {
    const problems: string[] = [];
    const STEP = 8; // px: a Flee or a reload leaves the hero anywhere, not only on a cell's centre
    for (const z of Object.values(ZONES)) {
      const { enemies, people, tower } = cast(z);
      for (const me of enemies.filter((e) => !e.boss)) {
        for (let ox = -88; ox <= 88; ox += STEP) {
          for (let oy = -88; oy <= 88; oy += STEP) {
            const d = Math.hypot(ox, oy);
            if (d >= REACH || d < 16) continue;
            const hero = { x: me.c.x + ox, y: me.c.y + oy };
            const x = Math.floor(hero.x / TILE);
            const y = Math.floor(hero.y / TILE);
            // The hero sails by a sea critter and walks by a land one.
            const ch = tileAt(z, x, y);
            if (!(me.sea ? SEA_CHARS.has(ch) : WALKABLE_CHARS.has(ch))) continue;
            // As `restAround` asks it. Who's asleep round the hero hides their level; everyone else roams
            // awake, and letters keep out of where they wander (`patchBox`).
            const near = (o: (typeof enemies)[number]) => Math.hypot(o.c.x - hero.x, o.c.y - hero.y);
            const sleepersNear = enemies.filter((o) => !o.boss && o.sea === me.sea && near(o) < REACH);
            const asleep = (o: (typeof enemies)[number]) => sleepersNear.includes(o);
            const shown = (o: (typeof enemies)[number]) => (asleep(o) ? [o.face] : o.marks);
            const neighbours = [...people.flatMap((p) => p.marks), ...enemies.filter((o) => o !== me).flatMap(shown)];
            const patches = enemies.filter((o) => !o.boss && !asleep(o)).map((o) => o.patch);
            // Ember beside the nearest sleeper; roofs (not the one the hero is in); the hero and the room round them.
            const nearest = [...sleepersNear].sort((a, b) => near(a) - near(b))[0];
            const inside = buildingInside(z, x, y);
            const ok = (px: number, py: number) => {
              const cx = Math.floor(px / TILE);
              const cy = Math.floor(py / TILE);
              const roof = buildingAt(z, cx, cy);
              return (me.sea ? SEA_CHARS : WALKABLE_CHARS).has(tileAt(z, cx, cy)) && !fogAt(z, cx, cy, {}) && (!roof || roof.id === inside?.id);
            };
            const em = emberSpot(hero, nearest.c, ok, [...people.flatMap((p) => p.marks), ...enemies.flatMap(shown)]).at;
            const where = `${z.id} ${me.name} hero ${ox >= 0 ? '+' : ''}${ox},${oy >= 0 ? '+' : ''}${oy}`;
            if (near(nearest) >= 16 && overlaps({ ...em, ...HERO_BOX }, { ...nearest.c, ...FACE_BOX })) problems.push(`${where}: Ember on the sleeper`);
            const roofs = [...roofBoxes(z.buildings ?? [], inside?.id, TILE), ...tower];
            const size = me.sea ? HERO_AFLOAT_BOX : HERO_BOX;
            const others: Mark[] = [
              ...neighbours,
              ...roofs,
              ...patches,
              { ...hero, ...size, weight: HERO_COST },
              { ...hero, w: size.w + 24, h: size.h + 24, weight: HERO_ROOM_COST },
              { ...em, ...HERO_BOX, weight: EMBER_COST },
            ];
            const faces = [
              ...people.map((p) => p.c),
              ...enemies.filter((o) => o !== me).map((o) => ({ ...o.c, weight: asleep(o) ? 1 : FOE_FACE })),
              hero,
              em,
            ];
            const path = zzPath(me.c, others, { faces, away: hero });
            const bosses = enemies.filter((o) => o.boss).flatMap((o) => o.marks);
            const byBoss = bosses.map((b) => ({ ...b, w: b.w + 2 * NEAR_BOSS, h: b.h + 2 * NEAR_BOSS }));
            const heroBox = { ...hero, ...size };
            const clearOf = (p: ZzPath, ...sets: Box[][]) => !sets.some((set) => hits(me.c, p, set));
            // Worst first, as `zzPath` weighs them: a boss (or just by one), then a neighbour, a roof or the edge, then the hero.
            if (hits(me.c, path, bosses)) problems.push(`${where}: crosses a boss`);
            if (hits(me.c, path, byBoss) && ZZ_PATHS.some((p) => clearOf(p, byBoss))) problems.push(`${where}: right by a boss`);
            const tens = [...neighbours, ...roofs];
            if (hits(me.c, path, tens) && ZZ_PATHS.some((p) => clearOf(p, byBoss, tens))) problems.push(`${where}: on a neighbour, under a roof or off the map`);
            if (hits(me.c, path, [heroBox]) && ZZ_PATHS.some((p) => clearOf(p, byBoss, tens, [heroBox]))) problems.push(`${where}: on the hero`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
