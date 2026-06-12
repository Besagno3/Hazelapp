import type { Topic, ZoneId } from '../types';

/**
 * The world of Lumina (#37): a hub field with four topic zones off its edges
 * (FF1's four-regions structure). Maps are ASCII grids — placeholder
 * "programmer art" rendered as colored tiles + emoji until CC0 tilesets land.
 *
 * Legend:
 *   '#'  solid scenery (trees / rocks / walls — per-zone emoji)
 *   '~'  water (solid)
 *   '.'  walkable ground
 *   ','  walkable decoration (flowers etc.)
 *   '='  walkable path
 *   'S'  save crystal (solid; interact to save)
 *   'C'  treasure chest (solid; bump → question lock)
 *   'G'  gate (solid until its flag is set; bump → gatekeeper question)
 *   'E'  zone exit (walkable; must have a matching entry in `exits`)
 *
 * zones.test.ts validates every invariant (row lengths, legend chars, exits,
 * actor placements on walkable tiles, one fiend per topic zone…).
 */

export const TILE = 32;
export const LEGEND_CHARS = new Set(['#', '~', '.', ',', '=', 'S', 'C', 'G', 'E']);
export const WALKABLE_CHARS = new Set(['.', ',', '=', 'E']);

export interface ZoneExit {
  /** Grid cell of the 'E' tile. */
  x: number;
  y: number;
  to: ZoneId;
  /** Grid cell the player appears at in the target zone. */
  spawnX: number;
  spawnY: number;
}

export interface NpcPlacement {
  defId: string;
  x: number;
  y: number;
}

export interface EnemyPlacement {
  defId: string;
  x: number;
  y: number;
}

export interface ZoneDef {
  id: ZoneId;
  name: string;
  /** Topic zones carry their topic; the hub has none. */
  topic?: Topic;
  map: string[];
  ground: [number, number, number];
  path: [number, number, number];
  solidEmoji: string;
  decoEmoji: string;
  spawn: { x: number; y: number };
  npcs: NpcPlacement[];
  enemies: EnemyPlacement[];
  exits: ZoneExit[];
}

export const HUB_ZONE: ZoneId = 'lumina-field';

