import { describe, it, expect } from 'vitest';
import {
  FIELD_SPELLS,
  FIELD_SPELL_IDS,
  RETURN_TOWNS,
  canGlow,
  fieldSpellFlag,
  fieldSpellTaughtBy,
  hasVisited,
  knowsFieldSpell,
  returnLanding,
  returnSpots,
  visitedFlag,
} from './fieldSpells';
import { HUB_ZONE, WALKABLE_CHARS, ZONES, litFlag, reachableOnFoot, tileAt, type ZoneDef } from './zones';
import { NPC_DEFS } from './npcs';
import { crystalFlag } from './topics';

const dawn = ZONES.dawnreach;

/** Cells walkable from (x, y) without opening any gate or crossing fog. */
function walkFrom(z: ZoneDef, x: number, y: number): Set<string> {
  const seen = new Set([`${x},${y}`]);
  const queue: [number, number][] = [[x, y]];
  while (queue.length) {
    const [cx, cy] = queue.shift()!;
    for (const [nx, ny] of [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ]) {
      const key = `${nx},${ny}`;
      if (seen.has(key) || !WALKABLE_CHARS.has(tileAt(z, nx, ny))) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

describe('field spells (#75 item 9)', () => {
  it('each is taught by its own shrine keeper, standing in its own shrine on Dawnreach', () => {
    const shrines = new Set<string>();
    for (const id of FIELD_SPELL_IDS) {
      const spell = FIELD_SPELLS[id];
      expect(spell.id).toBe(id);
      expect(NPC_DEFS[spell.keeper]?.role, spell.keeper).toBe('keeper');
      expect(ZONES[spell.shrine].kind).toBe('shrine');
      expect(ZONES[spell.shrine].npcs.map((p) => p.defId)).toContain(spell.keeper);
      expect(dawn.exits.some((e) => e.to === spell.shrine), `${spell.shrine} is a place on Dawnreach`).toBe(true);
      expect(fieldSpellTaughtBy(spell.keeper)).toBe(spell);
      shrines.add(spell.shrine);
    }
    expect(shrines.size).toBe(FIELD_SPELL_IDS.length);
    // Every keeper teaches something.
    for (const def of Object.values(NPC_DEFS).filter((d) => d.role === 'keeper')) {
      expect(fieldSpellTaughtBy(def.id), def.id).toBeDefined();
    }
    expect(fieldSpellTaughtBy('elder-lumen')).toBeUndefined();
    expect(fieldSpellTaughtBy(null)).toBeUndefined();
  });

  it('knowing one is a flag — older saves know none', () => {
    expect(knowsFieldSpell('return', {})).toBe(false);
    expect(knowsFieldSpell('return', { [fieldSpellFlag('return')]: true })).toBe(true);
    expect(fieldSpellFlag('glow')).toBe('spell:glow');
  });

  it('Return and Calm can be learned from the start; Glow waits behind the fog for a crystal', () => {
    const doorOf = (id: keyof typeof FIELD_SPELLS) => {
      const e = dawn.exits.find((x) => x.to === FIELD_SPELLS[id].shrine)!;
      return `${e.x},${e.y}`;
    };
    const fresh = reachableOnFoot(dawn, {});
    expect(fresh.has(doorOf('return'))).toBe(true);
    expect(fresh.has(doorOf('calm'))).toBe(true);
    expect(fresh.has(doorOf('glow'))).toBe(false);
    expect(reachableOnFoot(dawn, { [crystalFlag('math')]: true }).has(doorOf('glow'))).toBe(true);
  });
});

describe('Return (#75 item 9)', () => {
  it('home counts as visited from the start; other towns once you have been there', () => {
    expect(hasVisited(HUB_ZONE, {})).toBe(true);
    expect(hasVisited('numbria', {})).toBe(false);
    expect(hasVisited('numbria', { [visitedFlag('numbria')]: true })).toBe(true);
  });

  it('an older save (no visits recorded) counts a town whose crystal it restored', () => {
    expect(hasVisited('numbria', { [crystalFlag('math')]: true })).toBe(true);
    expect(hasVisited('verdara', { [crystalFlag('math')]: true })).toBe(false);
  });

  it('flies only to towns you have visited, home first', () => {
    expect(returnSpots(ZONES, {}).map((s) => s.zoneId)).toEqual([HUB_ZONE]);
    const spots = returnSpots(ZONES, { [visitedFlag('gearfall')]: true, [visitedFlag('numbria')]: true });
    expect(spots.map((s) => s.zoneId)).toEqual(['lumina-village', 'numbria', 'gearfall']);
    expect(spots[1].name).toBe('Numbria');
    // Places that aren't towns are never offered, visited or not.
    expect(returnSpots(ZONES, { [visitedFlag('whispering-woods')]: true }).map((s) => s.zoneId)).toEqual([HUB_ZONE]);
  });

  it('lands home on the plaza, and anywhere else just inside the front door', () => {
    expect(returnLanding(ZONES, HUB_ZONE)).toEqual(ZONES[HUB_ZONE].spawn);
    const door = dawn.exits.find((e) => e.to === 'numbria')!;
    expect(returnLanding(ZONES, 'numbria')).toEqual({ x: door.spawnX, y: door.spawnY });
  });

  it('every landing is open ground with a way back out — never shut in behind a gate', () => {
    for (const id of RETURN_TOWNS) {
      const z = ZONES[id];
      const at = returnLanding(ZONES, id);
      expect(WALKABLE_CHARS.has(tileAt(z, at.x, at.y)), `${id} landing`).toBe(true);
      const area = walkFrom(z, at.x, at.y);
      const out = z.exits.filter((e) => ZONES[e.to].kind === 'overworld');
      expect(
        out.some((e) => area.has(`${e.x},${e.y}`)),
        `${id}: from the landing you can walk out onto Dawnreach`,
      ).toBe(true);
    }
  });
});

describe('Glow (#75 item 9)', () => {
  it('can be cast in a dark place until it is lit — nowhere else', () => {
    const mine = ZONES['echo-mine'];
    expect(canGlow(mine, {})).toBe(true);
    expect(canGlow(mine, { [litFlag('echo-mine')]: true })).toBe(false);
    expect(canGlow(ZONES.dawnreach, {})).toBe(false);
  });
});
