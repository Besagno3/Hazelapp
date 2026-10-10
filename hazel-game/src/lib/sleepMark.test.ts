import { describe, expect, it } from 'vitest';
import { TILE, ZONES } from '../content/zones';
import { NPC_DEFS } from '../content/npcs';
import { spawnPlaced } from '../content/enemies';
import { mapLabel } from '../content/regions';
import { type Box, ZZ_PATHS, overlaps, pathBox, zzPath } from './sleepMark';

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
});
