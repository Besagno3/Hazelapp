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
import { HALL_GATE_FLAG, STAIRS_CHARS, ZONES, tileAt, type ZoneDef } from './zones';
import { wakeAfterDefeat, wakeShelter } from '../lib/save';
import { reach, touches } from '../lib/reach';
import { GATE_KEYS, keyFlag } from './keys';
import { SPIRE_FLOORS, spireFloorTitle } from './spire';
import type { ZoneId } from '../types';
import { DESCENT_TAUNTS, descentSeenFlag } from './story';
import { NPC_DEFS, lineText, visibleLines } from './npcs';
import { HALL_ROOT_SEEN, NAME_LEARNED, ROOT_HEART_REACHED } from './questFlags';
import { QUESTS } from './quests';

const allZones = Object.values(ZONES);

function stairsOf(z: ZoneDef, ch: string) {
  return z.exits.filter((e) => tileAt(z, e.x, e.y) === ch);
}

describe('dungeons (#75 item 10)', () => {
  it('every floor is a dungeon zone in exactly one dungeon; the first is a place on the overworld, or down a place\'s stairs', () => {
    const seen = new Set<ZoneId>();
    for (const d of DUNGEONS) {
      // The Dream Root (#75 item 16a) has only its Door so far; the descent comes in 16d.
      expect(d.floors.length, d.id).toBeGreaterThanOrEqual(d.boss ? 2 : 1);
      for (const id of d.floors) {
        expect(ZONES[id].kind, id).toBe('dungeon');
        expect(seen.has(id), `${id} in two dungeons`).toBe(false);
        seen.add(id);
      }
      // "Clockwork Depths", or a floor named after its dungeon ("Dream Root Door").
      expect(ZONES[d.floors[0]].name.startsWith(d.name), d.id).toBe(true);
      // Entered from the overworld — or from a place on it, down that place's stairs.
      const door = d.from ?? null;
      const onOverworld = (id: ZoneId) => allZones.some((z) => z.kind === 'overworld' && z.exits.some((e) => e.to === id));
      // A place below another place counts too (#75 item 16d: the Deep Root, down
      // from the Nameless Hall) — as long as exits lead there from the overworld.
      // …walked from the overworld without going down the dungeon itself.
      const linked = (id: ZoneId, own: ZoneId[]) => {
        const overworlds = allZones.filter((z) => z.kind === 'overworld').map((z) => z.id);
        const seen = new Set<ZoneId>([...overworlds, ...own]);
        const queue = [...overworlds];
        while (queue.length) {
          for (const e of ZONES[queue.shift()!].exits) {
            if (seen.has(e.to)) continue;
            seen.add(e.to);
            queue.push(e.to);
          }
        }
        return seen.has(id) && !own.includes(id);
      };
      if (door) {
        expect(onOverworld(door) || linked(door, d.floors), `${d.id}'s ${door} is reached from the overworld`).toBe(true);
        expect(stairsOf(ZONES[door], stairsChars(d.goes).onward).some((e) => e.to === d.floors[0]), `${door}'s stairs lead to ${d.id}`).toBe(true);
      } else {
        expect(onOverworld(d.floors[0]), `${d.id} is entered from the overworld`).toBe(true);
      }
    }
  });

  it("stairs from a place start a dungeon (#75 item 16a): the Spire's grounds and the Dream Root Door, landing beside the stairs back", () => {
    const d = DUNGEONS.find((x) => x.id === 'dream-root')!;
    expect(d.from).toBe('crystal-spire');
    const grounds = ZONES['crystal-spire'];
    const door = ZONES[d.floors[0]];
    const down = stairsOf(grounds, '>').find((e) => e.to === door.id)!;
    const up = stairsOf(door, '<').find((e) => e.to === grounds.id)!;
    expect(down && up).toBeTruthy();
    const beside = (sx: number, sy: number, tx: number, ty: number) => Math.max(Math.abs(sx - tx), Math.abs(sy - ty)) === 1;
    expect(beside(down.spawnX, down.spawnY, up.x, up.y)).toBe(true);
    expect(beside(up.spawnX, up.spawnY, down.x, down.y)).toBe(true);
    // A one-floor dungeon is just its place on the map caption (16d review round 3: one "B1" a descent).
    expect(floorTitle(ZONES, door.id)).toBe("Dream Root Door");
    expect(dungeonEntrance(door.id)).toBe(door.id);
  });

  it('stairs only appear on dungeon floors, and each leads one floor on or back in its own dungeon', () => {
    for (const z of allZones) {
      const stairs = z.exits.filter((e) => STAIRS_CHARS.has(tileAt(z, e.x, e.y)));
      if (!stairs.length) continue;
      const at = dungeonFloor(z.id);
      // A place whose stairs start a dungeon (#75 item 16a): they lead to its first floor.
      const starts = DUNGEONS.find((d) => d.from === z.id);
      if (!at && starts) {
        for (const e of stairs) {
          expect(tileAt(z, e.x, e.y), `${z.id} stairs at ${e.x},${e.y}`).toBe(stairsChars(starts.goes).onward);
          expect(e.to, `${z.id} stairs at ${e.x},${e.y}`).toBe(starts.floors[0]);
        }
        continue;
      }
      expect(at, `${z.id} has stairs but isn't a dungeon floor`).not.toBeNull();
      const { onward } = stairsChars(at!.dungeon.goes);
      for (const e of stairs) {
        const step = tileAt(z, e.x, e.y) === onward ? 1 : -1;
        // Back up from the first floor: to the place its stairs came down from.
        const back = at!.index === 0 && step === -1 ? at!.dungeon.from : undefined;
        expect(e.to, `${z.id} stairs at ${e.x},${e.y}`).toBe(back ?? at!.dungeon.floors[at!.index + step]);
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
        const from = ZONES[i === 0 ? (d.from ?? 'dawnreach') : d.floors[i - 1]];
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
      if (!d.boss) continue; // no fight at the bottom (the Dream Root's Door; the Deep Root until 16e)
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

describe('the Deep Root (#75 item 16d)', () => {
  const d = DUNGEONS.find((x) => x.id === 'deep-root')!;
  it("starts down the Nameless Hall's stairs, landing beside the stairs back", () => {
    expect(d.from).toBe('nameless-hall');
    const hall = ZONES['nameless-hall'];
    const b1 = ZONES[d.floors[0]];
    const down = stairsOf(hall, '>').find((e) => e.to === b1.id);
    const up = stairsOf(b1, '<').find((e) => e.to === hall.id);
    if (!down || !up) throw new Error('the Hall and B1 need stairs both ways');
    const beside = (sx: number, sy: number, tx: number, ty: number) => Math.max(Math.abs(sx - tx), Math.abs(sy - ty)) === 1;
    expect(beside(down.spawnX, down.spawnY, up.x, up.y)).toBe(true);
    expect(beside(up.spawnX, up.spawnY, down.x, down.y)).toBe(true);
    // The stairs are behind the great door: shut, the Hall's way down isn't reached.
    expect(reach(hall, { gates: 'closed' }).has(`${down.x},${down.y}`)).toBe(false);
    expect(reach(hall, { gates: 'open' }).has(`${down.x},${down.y}`)).toBe(true);
  });
  it("Umbra's taunt plays on every floor of it, and nowhere else", () => {
    expect(Object.keys(DESCENT_TAUNTS).sort()).toEqual([...d.floors].sort());
  });
  it("the Root's Heart's last line sets root-heart-reached", () => {
    const lines = NPC_DEFS['root-heart'].lines;
    const last = lines.at(-1)!;
    expect(typeof last === 'object' && last.setFlag).toBe(ROOT_HEART_REACHED);
    expect(ZONES[d.floors.at(-1)!].npcs.some((n) => n.defId === 'root-heart')).toBe(true);
  });
  it("no critter down it is one a quest asks you to beat (16d review round 1: the Gardener's weeds stood on B2, B4, B5)", () => {
    const wanted = new Set(QUESTS.flatMap((q) => q.steps.flatMap((st) => st.defeats ?? [])));
    expect(wanted.has('thorn-of-doubt')).toBe(true); // the check sees the Gardener's weeds
    for (const id of d.floors) for (const e of ZONES[id].enemies) expect(wanted.has(e.defId), `${id} ${e.defId}`).toBe(false);
  });
});


describe('down the Deep Root, the folk up top keep talking (16d review round 2)', () => {
  const key = keyFlag('asters-key');
  const states: Record<string, boolean>[] = [
    { [key]: true },
    { [key]: true, [HALL_GATE_FLAG]: true },
    { [key]: true, [HALL_ROOT_SEEN]: true },
    { [key]: true, [descentSeenFlag('deep-root-1')]: true },
    { [key]: true, [HALL_ROOT_SEEN]: true, [descentSeenFlag('deep-root-1')]: true },
    { [key]: true, [descentSeenFlag('deep-root-1')]: true, [ROOT_HEART_REACHED]: true },
  ];
  it('Sprout, the Gardener and Keeper Aurora always have something to say, and nobody points at a door already opened', () => {
    for (const flags of states) {
      for (const id of ['garden-sprout', 'garden-gardener', 'root-aurora']) {
        const said = visibleLines(NPC_DEFS[id].lines, { ...flags, [NAME_LEARNED]: true }).map(lineText);
        expect(said.length, `${id} ${Object.keys(flags).join(',')}`).toBeGreaterThan(0);
        // Neither "go through the door" nor "the key opens it" once you've been down (16d review round 3).
        if (flags[descentSeenFlag('deep-root-1')]) expect(said.join(' '), id).not.toMatch(/great door/);
        if (flags[HALL_GATE_FLAG]) expect(said.join(' '), id).not.toMatch(/Key opens the great door/);
        if (id === 'root-aurora' && !flags[descentSeenFlag('deep-root-1')]) expect(said.join(' '), id).not.toMatch(/Back from the Deep Root/);
      }
    }
  });
});

describe("Glim's Nook (16d review round 2)", () => {
  it('a defeat on B4 or deeper wakes you in her nook — above the Tide Echo — and higher up at the Lamplight Rest', () => {
    for (const z of ['deep-root-4', 'deep-root-5', 'deep-root-6', 'deep-root-7'] as const) {
      expect(wakeAfterDefeat({ lastRest: null, zoneId: z }).zoneId, z).toBe('deep-root-4');
      expect(wakeShelter({ zoneId: z })?.line, z).toMatch(/Glim the Glowworm/);
    }
    // …and on B1–B3 in Glimmer's Nook on B1 (16d review round 4: the Door was a long, dangerous walk back).
    for (const z of ['deep-root-1', 'deep-root-2', 'deep-root-3'] as const) {
      expect(wakeAfterDefeat({ lastRest: null, zoneId: z }).zoneId, z).toBe('deep-root-1');
      expect(wakeShelter({ zoneId: z })?.line, z).toMatch(/Glimmer the Glowworm/);
    }
    const b4 = ZONES['deep-root-4'];
    const pos = wakeAfterDefeat({ lastRest: null, zoneId: 'deep-root-4' }).pos!;
    const wake = { x: Math.floor(pos.x / 32), y: Math.floor(pos.y / 32) };
    const echo = b4.enemies.find((e) => e.defId === 'echo-tide-colossus')!;
    expect(wake.y).toBeLessThan(echo.y); // the stairs-up side of the gap
    // …and from the nook the echo is reached without passing it.
    const open = reach(b4, { from: wake, gates: 'open', blocked: (x, y) => x === echo.x && y === echo.y });
    expect(touches(open, echo.x, echo.y)).toBe(true);
  });
});
