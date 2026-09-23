import type { Topic } from '../types';

/**
 * Every zone id in Lumina — the single source of truth (Wave 0.3). Adding a
 * zone means adding its id here + its `ZONES` entry below; the compiler
 * enforces both directions (`ZONES` is a `Record<ZoneId, ZoneDef>`), and
 * `types/index.ts` re-exports the derived `ZoneId` so save/battle types stay
 * in sync automatically.
 */
export const ZONE_IDS = [
  // Original five (hub + four topic regions)
  'lumina-field',
  'numbria',
  'verdara',
  'gearfall',
  'chromaria',
  // Expansion: story / exploration regions reached through the village
  'lumina-village',
  'whispering-woods',
  'starfall-coast',
  'clockwork-depths',
  'moonwell-grove',
  'crystal-spire',
] as const;

export type ZoneId = (typeof ZONE_IDS)[number];

/**
 * The world of Lumina (#37): a hub field with four topic zones off its edges
 * (FF1's four-regions structure). Maps are ASCII grids rendered with the
 * generated 16-bit tilesets (`content/tiles.ts`). Most zones are one 22×14
 * screen; larger maps (the town) scroll with a camera that follows the hero.
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
 * Buildings (towns, #72) — each must sit inside a `buildings` rect:
 *   'W'  building wall (solid; the bottom row is the street-facing facade)
 *   'D'  door (walkable; exactly one, in the facade row)
 *   'F'  interior floor (walkable)
 *   'K'  shop counter (solid; bump it to talk to whoever stands behind it)
 *   'B'  bookshelf · 'T' table · 'Z' bed (solid furniture)
 *
 * zones.test.ts validates every invariant (row lengths, legend chars, exits,
 * actor placements on walkable tiles, one fiend per topic zone…).
 */

export const TILE = 32;
/** One screen of map — the world canvas viewport (maps may be larger and scroll). */
export const VIEW_COLS = 22;
export const VIEW_ROWS = 14;
export const BUILDING_CHARS = new Set(['W', 'D', 'F', 'K', 'B', 'T', 'Z']);
export const LEGEND_CHARS = new Set(['#', '~', '.', ',', '=', 'S', 'C', 'G', 'E', ...BUILDING_CHARS]);
export const WALKABLE_CHARS = new Set(['.', ',', '=', 'E', 'D', 'F']);

export const ROOF_COLORS = [
  'red',
  'blue',
  'green',
  'purple',
  'slate',
  'leaf',
  'copper',
  'pink',
  'teal',
  'thatch',
  'sea',
  'dusk',
] as const;
export type RoofColor = (typeof ROOF_COLORS)[number];

/**
 * Each place builds in its own style (#73) — walls, facades, floors and
 * windows all change: whitewashed cottages on Lumina Field, plaster-and-timber
 * in the town, blue stone in Numbria,
 * leafy wood in Verdara, riveted brass in Gearfall, painted stripes in
 * Chromaria, logs in the Woods, driftwood on the Coast, carved rock below.
 */
export const BUILDING_STYLES = ['cottage', 'timber', 'stone', 'leaf', 'brass', 'paint', 'log', 'driftwood', 'cave'] as const;
export type BuildingStyle = (typeof BUILDING_STYLES)[number];

export const SIGN_KINDS = ['shop', 'inn', 'library', 'house', 'sage', 'tools', 'star'] as const;
export type SignKind = (typeof SIGN_KINDS)[number];

/**
 * An enterable building (#72): a rectangle of 'W' walls around an interior,
 * with one 'D' door in its bottom (facade) row. Outside, a roof covers every
 * row except the facade, so the building reads as enclosed; once the hero
 * steps inside, the roof fades away to reveal the room.
 */
export interface BuildingDef {
  id: string;
  /** Shown on the roof (e.g. "Item Shop"). */
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  roof: RoofColor;
  /** Architecture (walls / facade / floor tiles). */
  style: BuildingStyle;
  /** Hanging sign beside the door. */
  sign?: SignKind;
}

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
  /** Enterable buildings (#72) — see `BuildingDef`. */
  buildings?: BuildingDef[];
}

export const HUB_ZONE: ZoneId = 'lumina-field';

