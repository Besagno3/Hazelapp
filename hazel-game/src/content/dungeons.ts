import type { ZoneId } from '../types';
import type { ZoneDef } from './zones';

/**
 * Dungeons (#75 roadmap item 10): a run of floors joined by stairs, from the
 * entrance inward. Every floor is an ordinary zone of kind `dungeon` — it
 * keeps your place in the save, holds critters, chests, NPCs and a save
 * crystal, may be bigger than one screen, and may be dark (`ZoneDef.dark`:
 * dim until Glow, with pitch-dark corners). Stairs ('>' down, '<' up) are
 * ordinary exits inside the map, so moving between floors fades like going
 * into a place. What this module adds is the shape: which floors belong
 * together, which way is deeper, what each floor is called, and the boss at
 * the bottom — zones.test checks every floor links to the next and back.
 *
 * The Crystal Spire (`content/spire.ts`) climbs the same way — floors from
 * the door upward, "Floor N" labels, darkness that closes in — but its floors
 * are a trial run by `SpireOverlay` (seals, candles, Umbra), not places that
 * save your spot; see `SPIRE_DUNGEON`.
 */
export interface DungeonDef {
  id: string;
  /** The dungeon as a place ("Clockwork Depths") — also its first floor's name. */
  name: string;
  /** Which way is deeper: a cave goes down, a tower goes up. */
  goes: 'down' | 'up';
  /** Floors from the entrance inward; the first is the place on the overworld (or down `from`'s stairs). */
  floors: ZoneId[];
  /**
   * The place whose stairs lead to the first floor (#75 item 16a: the Dream
   * Root, down from the Crystal Spire's grounds) — when it isn't an icon on
   * the overworld.
   */
  from?: ZoneId;
  /** The boss waiting on the deepest floor (an enemy def id) — none for a dungeon whose last floor is a place, not a fight (the Dream Root's Door; the Deep Root until Umbra Remembered, 16e). */
  boss?: string;
}

export const DUNGEONS: DungeonDef[] = [
  {
    id: 'clockwork-depths',
    name: 'Clockwork Depths',
    goes: 'down',
    floors: ['clockwork-depths', 'clockwork-depths-b2', 'clockwork-depths-b3'],
    boss: 'clockwork-titan',
  },
  {
    // Act IV (#75 item 16a): under the Crystal Spire. Its Door is its only
    // floor; the descent below is the Deep Root (16d).
    id: 'dream-root',
    name: 'Dream Root',
    goes: 'down',
    floors: ['dreamroot-door'],
    from: 'crystal-spire',
  },
  {
    // Act IV (#75 item 16d): seven floors down the deepest root, from the
    // stairs behind the Nameless Hall's great door. Echoes of the wardens hold
    // B2, B4 and B6; the Root's Heart is at the bottom (Umbra Remembered, 16e).
    id: 'deep-root',
    name: 'Deep Root',
    goes: 'down',
    floors: ['deep-root-1', 'deep-root-2', 'deep-root-3', 'deep-root-4', 'deep-root-5', 'deep-root-6', 'deep-root-7'],
    from: 'nameless-hall',
  },
];

/** The Crystal Spire as a dungeon: five floors up from the door (its floors are trial maps, `SPIRE_FLOORS`). */
export const SPIRE_DUNGEON = { id: 'crystal-spire', name: 'The Crystal Spire', goes: 'up' } as const;

/** Which way deeper is: the stairs char that leads on, and the one that leads back. */
export function stairsChars(goes: DungeonDef['goes']): { onward: '>' | '<'; back: '>' | '<' } {
  return goes === 'down' ? { onward: '>', back: '<' } : { onward: '<', back: '>' };
}

/** The dungeon a zone is a floor of, and which floor (0 = the entrance). */
export function dungeonFloor(zoneId: ZoneId): { dungeon: DungeonDef; index: number } | null {
  for (const dungeon of DUNGEONS) {
    const index = dungeon.floors.indexOf(zoneId);
    if (index >= 0) return { dungeon, index };
  }
  return null;
}

/** "B2" in a cave, "Floor 2" in a tower (floors count from 1 at the entrance). */
export function floorLabel(goes: DungeonDef['goes'], index: number): string {
  return goes === 'down' ? `B${index + 1}` : `Floor ${index + 1}`;
}

/**
 * A floor's title for the menu map's caption: "Clockwork Depths · B2 — The Gear Halls"; the
 * entrance floor shares the dungeon's name ("Clockwork Depths · B1"). Null for
 * a zone that isn't a dungeon floor.
 */
export function floorTitle(zones: Record<ZoneId, ZoneDef>, zoneId: ZoneId): string | null {
  const at = dungeonFloor(zoneId);
  if (!at) return null;
  // A one-floor dungeon is just its place (16d review round 3: the Door's "B1" beside the Deep Root's).
  if (at.dungeon.floors.length === 1) return zones[zoneId].name;
  const floor = floorLabel(at.dungeon.goes, at.index);
  const name = zones[zoneId].name;
  const label = `${at.dungeon.name} · ${floor}`;
  return name === at.dungeon.name ? label : `${label} — ${name}`;
}

/** Where a dungeon is entered from the overworld (its first floor); any other zone is its own. */
export function dungeonEntrance(zoneId: ZoneId): ZoneId {
  return dungeonFloor(zoneId)?.dungeon.floors[0] ?? zoneId;
}
