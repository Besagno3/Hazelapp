import type { BoatSpot, SaveData } from '../types';
import { GREAT_FOGBANK, SEA_CHARS, TILE, ZONES, fogLifted, tileAt } from './zones';
import { nearestSea } from '../lib/travel';

/**
 * Old Marlow's boat (#75 roadmap item 14, Act II): mended in his quest
 * (`content/quests.ts`, "Marlow's Boat"), it then waits at his dock on
 * Dawnreach's east coast — and afterwards wherever the hero last left it.
 * Boarding, sailing and going ashore are the canvas's (`WorldCanvas`), the
 * terrain rules `lib/travel.ts`'s.
 */

/** Marlow's quest; the boat is yours once it's done. */
export const BOAT_QUEST_ID = 'marlows-boat';
/** Set when the boat quest is complete (`questDoneFlag` of it). */
export const BOAT_MENDED = `quest:${BOAT_QUEST_ID}:done`;

/** Marlow's dock: where the mended boat first waits, and where he rows it back to. */
export const BOAT_HOME: BoatSpot = { zoneId: 'dawnreach', x: 71, y: 30 };

export { GREAT_FOGBANK } from './zones';

/** First boarding: the voyage panels have played (`FIRST_VOYAGE_PANELS`). */
export const FIRST_VOYAGE_SEEN = 'first-voyage-seen';

export function hasBoat(flags: Record<string, boolean>): boolean {
  return flags[BOAT_MENDED] === true;
}

/** Where the boat is moored now — null before it's mended (or while the hero is in it). */
export function boatSpot(save: Pick<SaveData, 'boat' | 'aboard' | 'flags'>): BoatSpot | null {
  if (!hasBoat(save.flags) || save.aboard) return null;
  return save.boat ?? BOAT_HOME;
}

/** Is this a mooring the boat can sit at — open sea on a real map? */
export function validMooring(spot: unknown): spot is BoatSpot {
  if (typeof spot !== 'object' || spot === null) return false;
  const s = spot as Record<string, unknown>;
  if (typeof s.zoneId !== 'string' || !(s.zoneId in ZONES)) return false;
  if (!Number.isInteger(s.x) || !Number.isInteger(s.y)) return false;
  return SEA_CHARS.has(tileAt(ZONES[s.zoneId as BoatSpot['zoneId']], s.x as number, s.y as number));
}

/**
 * Leave the boat where the hero is (mid-voyage): moored on the sea cell under
 * them, or the nearest one — or back at Marlow's dock if there's no sea
 * nearby. A no-op when they're ashore. Spread into the save: Return, a lost
 * battle and the like all take the hero out of the boat this way.
 */
export function moorBoat(save: Pick<SaveData, 'aboard' | 'boat' | 'zoneId' | 'pos'>): Pick<SaveData, 'aboard' | 'boat'> {
  if (!save.aboard) return { aboard: false, boat: save.boat };
  const z = ZONES[save.zoneId];
  const cell = save.pos ? nearestSea(z, Math.floor(save.pos.x / TILE), Math.floor(save.pos.y / TILE)) : null;
  return { aboard: false, boat: cell ? { zoneId: save.zoneId, ...cell } : null };
}

/**
 * Old Marlow offers to row the boat home when the hero is ashore and it's
 * moored somewhere else — say, an island they flew home from with Return.
 * Null when there's nothing to fetch.
 */
export function boatFetch(npcId: string, save: SaveData): { lines: string[]; finish: (s: SaveData) => SaveData } | null {
  if (npcId !== MARLOW || !hasBoat(save.flags) || save.aboard || save.boat === null) return null;
  const { zoneId, x, y } = save.boat;
  if (zoneId === BOAT_HOME.zoneId && x === BOAT_HOME.x && y === BOAT_HOME.y) return null;
  return {
    lines: [
      'Left the boat out on the water, did you? Happens to the best sailors.',
      "Don't fret — I'll row her home to my dock for you. She'll be waiting there, bobbing like a duck.",
    ],
    finish: (s) => ({ ...s, boat: null }),
  };
}

/** Old Marlow's NPC id (on Starfall Coast). */
export const MARLOW = 'coast-fisher';

/**
 * The sea areas, each with its own music (`SEA_TRACK`, lib/audio.ts):
 * Dawnreach's waters while you sail them (ashore it's the overworld theme),
 * the Silver Shallows — its islets too, specks in it — and the water near the
 * Great Fogbank while the fog stands.
 */
export const SEA_AREAS = ['dawnreach-waters', 'silver-shallows', 'great-fogbank'] as const;
export type SeaArea = (typeof SEA_AREAS)[number];

/** Within this many cells of the standing Great Fogbank, its music takes over. */
export const FOGBANK_NEAR = 6;

/** Which sea area the hero is in — null on land (and anywhere off the two sea maps). */
export function seaAreaAt(save: Pick<SaveData, 'zoneId' | 'pos' | 'aboard' | 'flags'>): SeaArea | null {
  if (save.zoneId === 'dawnreach') return save.aboard ? 'dawnreach-waters' : null;
  if (save.zoneId !== 'silver-shallows') return null;
  const fog = ZONES['silver-shallows'].fogs?.find((f) => f.id === GREAT_FOGBANK);
  if (fog && save.pos && !fogLifted(fog, save.flags)) {
    const x = Math.floor(save.pos.x / TILE);
    const y = Math.floor(save.pos.y / TILE);
    const dx = Math.max(fog.x - x, 0, x - (fog.x + fog.w - 1));
    const dy = Math.max(fog.y - y, 0, y - (fog.y + fog.h - 1));
    if (Math.max(dx, dy) <= FOGBANK_NEAR) return 'great-fogbank';
  }
  return 'silver-shallows';
}