export const ZONES: Record<ZoneId, ZoneDef> = {
  'lumina-field': {
    id: 'lumina-field',
    name: 'Lumina Field',
    map: [
      '##EE#####EE###########',
      '#.==.....==..WWWWWWW.#',
      '#.==..##.==..WBBFBBW.#',
      '#...S....==,.WFFFFFW.#',
      '#.,..,...==..WBFFFBW.#',
      'E........==..WWWDWWW.E',
      'E====================E',
      '#.WWWWWWW==..........#',
      '#.WBFFFBW==..,.....###',
      '#.WKKKKKW==....~~~~..#',
      '#.WFFFFFW==....~~~~..#',
      '##WWWDWWW==.##.....#.#',
      '#....=...==......,...#',
      '#########EE###########',
    ],
    ground: [104, 168, 104],
    path: [196, 178, 128],
    solidEmoji: '🌳',
    decoEmoji: '🌼',
    spawn: { x: 10, y: 11 },
    buildings: [
      { id: 'lumina-library', name: 'Lumina Library', x: 13, y: 1, w: 7, h: 5, roof: 'purple', style: 'cottage', sign: 'library' },
      { id: 'trading-post', name: "Maple's Trading Post", x: 2, y: 7, w: 7, h: 5, roof: 'red', style: 'cottage', sign: 'shop' },
    ],
    npcs: [
      { defId: 'elder-lumen', x: 12, y: 2 },
      { defId: 'hub-librarian', x: 16, y: 3 },
      { defId: 'hub-kid', x: 14, y: 12 },
      { defId: 'hub-merchant', x: 5, y: 8 },
    ],
    enemies: [],
    exits: [
      { x: 2, y: 0, to: 'lumina-village', spawnX: 21, spawnY: 1 },
      { x: 3, y: 0, to: 'lumina-village', spawnX: 21, spawnY: 1 },
      { x: 9, y: 0, to: 'verdara', spawnX: 10, spawnY: 26 },
      { x: 10, y: 0, to: 'verdara', spawnX: 10, spawnY: 26 },
      { x: 0, y: 5, to: 'numbria', spawnX: 42, spawnY: 6 },
      { x: 0, y: 6, to: 'numbria', spawnX: 42, spawnY: 6 },
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
      '############################################',
      '#....,.....#....,....#..WWWWWWWWW.WWWWWWW..#',
      '#..C.......#......S..#,.WBFFFFFBW.WBFFFBW..#',
      '#..........#.........#..WFFFFFFFW.WKKKKKW..#',
      '#...##.....#...##....#..WTFFFFFTW.WFFFFFW..#',
      '#..........#.........#..WWWWDWWWW.WWWDWWW..#',
      '#..........G.......========================E',
      '#..........G.......========================E',
      '#...##.....#...##....#........WWWWWWW...,..#',
      '#..........#.........##.~~~...WBFFFBW....#.#',
      '#,.........#......,..#..~~~...WFFTFFW.,..#.#',
      '#..........#.........#.....,..WWWDWWW.....,#',
      '#....,.....#....,....#.#....#....=.........#',
      '############################################',
    ],
    ground: [110, 138, 188],
    path: [160, 176, 214],
    solidEmoji: '🏔️',
    decoEmoji: '🔷',
    spawn: { x: 19, y: 6 },
    buildings: [
      { id: 'abacus-observatory', name: 'Abacus Observatory', x: 24, y: 1, w: 9, h: 5, roof: 'slate', style: 'stone', sign: 'sage' },
      { id: 'quill-and-count', name: "Plus's Quill & Count", x: 34, y: 1, w: 7, h: 5, roof: 'blue', style: 'stone', sign: 'shop' },
      { id: 'counting-house', name: 'Counting House', x: 30, y: 8, w: 7, h: 4, roof: 'slate', style: 'stone', sign: 'house' },
    ],
    npcs: [
      { defId: 'sage-abacus', x: 28, y: 3 },
      { defId: 'numbria-villager', x: 17, y: 9 },
      { defId: 'numbria-merchant', x: 37, y: 2 },
    ],
    enemies: [
      { defId: 'sum-slime', x: 17, y: 5 },
      { defId: 'count-bat', x: 14, y: 8 },
      { defId: 'sir-sumsalot', x: 7, y: 6 },
      { defId: 'null-fiend', x: 3, y: 6 },
    ],
    exits: [
      { x: 43, y: 6, to: 'lumina-field', spawnX: 2, spawnY: 5 },
      { x: 43, y: 7, to: 'lumina-field', spawnX: 2, spawnY: 5 },
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
      '#########==###########',
      '#........==..........#',
      '#.WWWWWWW==....~~~.#.#',
      '#.WTFFFTW==.,..~~~.#.#',
      '#.WFFFFFW==..........#',
      '#.WTFFFTW==..........#',
      '#.WWWDWWW==..WWWWWWW.#',
      '#....=...==..WBFFFBW.#',
      '#....======..WKKKKKW.#',
      '#...,....==..WFFFFFW.#',
      '#.##.....==..WWWDWWW.#',
      '#........========....#',
      '#.#.,..#.==..,....,#.#',
      '#........==..........#',
      '#########EE###########',
    ],
    ground: [92, 158, 102],
    path: [150, 192, 140],
    solidEmoji: '🌲',
    decoEmoji: '🍄',
    spawn: { x: 10, y: 12 },
    buildings: [
      { id: 'flora-greenhouse', name: "Flora's Greenhouse", x: 2, y: 15, w: 7, h: 5, roof: 'leaf', style: 'leaf', sign: 'sage' },
      { id: 'tadpole-tonics', name: "Tadpole's Tonics", x: 13, y: 19, w: 7, h: 5, roof: 'green', style: 'leaf', sign: 'shop' },
    ],
    npcs: [
      { defId: 'sage-flora', x: 5, y: 17 },
      { defId: 'verdara-villager', x: 16, y: 11 },
      { defId: 'verdara-merchant', x: 16, y: 20 },
    ],
    enemies: [
      { defId: 'spore-puff', x: 5, y: 9 },
      { defId: 'static-jelly', x: 15, y: 9 },
      { defId: 'comet-crab', x: 6, y: 4 },
      { defId: 'smog-fiend', x: 10, y: 2 },
    ],
    exits: [
      { x: 9, y: 27, to: 'lumina-field', spawnX: 10, spawnY: 2 },
      { x: 10, y: 27, to: 'lumina-field', spawnX: 10, spawnY: 2 },
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
      '####==################',
      '#...==...............#',
      '#...==..,.#...,....#.#',
      '#...==============.#.#',
      '#...==============...#',
      '#.........==.........#',
      '#.WWWWWWWW==WWWWWWW..#',
      '#.WTFFFTTW==WBFFFBW..#',
      '#.WFFFFFFW==WKKKKKW..#',
      '#.WBFFFFBW==WFFFFFW..#',
      '#.WWWDWWWW==WWWDWWW..#',
      '#....===========.....#',
      '##.,......##.....,..##',
      '#....................#',
      '######################',
    ],
    ground: [176, 142, 100],
    path: [205, 180, 140],
    solidEmoji: '🪨',
    decoEmoji: '⚙️',
    spawn: { x: 2, y: 6 },
    buildings: [
      { id: 'cog-workshop', name: "Cog's Workshop", x: 2, y: 19, w: 8, h: 5, roof: 'copper', style: 'brass', sign: 'tools' },
      { id: 'volt-gadgets', name: "Volt's Gadgets", x: 12, y: 19, w: 7, h: 5, roof: 'slate', style: 'brass', sign: 'shop' },
    ],
    npcs: [
      { defId: 'sage-cog', x: 5, y: 21 },
      { defId: 'gearfall-villager', x: 4, y: 9 },
      { defId: 'gearfall-merchant', x: 15, y: 20 },
    ],
    enemies: [
      { defId: 'bolt-mouse', x: 6, y: 4 },
      { defId: 'scrap-golem', x: 8, y: 9 },
      { defId: 'gear-wyrm', x: 14, y: 6 },
      { defId: 'rust-fiend', x: 18, y: 6 },
    ],
    exits: [
      { x: 0, y: 6, to: 'lumina-field', spawnX: 19, spawnY: 6 },
      { x: 0, y: 7, to: 'lumina-field', spawnX: 19, spawnY: 6 },
    ],
    // The Rust Fiend's gate opens to the Mainspring Key (Clockwork Depths, #58).
    keyGate: { x: 10, y: 6 },
  },

  chromaria: {
    id: 'chromaria',
    name: 'Chromaria',
    topic: 'creativity',
    map: [
      '#########EE#################################',
      '#....................#.##.......,...~~~..#.#',
      '#.S...............,..#....,..#.,....~~~..#.#',
      '#...##..........##...#.................,...#',
      '#..................=======================.#',
      '#......,...........=======================.#',
      '#....................#...........=.........#',
      '###########GG#########,.WWWWWWWWW=WWWWWWW..#',
      '#....................#..WTFFFFFTW=WBFFFBW..#',
      '#...,...........,....##.WFFFFFFFW=WKKKKKW#.#',
      '#..........~~........#..WBFFFFFBW=WFFFFFW..#',
      '#....................#..WWWWDWWWW=WWWDWWW..#',
      '#..............C.....#=====================#',
      '############################################',
    ],
    ground: [172, 122, 168],
    path: [206, 162, 200],
    solidEmoji: '🗿',
    decoEmoji: '🌸',
    spawn: { x: 10, y: 2 },
    buildings: [
      { id: 'muse-atelier', name: "Muse's Atelier", x: 24, y: 7, w: 9, h: 5, roof: 'pink', style: 'paint', sign: 'sage' },
      { id: 'swirl-studio', name: "Swirl's Paint & Charms", x: 34, y: 7, w: 7, h: 5, roof: 'teal', style: 'paint', sign: 'shop' },
    ],
    npcs: [
      { defId: 'sage-muse', x: 28, y: 9 },
      { defId: 'chromaria-villager', x: 16, y: 5 },
      { defId: 'chromaria-merchant', x: 37, y: 8 },
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
    // A two-by-two-screen market town (#72): the camera scrolls with the hero.
    // Four enterable buildings — Clove's Curios (NW), the Sleepy Sheep Inn
    // (NE, the world's only inn), the Lantern Workshop (SW) and Grandmother
    // Wick's house (SE) — around a plaza with the save crystal.
    map: [
      '#####################EE#####################',
      '#....................==....................#',
      '#.#..................==....................#',
      '#...WWWWWWWWW..##....==....##..WWWWWWWWW...#',
      '#...WBBFFFBBW..#....,==,....#..WZFZFZFZW...#',
      '#...WFFFFFFFW........==........WFFFFFFFW...#',
      '#...WKKKKKKKW........==........WFFFFFFFW...#',
      '#...WFTFFFTFW........==........WTFFFFFTW...#',
      '#...WFFFFFFFW...#...,==,.......WFFFFFFFW...#',
      '#...WWWWDWWWW........==.....#..WWWWDWWWW...#',
      '#.#.....=........==========........=.....#.#',
      '#.#..,,.=...,....=S========...,,...=..,..#.#',
      '#.......=........==========........=.......#',
      'E==========================================E',
      'E==========================================E',
      '#..............,.=======~~=.,..............#',
      '#.....,....,.....=======~~=.........,..,...#',
      '#.#..............==========................#',
      '#...WWWWWWWWWWW......==.......WWWWWWWWW....#',
      '#...WTFFFFFFFTW......==.......WZFFFFBBW....#',
      '#...WFFFFFFFFFW.##...==...##..WFFFFFFFW..#.#',
      '#...WFTTFFFTTFW......==.......WFFTTFFFW..#.#',
      '#...WFFFFFFFFFW....#.==.#.....WFFFFFFFW....#',
      '#...WBFFFFFFFBW...,..==..,....WFFFFFFFW....#',
      '#...WFFFFFFFFFW......==.......WWWWDWWWW....#',
      '#...WWWWWDWWWWW......==...........=........#',
      '#.========================================.#',
      '###EE################EE#####################',
    ],
    ground: [120, 160, 110],
    path: [196, 178, 128],
    solidEmoji: '🌳',
    decoEmoji: '🌷',
    spawn: { x: 21, y: 2 },
    buildings: [
      { id: 'village-shop', name: "Clove's Curios", x: 4, y: 3, w: 9, h: 7, roof: 'red', style: 'timber', sign: 'shop' },
      { id: 'village-inn', name: 'Sleepy Sheep Inn', x: 31, y: 3, w: 9, h: 7, roof: 'blue', style: 'timber', sign: 'inn' },
      { id: 'lantern-workshop', name: 'Lantern Workshop', x: 4, y: 18, w: 11, h: 8, roof: 'purple', style: 'timber', sign: 'tools' },
      { id: 'wick-house', name: "Wick's House", x: 30, y: 18, w: 9, h: 7, roof: 'green', style: 'timber', sign: 'house' },
    ],
    npcs: [
      { defId: 'village-shopkeeper', x: 8, y: 5 },
      { defId: 'hub-innkeeper', x: 36, y: 6 },
      { defId: 'village-elder', x: 35, y: 22 },
      { defId: 'village-friend', x: 19, y: 15 },
      { defId: 'village-keeper', x: 9, y: 21 },
    ],
    enemies: [],
    exits: [
      { x: 21, y: 0, to: 'lumina-field', spawnX: 3, spawnY: 1 },
      { x: 22, y: 0, to: 'lumina-field', spawnX: 3, spawnY: 1 },
      { x: 0, y: 13, to: 'whispering-woods', spawnX: 20, spawnY: 6 },
      { x: 0, y: 14, to: 'whispering-woods', spawnX: 20, spawnY: 6 },
      { x: 43, y: 13, to: 'starfall-coast', spawnX: 1, spawnY: 6 },
      { x: 43, y: 14, to: 'starfall-coast', spawnX: 1, spawnY: 6 },
      // Hidden grove tucked away in the town's south-west corner (#grove).
      { x: 3, y: 27, to: 'moonwell-grove', spawnX: 10, spawnY: 2 },
      { x: 4, y: 27, to: 'moonwell-grove', spawnX: 10, spawnY: 2 },
      { x: 21, y: 27, to: 'crystal-spire', spawnX: 10, spawnY: 2 },
      { x: 22, y: 27, to: 'crystal-spire', spawnX: 10, spawnY: 2 },
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
      '#.......G.WWWWWW.....E',
      '#.......#.WZFFBW.....#',
      '#.......#.WFFFFW.....#',
      '#.......#.WTFFFW.....#',
      '#...,...#.WWDWWW.....#',
      '#.......#............#',
      '##########EE##########',
    ],
    ground: [70, 110, 78],
    path: [120, 150, 110],
    solidEmoji: '🌲',
    decoEmoji: '🍂',
    spawn: { x: 20, y: 6 },
    buildings: [
      { id: 'spellwright-hut', name: "Spellwright's Hut", x: 10, y: 7, w: 6, h: 5, roof: 'thatch', style: 'log', sign: 'house' },
    ],
    npcs: [
      { defId: 'woods-hermit', x: 12, y: 9 },
      { defId: 'woods-sprite', x: 17, y: 10 },
      { defId: 'woods-warden-sign', x: 19, y: 5 },
    ],
    enemies: [
      { defId: 'mossback-cub', x: 12, y: 4 },
      { defId: 'thornhare', x: 17, y: 8 },
      { defId: 'grumblebee', x: 16, y: 12 },
      { defId: 'thicket-warden', x: 16, y: 4 },
    ],
    exits: [
      { x: 21, y: 6, to: 'lumina-village', spawnX: 1, spawnY: 13 },
      { x: 21, y: 7, to: 'lumina-village', spawnX: 1, spawnY: 13 },
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
      '#....,WWWWWW....#.C..#',
      '#.....WBFFBW....#....#',
      '#...##WFFFTW....#....#',
      '#.S...WWDWWW....G....#',
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
    buildings: [
      { id: 'vela-observatory', name: "Vela's Observatory", x: 6, y: 1, w: 6, h: 4, roof: 'sea', style: 'driftwood', sign: 'star' },
    ],
    npcs: [
      { defId: 'coast-fisher', x: 5, y: 8 },
      { defId: 'coast-stargazer', x: 8, y: 2 },
      { defId: 'coast-warden-sign', x: 4, y: 6 },
    ],
    enemies: [
      { defId: 'tide-sprite', x: 13, y: 6 },
      { defId: 'meteor-mite', x: 11, y: 5 },
      { defId: 'moon-moth', x: 5, y: 7 },
      { defId: 'tide-colossus', x: 12, y: 3 },
    ],
    exits: [
      { x: 0, y: 6, to: 'lumina-village', spawnX: 42, spawnY: 13 },
      { x: 0, y: 7, to: 'lumina-village', spawnX: 42, spawnY: 13 },
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
      '#..............WWWWWW#',
      '#..##..........WTFFBW#',
      '#..##..........WFFFFW#',
      '#.S............WBFFTW#',
      '#....,.........WWDWWW#',
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
    buildings: [
      { id: 'cricket-tinkery', name: "Cricket's Tinkery", x: 15, y: 1, w: 6, h: 5, roof: 'dusk', style: 'cave', sign: 'tools' },
    ],
    npcs: [
      { defId: 'depths-tinker', x: 17, y: 3 },
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
      { x: 10, y: 0, to: 'whispering-woods', spawnX: 10, spawnY: 12 },
      { x: 11, y: 0, to: 'whispering-woods', spawnX: 10, spawnY: 12 },
    ],
  },

  // A hidden nature-themed side-region off Lumina Village (#grove). A dark
  // Moonwell sits at its heart; a gated south chamber holds the riddle-chest.
  'moonwell-grove': {
    id: 'moonwell-grove',
    name: 'Moonwell Grove',
    topic: 'nature',
    map: [
      '##########EE##########',
      '#....................#',
      '#....................#',
      '#......,......,......#',
      '#.......~~~~~~.......#',
      '#......~~~~~~~~......#',
      '#......~~~~~~~~......#',
      '#.......~~~~~~.......#',
      '#......,......,......#',
      '#....................#',
      '##########GG##########',
      '#.........C..........#',
      '#....................#',
      '######################',
    ],
    ground: [60, 78, 110],
    path: [120, 140, 180],
    solidEmoji: '🌲',
    decoEmoji: '🪻',
    spawn: { x: 10, y: 2 },
    npcs: [
      { defId: 'grove-guardian', x: 6, y: 2 },
      { defId: 'grove-firefly', x: 15, y: 3 },
      { defId: 'grove-otter', x: 6, y: 8 },
    ],
    enemies: [
      { defId: 'mossback-cub', x: 4, y: 9 },
      { defId: 'thornhare', x: 16, y: 8 },
      { defId: 'grumblebee', x: 16, y: 9 },
    ],
    exits: [
      { x: 10, y: 0, to: 'lumina-village', spawnX: 3, spawnY: 26 },
      { x: 11, y: 0, to: 'lumina-village', spawnX: 3, spawnY: 26 },
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
      { x: 10, y: 0, to: 'lumina-village', spawnX: 21, spawnY: 26 },
      { x: 11, y: 0, to: 'lumina-village', spawnX: 21, spawnY: 26 },
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

/** The building whose footprint (walls included) holds this cell, if any. */
export function buildingAt(z: ZoneDef, x: number, y: number): BuildingDef | null {
  return z.buildings?.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) ?? null;
}

/**
 * The building whose *interior* (inside the walls) holds this cell — the hero
 * standing here is "indoors", so that building's roof is cleared.
 */
export function buildingInside(z: ZoneDef, x: number, y: number): BuildingDef | null {
  return (
    z.buildings?.find((b) => x > b.x && x < b.x + b.w - 1 && y > b.y && y < b.y + b.h - 1) ?? null
  );
}

/** A position (pixels) the hero can safely stand on, else the zone spawn. */
export function safeSpawn(z: ZoneDef, pos: { x: number; y: number } | null): { x: number; y: number } {
  const fallback = { x: z.spawn.x * TILE + TILE / 2, y: z.spawn.y * TILE + TILE / 2 };
  if (!pos) return fallback;
  const ch = tileAt(z, Math.floor(pos.x / TILE), Math.floor(pos.y / TILE));
  return WALKABLE_CHARS.has(ch) ? pos : fallback;
}
