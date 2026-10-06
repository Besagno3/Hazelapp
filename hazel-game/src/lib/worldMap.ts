import { TILE, type ZoneDef, type ZoneId } from '../content/zones';

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
