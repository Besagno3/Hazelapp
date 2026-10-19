import type { BoatSpot, SaveData, ZoneId } from '../types';
import { GREAT_FOGBANK, SEA_CHARS, TILE, ZONES, fogAt, fogLifted, isZoneId, tileAt } from './zones';
import { nearestSea } from '../lib/travel';
import { reach } from '../lib/reach';

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
export function boatSpot(save: Pick<SaveData, 'boat' | 'vehicle' | 'flags'>): BoatSpot | null {
  if (!hasBoat(save.flags) || save.vehicle === 'boat') return null;
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
 * nearby. A no-op when they're ashore. Spread into the save: Return takes the
 * hero out of the boat this way (a battle lost at sea sends it home instead —
 * `boatAfterDefeat`).
 */
export function moorBoat(save: Pick<SaveData, 'vehicle' | 'boat' | 'zoneId' | 'pos'>): Pick<SaveData, 'vehicle' | 'boat'> {
  if (save.vehicle !== 'boat') return { vehicle: 'foot', boat: save.boat };
  const z = ZONES[save.zoneId];
  const cell = save.pos ? nearestSea(z, Math.floor(save.pos.x / TILE), Math.floor(save.pos.y / TILE)) : null;
  return { vehicle: 'foot', boat: cell ? { zoneId: save.zoneId, ...cell } : null };
}

/**
 * Where the boat should be for a hero who wakes in — or flies with Return to —
 * `townZone`: an island town's `mooring` (#75 item 14h, #114o), so they're
 * never on the island without it. Null when it can stay where it is: not an
 * island, or moored at that beach already.
 */
export function islandBoat(save: Pick<SaveData, 'vehicle' | 'boat'>, townZone: ZoneId | undefined): BoatSpot | null {
  const mooring = townZone && isZoneId(townZone) ? ZONES[townZone].mooring : undefined;
  if (!mooring) return null;
  const at = save.vehicle === 'boat' ? null : (save.boat ?? BOAT_HOME);
  // Already there only if the hero can climb in from the island: the boat is
  // right beside ground they can walk to from the town's door (`canBoard`) —
  // not just somewhere near, out in open water (#75 item 14h review).
  const there = at && at.zoneId === mooring.zoneId && boardableFrom(islandGround(townZone!, mooring.zoneId), at);
  return there ? null : mooring;
}

/** The ground a hero can walk to from an island town's door, on the map the boat floats on. */
function islandGround(townZone: ZoneId, sea: ZoneId): Set<string> {
  const out = ZONES[townZone].exits.find((e) => e.to === sea);
  return out ? reach(ZONES[sea], { from: { x: out.spawnX, y: out.spawnY }, flags: null }) : new Set();
}

/** Can a hero standing somewhere in `ground` climb into a boat moored at `boat` (beside it, corners too)? */
function boardableFrom(ground: Set<string>, boat: { x: number; y: number }): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (ground.has(`${boat.x + dx},${boat.y + dy}`)) return true;
  return false;
}

/**
 * The boat after a defeat (#75 item 14d). Beaten out at sea (only a sea critter
 * fights a sailing hero), the hero wakes ashore at an inn, where nobody could
 * climb back into a boat left in open water, so Old Marlow rows out and brings
 * the Biscuit home to his dock; beaten ashore, it stays where it's moored. But a
 * hero who wakes in a town on an island (`wakeZone` with a `mooring`, #114o: the
 * Sunken Archive) would be stranded without it, so Marlow brings it round to
 * that town's beach instead.
 */
export function boatAfterDefeat(save: Pick<SaveData, 'vehicle' | 'boat'>, wakeZone?: ZoneId): Pick<SaveData, 'vehicle' | 'boat'> {
  const island = islandBoat(save, wakeZone);
  if (island) return { vehicle: 'foot', boat: island };
  return save.vehicle === 'boat' ? { vehicle: 'foot', boat: null } : { vehicle: 'foot', boat: save.boat };
}

/**
 * The boat when the hero casts Return to `to` (#75 item 9): flying off
 * mid-voyage leaves it moored where it floats (`moorBoat`, #75 item 14), and
 * flying to a town on an island brings it round to that town's beach (#75
 * item 14h, #114o). `note` is what the toast adds, so the boat never seems to
 * vanish — or to be left behind.
 */
export function boatOnReturn(
  save: Pick<SaveData, 'vehicle' | 'boat' | 'zoneId' | 'pos' | 'flags'>,
  to: ZoneId,
): Pick<SaveData, 'vehicle' | 'boat'> & { note: string } {
  const moored = moorBoat(save);
  const island = hasBoat(save.flags) ? islandBoat(moored, to) : null;
  if (island) return { vehicle: 'foot', boat: island, note: ' Old Marlow will sail the Biscuit round to meet you there.' };
  // Flying to an island town with the boat already moored by it (left there now
  // or before): she's waiting there, and the toast says so (#75 item 14h review).
  const byTheIsland = hasBoat(save.flags) && moored.boat && isZoneId(to) && ZONES[to].mooring?.zoneId === moored.boat.zoneId;
  if (byTheIsland) return { ...moored, note: ' The Biscuit waits by the island, right where you left her.' };
  return { ...moored, note: save.vehicle === 'boat' ? ' The Biscuit stays moored out at sea — Old Marlow can row her home.' : '' };
}

