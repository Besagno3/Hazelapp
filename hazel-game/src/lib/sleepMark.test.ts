import { describe, expect, it } from 'vitest';
import { TILE, ZONES } from '../content/zones';
import { NPC_DEFS } from '../content/npcs';
import { spawnPlaced } from '../content/enemies';
import { mapLabel } from '../content/regions';
import { type Box, ZZ_SPOTS, overlaps, zzBox, zzSpot } from './sleepMark';

const at = (p: { x: number; y: number }) => ({ x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 });

describe('a sleeping critter\'s "Zz" (#112e)', () => {
  it('sits over its head when nothing is there, and moves off a neighbour', () => {
    const me = { x: 100, y: 100 };
    expect(zzSpot(me, [])).toEqual(ZZ_SPOTS[0]);
    const neighbour: Box = { x: 118, y: 66, w: 32, h: 32 }; // a face up and to the right
    const spot = zzSpot(me, [neighbour]);
    expect(overlaps(zzBox(me, spot), neighbour)).toBe(false);
    expect(spot).toEqual(ZZ_SPOTS[1]);
  });

  it('on every map, every critter at home has a spot clear of everyone else\'s face, level and name (and its own level)', () => {
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
          face: { ...c, w: e.isBoss ? 48 : 32, h: e.isBoss ? 48 : 32 },
          label: { x: c.x, y: c.y + (e.isBoss ? 32 : 26), w: [...label].length * 7 + 8, h: 17 },
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
        const others = [...people, ...enemies.flatMap((o) => (o === me ? [me.label] : [o.face, o.label]))];
        const box = zzBox(me.c, zzSpot(me.c, others));
        const hit = others.filter((o) => overlaps(box, o));
        if (hit.length) crowded.push(`${z.id} ${me.name}`);
      }
    }
    expect(crowded).toEqual([]);
  });
});
