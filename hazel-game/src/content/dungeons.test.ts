import { describe, it, expect } from 'vitest';
import {
  DUNGEONS,
  SPIRE_DUNGEON,
  dungeonEntrance,
  dungeonFloor,
  floorLabel,
  floorTitle,
  stairsChars,
} from './dungeons';
import { STAIRS_CHARS, ZONES, tileAt, type ZoneDef } from './zones';
import { reach } from '../lib/reach';
import { GATE_KEYS } from './keys';
import { SPIRE_FLOORS, spireFloorTitle } from './spire';
import type { ZoneId } from '../types';

const allZones = Object.values(ZONES);

function stairsOf(z: ZoneDef, ch: string) {
  return z.exits.filter((e) => tileAt(z, e.x, e.y) === ch);
}

describe('dungeons (#75 item 10)', () => {
  it('every floor is a dungeon zone in exactly one dungeon; the first is a place on the overworld', () => {
    const seen = new Set<ZoneId>();
    for (const d of DUNGEONS) {
      expect(d.floors.length, d.id).toBeGreaterThanOrEqual(2);
      for (const id of d.floors) {
        expect(ZONES[id].kind, id).toBe('dungeon');
        expect(seen.has(id), `${id} in two dungeons`).toBe(false);
        seen.add(id);
      }
      expect(ZONES[d.floors[0]].name).toBe(d.name);
      const overworldDoor = allZones.some((z) => z.kind === 'overworld' && z.exits.some((e) => e.to === d.floors[0]));
      expect(overworldDoor, `${d.id} is entered from the overworld`).toBe(true);
    }
  });

  it('stairs only appear on dungeon floors, and each leads one floor on or back in its own dungeon', () => {
    for (const z of allZones) {
      const stairs = z.exits.filter((e) => STAIRS_CHARS.has(tileAt(z, e.x, e.y)));
      if (!stairs.length) continue;
      const at = dungeonFloor(z.id);
      expect(at, `${z.id} has stairs but isn't a dungeon floor`).not.toBeNull();
      const { onward } = stairsChars(at!.dungeon.goes);
      for (const e of stairs) {
        const step = tileAt(z, e.x, e.y) === onward ? 1 : -1;
        expect(e.to, `${z.id} stairs at ${e.x},${e.y}`).toBe(at!.dungeon.floors[at!.index + step]);
      }
    }
  });

  it('each floor joins the next by stairs both ways, landing right beside the stairs back', () => {
    for (const d of DUNGEONS) {
      const { onward, back } = stairsChars(d.goes);
      for (let i = 0; i + 1 < d.floors.length; i++) {
        const upper = ZONES[d.floors[i]];
        const lower = ZONES[d.floors[i + 1]];
        const down = stairsOf(upper, onward).find((e) => e.to === lower.id);
        const up = stairsOf(lower, back).find((e) => e.to === upper.id);
        expect(down && up, `${upper.id} ⇄ ${lower.id}`).toBeTruthy();
        // Land beside (not on) the stairs that lead back where you came from.
        const beside = (sx: number, sy: number, tx: number, ty: number) =>
          Math.max(Math.abs(sx - tx), Math.abs(sy - ty)) === 1;
        expect(beside(down!.spawnX, down!.spawnY, up!.x, up!.y), `${upper.id} → ${lower.id} lands by the stairs back`).toBe(true);
        expect(beside(up!.spawnX, up!.spawnY, down!.x, down!.y), `${lower.id} → ${upper.id} lands by the stairs back`).toBe(true);
      }
    }
  });

  it('from where you arrive on each floor you can walk to the stairs on — no Glow needed to reach the bottom', () => {
    for (const d of DUNGEONS) {
      const { onward } = stairsChars(d.goes);
      for (let i = 0; i < d.floors.length; i++) {
        const z = ZONES[d.floors[i]];
        const from = ZONES[i === 0 ? 'dawnreach' : d.floors[i - 1]];
        const arrive = from.exits.find((e) => e.to === z.id)!;
        // Through gates (you answer them), never through pitch dark (no Glow yet).
        const open = reach(z, { from: { x: arrive.spawnX, y: arrive.spawnY }, flags: {}, gates: 'open' });
        const next = stairsOf(z, onward)[0];
        if (i + 1 < d.floors.length) expect(open.has(`${next.x},${next.y}`), `${z.id}: the stairs on`).toBe(true);
        // Nothing on the floor is walled off for good — the deepest floor too
        // (pitch dark waits for Glow, that's all).
        expect(z.exits.every((e) => open.has(`${e.x},${e.y}`)), `${z.id}: every exit`).toBe(true);
      }
    }
  });

  it('the boss waits on the deepest floor — and only there; its key names that floor', () => {
    for (const d of DUNGEONS) {
      const deepest = d.floors.at(-1)!;
      for (const id of d.floors) {
        const here = ZONES[id].enemies.some((e) => e.defId === d.boss);
        expect(here, `${d.boss} on ${id}`).toBe(id === deepest);
      }
      const key = GATE_KEYS.find((k) => k.bossId === d.boss);
      if (key) expect(key.fromZone).toBe(deepest);
    }
  });

  it('names floors B1, B2… going down and Floor 1, 2… going up; the HUD title says where', () => {
    expect(floorLabel('down', 0)).toBe('B1');
    expect(floorLabel('down', 2)).toBe('B3');
    expect(floorLabel(SPIRE_DUNGEON.goes, 1)).toBe('Floor 2');
    expect(floorTitle(ZONES, 'clockwork-depths')).toBe('Clockwork Depths · B1');
    expect(floorTitle(ZONES, 'clockwork-depths-b2')).toBe('Clockwork Depths · B2 — The Gear Halls');
    expect(floorTitle(ZONES, 'dawnreach')).toBeNull();
    expect(dungeonEntrance('clockwork-depths-b3')).toBe('clockwork-depths');
    expect(dungeonEntrance('numbria')).toBe('numbria');
    expect(dungeonFloor('clockwork-depths-b3')).toMatchObject({ index: 2, dungeon: { id: 'clockwork-depths' } });
    // The Spire numbers its floors the same way (its trial floors live in content/spire.ts).
    expect(spireFloorTitle(1)).toBe('Floor 2 — The Overgrown Landing');
    expect(SPIRE_FLOORS.every((f) => !/^Floor \d/.test(f.name))).toBe(true);
  });
});