/** The defeat screen's line after a battle lost at sea (`boatAfterDefeat`). */
export const SEA_DEFEAT_LINE = '⛵ Old Marlow rowed the Biscuit home to his dock by Starfall Coast. Find ⛵ on your 📜 Menu map!';

/**
 * What a defeat screen says about the boat (`boatAfterDefeat`, from the save
 * before it): brought round to an island town's beach, rowed home from the
 * sea, or nothing (it stayed where it was moored). Null before it's mended.
 */
export function defeatBoatLine(save: Pick<SaveData, 'vehicle' | 'boat' | 'flags'>, wakeZone: ZoneId): string | null {
  if (!hasBoat(save.flags)) return null;
  if (islandBoat(save, wakeZone)) {
    const z = ZONES[wakeZone];
    return `⛵ Old Marlow sailed the Biscuit round to ${z.the ? 'the ' : ''}${z.name}'s beach for you.`;
  }
  return save.vehicle === 'boat' ? SEA_DEFEAT_LINE : null;
}

/** A boat moored this close to Marlow's dock (cells, either way) is home already. */
export const DOCK_NEAR = 2;

/**
 * Where the boat is when it's away from Marlow's dock — another map, or more
 * than `DOCK_NEAR` cells off it — and the hero ashore. Null when it's home
 * (or there's no boat, or they're in it).
 */
export function boatAway(save: Pick<SaveData, 'boat' | 'vehicle' | 'flags'>): BoatSpot | null {
  if (!hasBoat(save.flags) || save.vehicle === 'boat' || save.boat === null) return null;
  return atDock(save.boat) ? null : save.boat;
}

/** Is a boat moored here home at Marlow's dock — within `DOCK_NEAR` cells of it? */
export function atDock({ zoneId, x, y }: BoatSpot): boolean {
  return zoneId === BOAT_HOME.zoneId && Math.max(Math.abs(x - BOAT_HOME.x), Math.abs(y - BOAT_HOME.y)) <= DOCK_NEAR;
}

/**
 * Can a hero on foot at `from`, on the map the boat is moored on, walk up and
 * climb into it (beside it, corners too) — gates and fog as they stand — and
 * does it float on water that reaches Marlow's dock, so the dock's "sail
 * east" is its way out too? Then a boat left down Dawnreach's coast is a
 * walk away, and the way needs no Old Marlow (#159 r2).
 */
export function boatWalkable(boat: BoatSpot, from: { x: number; y: number }, flags: Record<string, boolean> | null): boolean {
  if (boat.zoneId !== BOAT_HOME.zoneId) return false;
  const z = ZONES[boat.zoneId];
  if (!boardableFrom(reach(z, { from, flags, gates: 'flags' }), boat)) return false;
  return reach(z, { from: boat, aboard: true, flags }).has(`${BOAT_HOME.x},${BOAT_HOME.y}`);
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
 * the Silver Shallows — its islets too, specks in it — the water near the
 * Great Fogbank while the fog stands, and the Starfall Sea: anywhere on
 * Taleshore's map (#75 item 15c).
 */
export const SEA_AREAS = ['dawnreach-waters', 'silver-shallows', 'great-fogbank', 'starfall-sea'] as const;
export type SeaArea = (typeof SEA_AREAS)[number];

/** Within this many cells of the standing Great Fogbank, its music takes over… */
export const FOGBANK_NEAR = 6;
/** …and it lasts until you're more than this many away, so sailing along the edge doesn't flip the music back and forth. */
export const FOGBANK_LEAVE = 9;

/**
 * Which sea area the hero is in — null on Dawnreach's land and anywhere off
 * the sea maps (all of Taleshore's map is the Starfall Sea's, #75 item 15c).
 * `prev`, the area they were in, keeps the fogbank's music a little
 * longer on the way out (`FOGBANK_LEAVE`).
 */
export function seaAreaAt(
  save: Pick<SaveData, 'zoneId' | 'pos' | 'vehicle' | 'flags'>,
  prev: SeaArea | null = null,
): SeaArea | null {
  if (save.zoneId === 'dawnreach') return save.vehicle === 'boat' ? 'dawnreach-waters' : null;
  // Taleshore (#75 item 15c): the Starfall Sea's music anywhere on its map, like the Shallows'.
  if (save.zoneId === 'taleshore') return 'starfall-sea';
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
