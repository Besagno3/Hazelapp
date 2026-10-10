import { describe, expect, it } from 'vitest';
import { TILE, WALKABLE_CHARS, ZONES, tileAt } from '../content/zones';
import { NPC_DEFS } from '../content/npcs';
import { spawnPlaced } from '../content/enemies';
import { mapLabel } from '../content/regions';
import { type Box, ZZ_PATHS, glyphBox, overlaps, pathBox, zzPath } from './sleepMark';

const at = (p: { x: number; y: number }) => ({ x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 });

describe('a sleeping critter\'s rising "z Z" (#112e)', () => {
  it('rise up and to the right when nothing is there, and take another way round a neighbour', () => {
    const me = { x: 100, y: 100 };
    expect(zzPath(me, [])).toBe(ZZ_PATHS[0]);
    const upRight: Box = { x: 132, y: 68, w: 32, h: 32 }; // a face a tile up and to the right
    const path = zzPath(me, [upRight]);
    expect(path).toBe(ZZ_PATHS[1]);
    expect(overlaps(pathBox(me, path), upRight)).toBe(false);
  });

  it('cross a boss last of all', () => {
    const me = { x: 100, y: 100 };
    // Something on every way up — and a boss up and to the right.
    const boss = { ...pathBox(me, ZZ_PATHS[0]), boss: true };
    const others = [boss, ...ZZ_PATHS.slice(1).map((p) => pathBox(me, p))];
    const path = zzPath(me, others);
    expect(path).not.toBe(ZZ_PATHS[0]);
    expect(overlaps(pathBox(me, path), boss)).toBe(false);
  });

  it("on every map, every critter at home has a way up clear of everyone else's face, level and name", () => {
    const crowded: string[] = [];
    for (const z of Object.values(ZONES)) {
      // As the canvas draws them: faces 32 px (a boss 48), a level on a plate
      // 26 px below (32 for a boss), a person's name 24 px below.
      const enemies = (z.enemies ?? []).map((p) => {
        const e = spawnPlaced(z.id, p, 10);
        const c = at(p);
        const label = mapLabel(Math.max(e.level, 10), e.isBoss, e.tier);
        return {
          c,
          boss: e.isBoss,
          marks: [
            { ...c, w: e.isBoss ? 48 : 32, h: e.isBoss ? 48 : 32, boss: e.isBoss },
            { x: c.x, y: c.y + (e.isBoss ? 32 : 26), w: [...label].length * 7 + 8, h: 17, boss: e.isBoss },
          ],
          name: `${p.defId}@${p.x},${p.y}`,
        };
      });
      const people = z.npcs.flatMap((p) => {
        const def = NPC_DEFS[p.defId];
        if (!def) return [];
        const c = at(p);
        return [{ ...c, w: 32, h: 32 }, { x: c.x, y: c.y + 24, w: [...def.name].length * 6 + 4, h: 12 }];
      });
      for (const me of enemies.filter((e) => !e.boss)) {
        const others = [...people, ...enemies.filter((o) => o !== me).flatMap((o) => o.marks)];
        const box = pathBox(me.c, zzPath(me.c, others));
        if (others.some((o) => overlaps(box, o))) crowded.push(`${z.id} ${me.name}`);
      }
    }
    expect(crowded).toEqual([]);
  });

  it('with the hero anywhere within reach, never cross a boss, nor the hero when a way clear of both was there', () => {
    const problems: string[] = [];
    const letters = (c: { x: number; y: number }, p: (typeof ZZ_PATHS)[number]) =>
      p.glyphs.flatMap((g) => [glyphBox(c, g, p.drift, 0), glyphBox(c, g, p.drift, 1)]);
    for (const z of Object.values(ZONES)) {
      const enemies = (z.enemies ?? []).map((p) => {
        const e = spawnPlaced(z.id, p, 10);
        const c = at(p);
        const label = mapLabel(Math.max(e.level, 10), e.isBoss, e.tier);
        return {
          c,
          boss: e.isBoss,
          marks: [
            { ...c, w: e.isBoss ? 48 : 32, h: e.isBoss ? 48 : 32, boss: e.isBoss },
            { x: c.x, y: c.y + (e.isBoss ? 32 : 26), w: [...label].length * 7 + 8, h: 17, boss: e.isBoss },
          ],
        };
      });
      const people = z.npcs.flatMap((p) => {
        const def = NPC_DEFS[p.defId];
        return def ? [{ c: at(p), marks: [{ ...at(p), w: 32, h: 32 }, { x: at(p).x, y: at(p).y + 24, w: [...def.name].length * 6 + 4, h: 12 }] }] : [];
      });
      for (const me of enemies.filter((e) => !e.boss)) {
        for (let y = 0; y < z.map.length; y++) {
          for (let x = 0; x < z.map[0].length; x++) {
            // As `restAround` asks it: the hero (with room round them) and Ember on its far side.
            const hero = at({ x, y });
            const d = Math.hypot(hero.x - me.c.x, hero.y - me.c.y);
            if (d >= 92 || d < 16 || !WALKABLE_CHARS.has(tileAt(z, x, y))) continue;
            const em = { x: hero.x - ((me.c.x - hero.x) / d) * 26, y: hero.y - ((me.c.y - hero.y) / d) * 26 + 8 };
            const others = [
              ...people.flatMap((p) => p.marks),
              ...enemies.filter((o) => o !== me).flatMap((o) => o.marks),
              { x: hero.x, y: hero.y, w: 52, h: 60 },
              { x: em.x, y: em.y, w: 28, h: 36 },
            ];
            const faces = [...people.map((p) => p.c), ...enemies.filter((o) => o !== me).map((o) => o.c), hero, em];
            const path = zzPath(me.c, others, { faces, away: hero });
            const boxes = letters(me.c, path);
            const heroBox = { ...hero, w: 28, h: 36 };
            if (boxes.some((b) => enemies.some((o) => o.boss && o.marks.some((m) => overlaps(b, m))))) {
              problems.push(`${z.id} ${me.c.x},${me.c.y} hero ${x},${y}: crosses a boss`);
            }
            // (On the hero they fade right down — but not if a way clear of the hero and every boss was there.)
            const onHero = (p: (typeof ZZ_PATHS)[number]) => letters(me.c, p).some((b) => overlaps(b, heroBox));
            const onBoss = (p: (typeof ZZ_PATHS)[number]) =>
              letters(me.c, p).some((b) => enemies.some((o) => o.boss && o.marks.some((m) => overlaps(b, m))));
            if (onHero(path) && ZZ_PATHS.some((p) => !onHero(p) && !onBoss(p))) {
              problems.push(`${z.id} ${me.c.x},${me.c.y} hero ${x},${y}: on the hero`);
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
