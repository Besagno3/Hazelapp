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
 *   'G'  gate (solid until its flag is set; bump → gatekeeper question, or a
 *        warden's key check when the zone marks it as a `keyGate`, #58)
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
  /**
   * The Spire entrance icon (#55) — only the Crystal Spire zone has one. Bump
   * it to attempt the endgame climb (sealed until all crystals are restored).
   */
  spire?: { x: number; y: number };
  /**
   * A Fiend gate locked by a warden's key (#58) instead of a gatekeeper
   * question. The `G` tile at this position checks `keyForZone(id)`: bump it
   * with the key to open it, or get told which warden boss holds it.
   */
  keyGate?: { x: number; y: number };
}

export const HUB_ZONE: ZoneId = 'lumina-field';

export const ZONES: Record<ZoneId, ZoneDef> = {
  'lumina-field': {
    id: 'lumina-field',
    name: 'Lumina Field',
    map: [
      // Top edge: the village path (cols 2-3) and the Verdara gate (cols 9-10).
      '##EE#####EE###########',
      '#....,....==....,....#',
      '#..S......==......,..#',
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
      { x: 2, y: 0, to: 'lumina-village', spawnX: 10, spawnY: 1 },
      { x: 3, y: 0, to: 'lumina-village', spawnX: 10, spawnY: 1 },
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
      '#..........G.........E',
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
      '##########GG##########',
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
    // The Smog Fiend's gate opens to the Thornroot Key (Whispering Woods, #58).
    keyGate: { x: 10, y: 7 },
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
      'E.........G..........#',
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
    // The Rust Fiend's gate opens to the Mainspring Key (Clockwork Depths, #58).
    keyGate: { x: 10, y: 6 },
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
      '###########GG#########',
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
    // The Gray Fiend's gate opens to the Starlight Prism (Starfall Coast, #58).
    keyGate: { x: 11, y: 7 },
  },

  // --- Expansion: the homeward regions (story zones, no topic) ----------------
  // These are safe exploration screens reached through the village — no fiends,
  // gates, or chests (those need a topic). They carry the expanded narrative.

  'lumina-village': {
    id: 'lumina-village',
    name: 'Lumina Village',
    map: [
      '##########EE##########',
      '#....,..........,....#',
      '#..##..........##....#',
      '#..##....,,....##....#',
      '#....................#',
      '#.S..................#',
      'E....................E',
      'E....................E',
      '#.........,,.........#',
      '#..##..........##....#',
      '#..##..........##....#',
      '#....,..........,....#',
      '#.........,,.........#',
      '##########EE##########',
    ],
    ground: [120, 160, 110],
    path: [196, 178, 128],
    solidEmoji: '🏡',
    decoEmoji: '🌷',
    spawn: { x: 10, y: 2 },
    npcs: [
      { defId: 'village-elder', x: 10, y: 3 },
      { defId: 'village-friend', x: 6, y: 5 },
      { defId: 'village-keeper', x: 14, y: 10 },
    ],
    enemies: [],
    exits: [
      { x: 10, y: 0, to: 'lumina-field', spawnX: 3, spawnY: 1 },
      { x: 11, y: 0, to: 'lumina-field', spawnX: 3, spawnY: 1 },
      { x: 0, y: 6, to: 'whispering-woods', spawnX: 20, spawnY: 6 },
      { x: 0, y: 7, to: 'whispering-woods', spawnX: 20, spawnY: 6 },
      { x: 21, y: 6, to: 'starfall-coast', spawnX: 1, spawnY: 6 },
      { x: 21, y: 7, to: 'starfall-coast', spawnX: 1, spawnY: 6 },
      { x: 10, y: 13, to: 'crystal-spire', spawnX: 10, spawnY: 2 },
      { x: 11, y: 13, to: 'crystal-spire', spawnX: 10, spawnY: 2 },
    ],
  },

  'whispering-woods': {
    id: 'whispering-woods',
    name: 'Whispering Woods',
    topic: 'nature',
    // A gated chest alcove (cols 1-7, behind the col-8 wall) holds the treasure;
    // critters roam the open right half where the spawn and both exits live.
    map: [
      '######################',
      '#..C....#............#',
      '#.......#.........S..#',
      '#...,...#....##......#',
      '#.......#..,.........#',
      '#..,....#............#',
      '#.......G............E',
      '#.......G............E',
      '#.......#....,.......#',
      '#.......#...##.......#',
      '#.......#............#',
      '#...,...#......,.....#',
      '#.......#............#',
      '##########EE##########',
    ],
    ground: [70, 110, 78],
    path: [120, 150, 110],
    solidEmoji: '🌲',
    decoEmoji: '🍂',
    spawn: { x: 20, y: 6 },
    npcs: [
      { defId: 'woods-hermit', x: 10, y: 2 },
      { defId: 'woods-sprite', x: 15, y: 10 },
      { defId: 'woods-warden-sign', x: 19, y: 5 },
    ],
    enemies: [
      { defId: 'mossback-cub', x: 12, y: 4 },
      { defId: 'thornhare', x: 15, y: 8 },
      { defId: 'grumblebee', x: 12, y: 11 },
      { defId: 'thicket-warden', x: 16, y: 4 },
    ],
    exits: [
      { x: 21, y: 6, to: 'lumina-village', spawnX: 1, spawnY: 6 },
      { x: 21, y: 7, to: 'lumina-village', spawnX: 1, spawnY: 6 },
      { x: 10, y: 13, to: 'clockwork-depths', spawnX: 10, spawnY: 2 },
      { x: 11, y: 13, to: 'clockwork-depths', spawnX: 10, spawnY: 2 },
    ],
  },

  'starfall-coast': {
    id: 'starfall-coast',
    name: 'Starfall Coast',
    topic: 'space',
    // A gated tide-pool nook (cols 17-20, behind the col-16 wall) holds the
    // chest; star-critters roam the open sand; the sea (water) fills the south.
    map: [
      '######################',
      '#....,..........#.C..#',
      '#...............#....#',
      '#...##..........#....#',
      '#.S.............G....#',
      '#.....,.........G....#',
      'E...............#....#',
      'E...............#....#',
      '#.........~~~~~~~~~~~#',
      '#.......~~~~~~~~~~~~~#',
      '#....~~~~~~~~~~~~~~~~#',
      '#..~~~~~~~~~~~~~~~~~~#',
      '#~~~~~~~~~~~~~~~~~~~~#',
      '######################',
    ],
    ground: [210, 195, 140],
    path: [225, 210, 160],
    solidEmoji: '🪨',
    decoEmoji: '🐚',
    spawn: { x: 1, y: 6 },
    npcs: [
      { defId: 'coast-fisher', x: 5, y: 8 },
      { defId: 'coast-stargazer', x: 15, y: 3 },
      { defId: 'coast-warden-sign', x: 4, y: 6 },
    ],
    enemies: [
      { defId: 'tide-sprite', x: 8, y: 2 },
      { defId: 'meteor-mite', x: 11, y: 5 },
      { defId: 'moon-moth', x: 5, y: 7 },
      { defId: 'tide-colossus', x: 12, y: 3 },
    ],
    exits: [
      { x: 0, y: 6, to: 'lumina-village', spawnX: 20, spawnY: 6 },
      { x: 0, y: 7, to: 'lumina-village', spawnX: 20, spawnY: 6 },
    ],
  },

  'clockwork-depths': {
    id: 'clockwork-depths',
    name: 'Clockwork Depths',
    topic: 'history',
    // A gated vault (the bottom half, behind the row-8 wall) holds the chest;
    // old-machine critters wind through the open upper galleries.
    map: [
      '##########EE##########',
      '#....................#',
      '#..##..........##....#',
      '#..##..........##....#',
      '#.S..................#',
      '#....,..........,....#',
      '#....................#',
      '#.........,,.........#',
      '##########GG##########',
      '#..##..........##....#',
      '#..##..........##....#',
      '#....,....C.....,....#',
      '#....................#',
      '######################',
    ],
    ground: [90, 84, 110],
    path: [130, 120, 150],
    solidEmoji: '⛰️',
    decoEmoji: '⚙️',
    spawn: { x: 10, y: 2 },
    npcs: [
      { defId: 'depths-tinker', x: 8, y: 7 },
      { defId: 'depths-echo', x: 14, y: 5 },
      { defId: 'depths-warden-sign', x: 10, y: 3 },
    ],
    enemies: [
      { defId: 'cog-sprite', x: 6, y: 5 },
      { defId: 'hourglass-imp', x: 14, y: 6 },
      { defId: 'relic-golem', x: 8, y: 2 },
      { defId: 'clockwork-titan', x: 10, y: 5 },
    ],
    exits: [
      { x: 10, y: 0, to: 'whispering-woods', spawnX: 10, spawnY: 11 },
      { x: 11, y: 0, to: 'whispering-woods', spawnX: 10, spawnY: 11 },
    ],
  },

  'crystal-spire': {
    id: 'crystal-spire',
    name: 'The Crystal Spire',
    map: [
      '##########EE##########',
      '#....................#',
      '#........,..,........#',
      '#..................,.#',
      '#.S..................#',
      '#......##....##......#',
      '#......#......#......#',
      '#......#......#......#',
      '#......##....##......#',
      '#....................#',
      '#.........,,.........#',
      '#....................#',
      '#....,..........,....#',
      '######################',
    ],
    ground: [120, 110, 180],
    path: [180, 170, 220],
    solidEmoji: '🏛️',
    decoEmoji: '✨',
    spawn: { x: 10, y: 2 },
    npcs: [{ defId: 'spire-keeper', x: 16, y: 6 }],
    enemies: [],
    exits: [
      { x: 10, y: 0, to: 'lumina-village', spawnX: 8, spawnY: 12 },
      { x: 11, y: 0, to: 'lumina-village', spawnX: 8, spawnY: 12 },
    ],
    // The Spire itself stands in the central shrine — the endgame entrance.
    spire: { x: 10, y: 6 },
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

/**
 * A gate may span two tiles (a double-wide opening — easier to walk through
 * when open). Every 'G' in one orthogonally-connected run shares a single
 * identity: its flag, its gatekeeper question / key check, and its open state
 * all key off the run's canonical (top-left, i.e. min-y then min-x) cell, so
 * bumping any tile opens the whole gate at once. Single-tile gates are just a
 * run of one, so their id is unchanged.
 */
export function gateIdAt(zoneId: ZoneId, map: string[], x: number, y: number): string {
  const seen = new Set<string>();
  const stack: [number, number][] = [[x, y]];
  let cx = x;
  let cy = y;
  while (stack.length) {
    const [gx, gy] = stack.pop()!;
    const key = `${gx},${gy}`;
    if (seen.has(key) || (map[gy]?.[gx] ?? '') !== 'G') continue;
    seen.add(key);
    if (gy < cy || (gy === cy && gx < cx)) {
      cx = gx;
      cy = gy;
    }
    stack.push([gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1]);
  }
  return pathTargetId(zoneId, 'gate', cx, cy);
}