export const ZONES: Record<ZoneId, ZoneDef> = {
  'lumina-field': {
    id: 'lumina-field',
    name: 'Lumina Field',
    map: [
      '#########EE###########',
      '#....,....==....,....#',
      '#..S......==......C..#',
      '#.........==.........#',
      '#...##....==....##...#',
      'E.........==.........E',
      'E.........==.........E',
      '#...##....==....##...#',
      '#~~~......==......~~~#',
      '#~~~......==......~~~#',
      '#.........==.........#',
      '#....,....==....,....#',
      '#.........==.........#',
      '#########EE###########',
    ],
    ground: [104, 168, 104],
    path: [196, 178, 128],
    solidEmoji: '🌳',
    decoEmoji: '🌼',
    spawn: { x: 10, y: 11 },
    npcs: [
      { defId: 'elder-lumen', x: 12, y: 2 },
      { defId: 'hub-innkeeper', x: 5, y: 3 },
      { defId: 'hub-librarian', x: 16, y: 3 },
      { defId: 'hub-kid', x: 7, y: 10 },
      { defId: 'hub-merchant', x: 16, y: 10 },
    ],
    enemies: [],
    exits: [
      { x: 9, y: 0, to: 'verdara', spawnX: 10, spawnY: 12 },
      { x: 10, y: 0, to: 'verdara', spawnX: 10, spawnY: 12 },
      { x: 0, y: 5, to: 'numbria', spawnX: 19, spawnY: 6 },
      { x: 0, y: 6, to: 'numbria', spawnX: 19, spawnY: 6 },
      { x: 21, y: 5, to: 'gearfall', spawnX: 2, spawnY: 6 },
      { x: 21, y: 6, to: 'gearfall', spawnX: 2, spawnY: 6 },
      { x: 9, y: 13, to: 'chromaria', spawnX: 10, spawnY: 2 },
      { x: 10, y: 13, to: 'chromaria', spawnX: 10, spawnY: 2 },
    ],
  },

  numbria: {
    id: 'numbria',
    name: 'Numbria',
    topic: 'math',
    map: [
      '######################',
      '#....,.....#....,....#',
      '#..C.......#......S..#',
      '#..........#.........#',
      '#...##.....#...##....#',
      '#..........#.........#',
      '#..........G.........E',
      '#..........#.........E',
      '#...##.....#...##....#',
      '#..........#.........#',
      '#,.........#......,..#',
      '#..........#.........#',
      '#....,.....#....,....#',
      '######################',
    ],
    ground: [110, 138, 188],
    path: [160, 176, 214],
    solidEmoji: '🏔️',
    decoEmoji: '🔷',
    spawn: { x: 19, y: 6 },
    npcs: [
      { defId: 'sage-abacus', x: 14, y: 3 },
      { defId: 'numbria-villager', x: 17, y: 9 },
      { defId: 'numbria-merchant', x: 14, y: 11 },
    ],
    enemies: [
      { defId: 'sum-slime', x: 17, y: 5 },
      { defId: 'count-bat', x: 14, y: 8 },
      { defId: 'sir-sumsalot', x: 7, y: 6 },
      { defId: 'null-fiend', x: 3, y: 6 },
    ],
    exits: [
      { x: 21, y: 6, to: 'lumina-field', spawnX: 2, spawnY: 5 },
      { x: 21, y: 7, to: 'lumina-field', spawnX: 2, spawnY: 5 },
    ],
  },

  verdara: {
    id: 'verdara',
    name: 'Verdara',
    topic: 'science',
    map: [
      '######################',
      '#....,.......,.......#',
      '#.................C..#',
      '#...##..........##...#',
      '#....................#',
      '#..~~................#',
      '#....................#',
      '##########G###########',
      '#....................#',
      '#...,...........,....#',
      '#....................#',
      '#.S..................#',
      '#....................#',
      '#########EE###########',
    ],
    ground: [92, 158, 102],
    path: [150, 192, 140],
    solidEmoji: '🌲',
    decoEmoji: '🍄',
    spawn: { x: 10, y: 12 },
    npcs: [
      { defId: 'sage-flora', x: 4, y: 10 },
      { defId: 'verdara-villager', x: 16, y: 11 },
      { defId: 'verdara-merchant', x: 17, y: 10 },
    ],
    enemies: [
      { defId: 'spore-puff', x: 5, y: 9 },
      { defId: 'static-jelly', x: 15, y: 9 },
      { defId: 'comet-crab', x: 6, y: 4 },
      { defId: 'smog-fiend', x: 10, y: 2 },
    ],
    exits: [
      { x: 9, y: 13, to: 'lumina-field', spawnX: 10, spawnY: 2 },
      { x: 10, y: 13, to: 'lumina-field', spawnX: 10, spawnY: 2 },
    ],
  },

  gearfall: {
    id: 'gearfall',
    name: 'Gearfall Canyon',
    topic: 'engineering',
    map: [
      '######################',
      '#....,....#......,...#',
      '#.S.......#..........#',
      '#.........#...##.....#',
      '#...##....#..........#',
      '#.........#..........#',
      'E.........G..........#',
      'E.........#..........#',
      '#...##....#...##.....#',
      '#.........#..........#',
      '#....,....#.......,..#',
      '#.........#........C.#',
      '#....,....#....,.....#',
      '######################',
    ],
    ground: [176, 142, 100],
    path: [205, 180, 140],
    solidEmoji: '🪨',
    decoEmoji: '⚙️',
    spawn: { x: 2, y: 6 },
    npcs: [
      { defId: 'sage-cog', x: 5, y: 3 },
      { defId: 'gearfall-villager', x: 4, y: 9 },
      { defId: 'gearfall-merchant', x: 7, y: 11 },
    ],
    enemies: [
      { defId: 'bolt-mouse', x: 6, y: 4 },
      { defId: 'scrap-golem', x: 8, y: 9 },
      { defId: 'gear-wyrm', x: 14, y: 6 },
      { defId: 'rust-fiend', x: 18, y: 6 },
    ],
    exits: [
      { x: 0, y: 6, to: 'lumina-field', spawnX: 19, spawnY: 5 },
      { x: 0, y: 7, to: 'lumina-field', spawnX: 19, spawnY: 5 },
    ],
  },

  chromaria: {
    id: 'chromaria',
    name: 'Chromaria',
    topic: 'creativity',
    map: [
      '#########EE###########',
      '#....................#',
      '#.S...............,..#',
      '#...##..........##...#',
      '#....................#',
      '#......,.............#',
      '#....................#',
      '###########G##########',
      '#....................#',
      '#...,...........,....#',
      '#..........~~........#',
      '#....................#',
      '#..............C.....#',
      '######################',
    ],
    ground: [172, 122, 168],
    path: [206, 162, 200],
    solidEmoji: '🗿',
    decoEmoji: '🌸',
    spawn: { x: 10, y: 2 },
    npcs: [
      { defId: 'sage-muse', x: 4, y: 4 },
      { defId: 'chromaria-villager', x: 16, y: 5 },
      { defId: 'chromaria-merchant', x: 16, y: 2 },
    ],
    enemies: [
      { defId: 'doodle-imp', x: 6, y: 5 },
      { defId: 'off-key-bird', x: 15, y: 4 },
      { defId: 'pixel-witch', x: 10, y: 9 },
      { defId: 'gray-fiend', x: 10, y: 11 },
    ],
    exits: [
      { x: 9, y: 0, to: 'lumina-field', spawnX: 10, spawnY: 11 },
      { x: 10, y: 0, to: 'lumina-field', spawnX: 10, spawnY: 11 },
    ],
  },
};

export function zone(id: ZoneId): ZoneDef {
  return ZONES[id];
}

export function tileAt(z: ZoneDef, x: number, y: number): string {
  return z.map[y]?.[x] ?? '#';
}

/** Stable id for a gate/chest tile — flags and openedChests key on it. */
export function pathTargetId(zoneId: ZoneId, kind: 'gate' | 'chest', x: number, y: number): string {
  return `${zoneId}:${kind}:${x},${y}`;
}

export function gateFlag(id: string): string {
  return `gate:${id}`;
}
