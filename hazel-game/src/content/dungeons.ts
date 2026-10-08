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
  /** Floors from the entrance inward; the first is the place on the overworld. */
  floors: ZoneId[];
  /** The boss waiting on the deepest floor (an enemy def id). */
  boss: string;
}

export const DUNGEONS: DungeonDef[] = [
  {
    id: 'clockwork-depths',
    name: 'Clockwork Depths',
    goes: 'down',
    floors: ['clockwork-depths', 'clockwork-depths-b2', 'clockwork-depths-b3'],
    boss: 'clockwork-titan',
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
 * A floor's title for the HUD: "Clockwork Depths · B2 — The Gear Halls"; the
 * entrance floor shares the dungeon's name ("Clockwork Depths · B1"). Null for
 * a zone that isn't a dungeon floor.
 */
export function floorTitle(zones: Record<ZoneId, ZoneDef>, zoneId: ZoneId): string | null {
  const at = dungeonFloor(zoneId);
  if (!at) return null;
  const label = `${at.dungeon.name} · ${floorLabel(at.dungeon.goes, at.index)}`;
  const name = zones[zoneId].name;
  return name === at.dungeon.name ? label : `${label} — ${name}`;
}

/** Where a dungeon is entered from the overworld (its first floor); any other zone is its own. */
export function dungeonEntrance(zoneId: ZoneId): ZoneId {
  return dungeonFloor(zoneId)?.dungeon.floors[0] ?? zoneId;
}
