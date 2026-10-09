import type { BoatSpot, SaveData, ZoneId } from '../types';
import { GREAT_FOGBANK, SEA_CHARS, TILE, ZONES, fogAt, fogLifted, isZoneId, tileAt } from './zones';
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

/**
 * Can the boat float here: open sea on a map the sea joins to others (a
 * town's pond won't do), not under fog that still stands?
 */
export function afloatAt(zoneId: ZoneId, x: number, y: number, flags: Record<string, boolean>): boolean {
  const z = ZONES[zoneId];
  return !!z.seaLinks?.length && SEA_CHARS.has(tileAt(z, x, y)) && !fogAt(z, x, y, flags);
}

/** Is this a mooring the boat can sit at — afloat (`afloatAt`) on a real map? */
export function validMooring(spot: unknown, flags: Record<string, boolean> = {}): spot is BoatSpot {
  if (typeof spot !== 'object' || spot === null) return false;
  const s = spot as Record<string, unknown>;
  if (!isZoneId(s.zoneId)) return false;
  if (!Number.isInteger(s.x) || !Number.isInteger(s.y)) return false;
  return afloatAt(s.zoneId, s.x as number, s.y as number, flags);
}

/** How far (cells) a boat may be moved to wait beside a hero put ashore by a load (`seaBeside`). */
export const BOAT_REMOOR_REACH = 8;

/** The cell nearest (x, y), within `reach`, where the boat can float on this map — null if none. */
export function seaBeside(
  zoneId: ZoneId,
  x: number,
  y: number,
  flags: Record<string, boolean>,
  reach: number,
): { x: number; y: number } | null {
  if (!ZONES[zoneId].seaLinks?.length) return null;
  return nearestSea(ZONES[zoneId], x, y, reach, (cx, cy) => afloatAt(zoneId, cx, cy, flags));
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

/** A boat moored this close to Marlow's dock (cells, either way) is home already. */
export const DOCK_NEAR = 2;

/**
 * Where the boat is when it's away from Marlow's dock — another map, or more
 * than `DOCK_NEAR` cells off it — and the hero ashore. Null when it's home
 * (or there's no boat, or they're in it).
 */
export function boatAway(save: Pick<SaveData, 'boat' | 'aboard' | 'flags'>): BoatSpot | null {
  if (!hasBoat(save.flags) || save.aboard || save.boat === null) return null;
  const { zoneId, x, y } = save.boat;
  const home = zoneId === BOAT_HOME.zoneId && Math.max(Math.abs(x - BOAT_HOME.x), Math.abs(y - BOAT_HOME.y)) <= DOCK_NEAR;
  return home ? null : save.boat;
}

/**
 * Old Marlow's offer when the boat is away (`boatAway`) — say, at an island
 * the hero flew home from with Return: a line after his own, and a button to
 * take him up on it. He only rows her home if asked (`fetchBoatHome`).
 */
export function boatFetchOffer(npcId: string, save: SaveData): { line: string; done: string } | null {
  const away = npcId === MARLOW ? boatAway(save) : null;
  if (!away) return null;
  const where = away.zoneId === BOAT_HOME.zoneId ? 'moored along the coast' : `still out in ${placeIn(away.zoneId)}`;
  return {
    line: `The Biscuit's ${where}? Don't fret — I can row her home to my dock for you. Just say the word!`,
    done: "There — she's tied up at my dock again, bobbing like a duck. Off you go!",
  };
}

/** Marlow rows the boat home: it waits at his dock again. */
export function fetchBoatHome(s: SaveData): SaveData {
  return { ...s, boat: null };
}

/** A map's name mid-sentence: "the Silver Shallows", "Dawnreach". */
function placeIn(zoneId: ZoneId): string {
  const name = ZONES[zoneId].name;
  return name.startsWith('The ') ? `the ${name.slice(4)}` : name;
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

/** Within this many cells of the standing Great Fogbank, its music takes over… */
export const FOGBANK_NEAR = 6;
/** …and it lasts until you're more than this many away, so sailing along the edge doesn't flip the music back and forth. */
export const FOGBANK_LEAVE = 9;

/**
 * Which sea area the hero is in — null on land (and anywhere off the two sea
 * maps). `prev`, the area they were in, keeps the fogbank's music a little
 * longer on the way out (`FOGBANK_LEAVE`).
 */
export function seaAreaAt(
  save: Pick<SaveData, 'zoneId' | 'pos' | 'aboard' | 'flags'>,
  prev: SeaArea | null = null,
): SeaArea | null {
  if (save.zoneId === 'dawnreach') return save.aboard ? 'dawnreach-waters' : null;
  if (save.zoneId !== 'silver-shallows') return null;
  const fog = ZONES['silver-shallows'].fogs?.find((f) => f.id === GREAT_FOGBANK);
  if (fog && save.pos && !fogLifted(fog, save.flags)) {
    const x = Math.floor(save.pos.x / TILE);
    const y = Math.floor(save.pos.y / TILE);
    const dx = Math.max(fog.x - x, 0, x - (fog.x + fog.w - 1));
    const dy = Math.max(fog.y - y, 0, y - (fog.y + fog.h - 1));
    if (Math.max(dx, dy) <= (prev === 'great-fogbank' ? FOGBANK_LEAVE : FOGBANK_NEAR)) return 'great-fogbank';
  }
  return 'silver-shallows';
}
