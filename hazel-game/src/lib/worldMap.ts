import { TILE, fogLifted, type FogDef, type PlaceDef, type PlaceIcon, type ZoneDef, type ZoneId } from '../content/zones';
import { TOPIC_REGISTRY, crystalFlag } from '../content/topics';
import { placesInside } from './fog';

/**
 * The menu's world map (#75 Phase 1): the overworld drawn small, one coloured
 * square per tile, with its places marked and a "you are here" star. Pure —
 * the component just paints what these return.
 */

const CELL_COLOR: Record<string, string> = {
  '~': '#2a5a9a', // sea
  ':': '#e2d29c', // sand
  '.': '#64a462', // grass
  ',': '#76b06a', // flowers
  '#': '#2f6f3f', // trees
  '^': '#8a90a8', // mountains
  '=': '#c8b482', // road
  P: '#64a462', // a place sits on grass; its marker is drawn on top
};

/** Colour of one overworld tile on the map (unknown tiles read as grass). */
export function mapCellColor(ch: string): string {
  return CELL_COLOR[ch] ?? CELL_COLOR['.'];
}

/** Fog on the map: a pale square, explained by the legend under it. */
export const FOG_COLOR = '#e6e8f4';

/** Marks a bank that any one crystal clears. */
export const ANY_CRYSTAL_EMOJI = '💎';

/**
 * What the map shows on a fog bank (#75 item 7): the emoji of the one crystal
 * that clears it, or 💎 when any crystal will do — so the map shows which
 * crystal opens which part of the world.
 */
export function fogMarker(f: FogDef): string {
  const own = f.liftedBy.length === 1 ? TOPIC_REGISTRY.find((t) => crystalFlag(t.id) === f.liftedBy[0]) : undefined;
  return own?.emoji ?? ANY_CRYSTAL_EMOJI;
}

/**
 * Where on the map to draw a bank's marker (tile coordinates of its centre),
 * nudged to the bank's top edge when a place icon sits in the middle of it
 * (the Spire inside its ring of fog) so the two don't overlap.
 */
export function fogMarkerAt(f: FogDef, places: { x: number; y: number }[]): { x: number; y: number } {
  const cx = f.x + (f.w - 1) / 2;
  const cy = f.y + (f.h - 1) / 2;
  const crowded = places.some((p) => Math.abs(p.x - cx) <= 1 && Math.abs(p.y - cy) <= 1);
  return crowded ? { x: cx, y: f.y } : { x: cx, y: cy };
}

/**
 * One emoji per kind of place, drawn on the map at the place and beside its
 * name in the list, so a kid can match "Whispering Woods" to its spot.
 */
export const PLACE_EMOJI: Record<PlaceIcon, string> = {
  town: '🏘️',
  hamlet: '🌾',
  forest: '🌲',
  cave: '🕳️',
  shrine: '🕯️',
  coast: '🌊',
  grove: '🌙',
  tower: '🗼',
};

/** Stands in for a place that's still hidden in fog. */
export const HIDDEN_PLACE_EMOJI = '☁️';

/**
 * A place's emoji on the map and in the list: its own, or ☁️ while it sits
 * inside a bank of fog that hasn't lifted (the Spire in its ring, #75 item 7)
 * — the map doesn't show what the world itself still hides.
 */
export function placeEmoji(world: ZoneDef, place: PlaceDef, flags: Record<string, boolean>): string {
  const hidden = (world.fogs ?? []).some((f) => !fogLifted(f, flags) && placesInside(f, [place]).length > 0);
  return hidden ? HIDDEN_PLACE_EMOJI : PLACE_EMOJI[place.icon];
}

export interface MapMarker {
  /** Tile on the overworld. */
  x: number;
  y: number;
  /** True when this is exactly where the hero stands (on the overworld itself). */
  exact: boolean;
  /** The place the marker stands for, when you're inside (or beyond) one. */
  place?: string;
}

/**
 * Where to put "you are here". On the overworld: the hero's own tile. Inside a
 * place: that place's icon. In a zone that isn't on the map yet (Numbria, off
 * Lumina Field): follow the exits back to the nearest place that is.
 */
export function whereOnMap(
  zones: Record<ZoneId, ZoneDef>,
  overworld: ZoneDef,
  zoneId: ZoneId,
  pos: { x: number; y: number } | null,
): MapMarker | null {
  if (zoneId === overworld.id) {
    const cell = pos
      ? { x: Math.floor(pos.x / TILE), y: Math.floor(pos.y / TILE) }
      : { x: overworld.spawn.x, y: overworld.spawn.y };
    return { ...cell, exact: true };
  }
  // A place on the map is a 'P' exit from the overworld into that zone.
  const iconOf = (id: ZoneId) => {
    const exit = overworld.exits.find((e) => e.to === id && overworld.map[e.y]?.[e.x] === 'P');
    return exit && overworld.places?.find((p) => p.x === exit.x && p.y === exit.y);
  };
  const seen = new Set<ZoneId>([zoneId]);
  const queue: ZoneId[] = [zoneId];
  while (queue.length) {
    const id = queue.shift()!;
    const icon = iconOf(id);
    if (icon) return { x: icon.x, y: icon.y, exact: false, place: icon.name };
    for (const e of zones[id].exits) {
      if (e.to === overworld.id || seen.has(e.to)) continue;
      seen.add(e.to);
      queue.push(e.to);
    }
  }
  return null;
}

/**
 * The line under the map. "You're here: <name>" reads right whatever the name
 * looks like ("The Crystal Spire", "Shrine of First Light") — no articles to
 * get wrong.
 */
export function mapCaption(here: MapMarker | null, zoneName: string, worldName: string): string {
  if (here?.exact) return `You're out on ${worldName}`;
  if (!here?.place || here.place === zoneName) return `You're here: ${zoneName}`;
  return `You're here: ${zoneName} (past ${here.place})`;
}
