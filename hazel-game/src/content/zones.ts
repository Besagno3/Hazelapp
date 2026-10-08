import type { CrystalTopic, Topic } from '../types';
import type { ConsumableId } from './items';
import { crystalFlag, crystalInfo } from './topics';
import { CRYSTAL_TOPIC_IDS } from '../types';
import { tiledRows } from '../lib/tiled';
import dawnreachTmj from './maps/dawnreach.tmj?raw';
import legendTsj from './maps/legend.tsj?raw';

/**
 * Every zone id in Lumina — the single source of truth (Wave 0.3). Adding a
 * zone means adding its id here + its `ZONES` entry below; the compiler
 * enforces both directions (`ZONES` is a `Record<ZoneId, ZoneDef>`), and
 * `types/index.ts` re-exports the derived `ZoneId` so save/battle types stay
 * in sync automatically.
 */
export const ZONE_IDS = [
  // The four crystal regions (once off the old Lumina Field hub; at the corners
  // of Dawnreach since #75 item 8 — Lumina Field itself retired then)
  'numbria',
  'verdara',
  'gearfall',
  'chromaria',
  // Expansion: story / exploration regions — reached across Dawnreach (the overworld) since #75
  'lumina-village',
  'whispering-woods',
  'starfall-coast',
  'clockwork-depths',
  // …and its lower floors, a real dungeon since #75 item 10 (content/dungeons.ts)
  'clockwork-depths-b2',
  'clockwork-depths-b3',
  'moonwell-grove',
  'crystal-spire',
  // Overworld (#75 Phase 1): the home continent + its first roadside place
  'dawnreach',
  'dawn-shrine',
  // Roadside places for the field spells (#75 item 9): two more shrines, and a
  // mine too dark to explore without Glow.
  'wayfarer-shrine',
  'quiet-shrine',
  'echo-mine',
] as const;

export type ZoneId = (typeof ZONE_IDS)[number];

/**
 * The world of Lumina (#37): four crystal regions — FF1's four-regions
 * structure — once off the edges of a hub field, now at the four corners of
 * the Dawnreach overworld with Lumina Village, home, near its heart (#75). Maps are ASCII grids rendered with the
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
 *   'E'  zone exit on a map edge (walkable; must have a matching entry in `exits`)
 *   'H'  hidden passage — drawn exactly like solid scenery, but the hero can
 *        walk through it (wanderers can't, so they never give it away)
 *
 * The overworld (#75 Phase 1) adds:
 *   'P'  a place entrance — a town / cave / shrine icon you walk onto
 *        (walkable; needs an `exits` entry AND a `places` entry)
 *   '^'  mountain (solid) · ':' sand / beach (walkable)
 *
 * Dungeons (#75 item 10) — floors joined by stairs, inside the map:
 *   '>'  stairs down · '<' stairs up (walkable; each needs an `exits` entry
 *        to the floor below / above, landing beside its stairs back)
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
export const STAIRS_CHARS = new Set(['>', '<']);
export const LEGEND_CHARS = new Set(['#', '~', '.', ',', '=', 'S', 'C', 'G', 'E', 'H', 'P', '^', ':', ...BUILDING_CHARS, ...STAIRS_CHARS]);
export const WALKABLE_CHARS = new Set(['.', ',', '=', 'E', 'H', 'P', ':', 'D', 'F', ...STAIRS_CHARS]);

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
 * windows all change: whitewashed cottages (Lumina Field's, unused since it
 * retired in #75 item 8 — kept for future hamlets), plaster-and-timber
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

/** What a secret hands over when it's found (each part optional). */
export interface SecretReward {
  coins?: number;
  items?: Partial<Record<ConsumableId, number>>;
  /** A carried quest item (see QUEST_ITEMS) — side quests ask for these. */
  questItem?: string;
}

/**
 * A hidden secret (village expansion): a stash tucked into scenery, a shelf,
 * a bed or a quiet patch of ground. A faint twinkle gives it away to sharp
 * eyes. On a solid tile the hero finds it by bumping; on a walkable tile, by
 * stepping on it. Found once per save (`secretFlag`, content/secrets.ts).
 */
export interface SecretDef {
  /** Unique across the world. */
  id: string;
  x: number;
  y: number;
  /** Shown when found, e.g. "Tucked behind the barrel: a pouch of coins!" */
  text: string;
  reward: SecretReward;
}

/** Save flag set once a secret is found (lives here so quests needn't import secrets.ts). */
export function secretFlag(id: string): string {
  return `secret:${id}`;
}

/**
 * What kind of place a zone is (#75 Phase 1) — it decides the music and how
 * you move in and out: the overworld fades to and from the places on it,
 * while neighbouring screens slide (`lib/transition.ts` `transitionFor`).
 */
export const ZONE_KINDS = ['overworld', 'town', 'field', 'dungeon', 'shrine'] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

/** Overworld icons (one tile each; the tower is the tall Spire sprite). */
export const PLACE_ICONS = ['town', 'hamlet', 'forest', 'cave', 'shrine', 'coast', 'grove', 'tower', 'city', 'canyon', 'garden', 'pavilion'] as const;
export type PlaceIcon = (typeof PLACE_ICONS)[number];

/** A place on the overworld: a 'P' tile drawn as an icon you walk onto to enter. */
export interface PlaceDef {
  x: number;
  y: number;
  icon: PlaceIcon;
  /** Shown under the icon and on the world map. */
  name: string;
}

/**
 * A bank of the fog of Forgetting (#75): a rectangle of the map nobody can
 * cross until any of `liftedBy`'s flags is set — then it lifts for good.
 */
export interface FogDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Any one of these flags lifts the fog. */
  liftedBy: string[];
  /** What bumping into it says — the reason a kid can repeat out loud. */
  hint: string;
  /**
   * The cell it keeps you from: a place, or a chest you can see but not reach
   * (#75 item 7). Out of reach until the fog lifts, in reach after (zones.test).
   */
  guards: { x: number; y: number };
  /** When it guards a chest: the topic of the chest's question (the overworld has none of its own). */
  chestTopic?: Topic;
  /** The line shown as it lifts. */
  lifted: string;
}

/**
 * A dark place (#75 item 9): the hero sees only a small circle around them,
 * and the `pitch` rectangles can't be crossed at all — until the hero casts
 * the Glow field spell here, which lights the place for good (`litFlag`).
 */
export interface DarknessDef {
  /** Too dark to walk into (like a fog bank) until the place is lit. */
  pitch: { x: number; y: number; w: number; h: number }[];
  /** What bumping into the pitch dark says before Glow is known. */
  hint: string;
  /** The line shown as Glow lights the place. */
  lit: string;
  /** The cell the dark keeps you from — a chest you can't reach without a light (zones.test). */
  guards: { x: number; y: number };
  /**
   * How far the hero sees before Glow (px; default a few steps). A dungeon
   * floor you must cross (#75 item 10) is dim, not pitch black: wide enough
   * to find your way, with only its `pitch` shut until Glow.
   */
  dim?: number;
}

/** A riddle-chest that also holds a quest item (#75 item 13; `QUEST_ITEMS` id). */
export interface KeyChestDef {
  x: number;
  y: number;
  item: string;
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
  /**
   * Only standing here once this story flag is set… (#75 item 8: an NPC can
   * have two placements that hand over, e.g. Elder Lumen on the plaza until
   * he has greeted you, then in the Library.)
   */
  ifFlag?: string;
  /** …or only until it is set. */
  unlessFlag?: string;
}

/** Whether an NPC placement is in the world, given the story flags. */
export function npcPresent(p: Pick<NpcPlacement, 'ifFlag' | 'unlessFlag'>, flags: Record<string, boolean>): boolean {
  if (p.ifFlag && !flags[p.ifFlag]) return false;
  if (p.unlessFlag && flags[p.unlessFlag]) return false;
  return true;
}

/** Set once Elder Lumen has greeted the hero on the plaza (he then keeps the Library). */
export const MET_ELDER = 'met-elder';

export interface EnemyPlacement {
  defId: string;
  x: number;
  y: number;
}

export interface ZoneDef {
  id: ZoneId;
  name: string;
  /** Read as "the …" mid-sentence ("go west to the Whispering Woods") — see lib/wayfinding.ts. */
  the?: boolean;
  kind: ZoneKind;
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
  /** Hidden secrets to find (village expansion) — see `SecretDef`. */
  secrets?: SecretDef[];
  /** Overworld places — every 'P' tile is one (and also has an `exits` entry). */
  places?: PlaceDef[];
  /** Fog banks that block part of the map until a story flag lifts them. */
  fogs?: FogDef[];
  /** A dark place, explored by the light of the Glow field spell (#75 item 9). */
  dark?: DarknessDef;
  /**
   * Key-item chests (#75 item 13): riddle-chests ('C') that hold a quest item
   * as well as the usual coins — the item a side quest asks you to find.
   */
  keyChests?: KeyChestDef[];
  /**
   * Tileset key override (default: the zone id). The Spire's floor maps
   * (#74) borrow the 'crystal-spire' id but draw with `spire-<theme>` sets.
   */
  tileset?: string;
}

/**
 * Home: where a new game starts and where a defeated hero wakes up, healed
 * (#75 item 8: Lumina Village, the hero's home, took over from Lumina Field).
 */
export const HUB_ZONE: ZoneId = 'lumina-village';

/** Dawnreach's terrain, painted in Tiled (#75 roadmap item 5). */
const DAWNREACH_MAP = tiledRows(JSON.parse(dawnreachTmj), JSON.parse(legendTsj), 'dawnreach');

/** Restoring any crystal lifts these — the first fog to go is the first reward you can see. */
export const ANY_CRYSTAL = CRYSTAL_TOPIC_IDS.map((t) => crystalFlag(t));

/**
 * A crystal's own fog pocket (#75 item 7): a small nook you can see into, a
 * treasure chest inside, and one bank of fog in the way that only that crystal
 * lifts. The chest asks a question on the crystal's topic.
 */
function crystalPocket(
  topic: CrystalTopic,
  bank: { x: number; y: number; w: number; h: number },
  chest: { x: number; y: number },
  where: string,
): FogDef {
  return {
    id: `${topic}-fog`,
    ...bank,
    liftedBy: [crystalFlag(topic)],
    hint: `Too foggy to pass! Restore the ${crystalInfo(topic).crystalName} to clear it.`,
    guards: chest,
    chestTopic: topic,
    lifted: `✨ The fog lifts! A treasure chest was hiding ${where}.`,
  };
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  numbria: {
    id: 'numbria',
    name: 'Numbria',
    kind: 'field',
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
      '#################################==#########',
      '#..##...#......##.....#.......,..==.....##.#',
      '##....,.....,......,.......,.....==...,....#',
      '#..========================================#',
      '#..========================================#',
      '#.........,....=.............=.........=...#',
      '#...........WWWWWWWW....WWWWWWWWWW..WWWWWWW#',
      '##########..WZFFFFBW....WBBFFFFBBW..WBFFFBW#',
      '#.,.....##..WFFFFFFW.,..WFFFFFFFFW..WKKKKKW#',
      '#.....,..#..WFTFFFFW.#..WFTTFFTTFW..WFFFFFW#',
      '#........H..WFFFFFFW....WFTTFFTTFW..WTFFFTW#',
      '#........#..WWWDWWWW.,..WFFFFFFFFW..WWWDWWW#',
      '#..,...,.#..............WWWWWDWWWW.....=...#',
      '##.......#.,........#.,............,.......#',
      '##########################..################',
      '#..........................................#',
      '#.............#.........WWWWWWWWW..........#',
      '#..,....................WZFZFZFZW..........#',
      '#.......................WFFFFFFFW.....,....#',
      '#.......................WTFFFFFTW..........#',
      '#.......,...............WFFFFFFFW..........#',
      '#.......................WWWWDWWWW........,.#',
      '#..........................................#',
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
      // South district (village expansion), down the lane from the Counting House.
      { id: 'numbria-school', name: 'Numbria Schoolhouse', x: 24, y: 19, w: 10, h: 7, roof: 'red', style: 'stone', sign: 'star' },
      { id: 'tea-room', name: "Chai's Tea Room", x: 36, y: 19, w: 7, h: 6, roof: 'green', style: 'stone', sign: 'shop' },
      { id: 'sundial-house', name: 'Sundial House', x: 12, y: 19, w: 8, h: 6, roof: 'dusk', style: 'stone', sign: 'house' },
      // Every town has an inn (#75 item 11): rest here and a defeat wakes you here.
      { id: 'numbria-inn', name: 'Square Root Inn', x: 24, y: 29, w: 9, h: 6, roof: 'teal', style: 'stone', sign: 'inn' },
    ],
    npcs: [
      { defId: 'sage-abacus', x: 28, y: 3 },
      { defId: 'numbria-villager', x: 17, y: 9 },
      { defId: 'numbria-merchant', x: 37, y: 2 },
      { defId: 'numbria-tea-merchant', x: 39, y: 20 },
      { defId: 'numbria-teacher', x: 29, y: 21 },
      { defId: 'numbria-kid', x: 20, y: 15 },
      { defId: 'numbria-sundial', x: 10, y: 15 },
      // The innkeeper hears every traveler's tale, and a traveler passing through (#75 item 11).
      { defId: 'numbria-innkeeper', x: 29, y: 32 },
      { defId: 'numbria-traveler', x: 16, y: 31 },
    ],
    secrets: [
      {
        id: 'numbria-school-shelf',
        x: 25,
        y: 20,
        text: "Wedged behind the schoolbooks: a crumpled lesson page about adding!",
        reward: { questItem: 'page-addition' },
      },
      {
        id: 'numbria-hill-nook',
        x: 4,
        y: 23,
        text: 'A hidden hollow in the hills! A lesson page about shapes is pinned under a pebble.',
        reward: { coins: 20, questItem: 'page-shapes' },
      },
      {
        id: 'numbria-pond',
        x: 25,
        y: 9,
        text: 'Coins glitter in the pond — someone has been making wishes. Plus a sealed tin of tea!',
        reward: { coins: 35, items: { tea: 1 } },
      },
    ],
    enemies: [
      { defId: 'sum-slime', x: 17, y: 5 },
      { defId: 'count-bat', x: 14, y: 8 },
      { defId: 'sir-sumsalot', x: 7, y: 6 },
      { defId: 'raven-prince', x: 14, y: 3 },
      { defId: 'kia', x: 39, y: 11 },
      { defId: 'pirate-parrot', x: 8, y: 10 },
      { defId: 'null-fiend', x: 3, y: 6 },
    ],
    exits: [
      // Out onto Dawnreach, beside Numbria's icon in the north-west (#75 item 8).
      { x: 43, y: 6, to: 'dawnreach', spawnX: 11, spawnY: 13 },
      { x: 43, y: 7, to: 'dawnreach', spawnX: 11, spawnY: 13 },
    ],
  },

  verdara: {
    id: 'verdara',
    name: 'Verdara',
    kind: 'field',
    topic: 'science',
    map: [
      '############################################',
      '#....,.......,.......#######################',
      '#.................C..#######################',
      '#...##..........##...#######################',
      '#....................#######################',
      '#..~~................###########,WWWWWWWWW.#',
      '#....................###########.WZFZFZFZW,#',
      '##########GG####################.WFFFFFFFW.#',
      '#....................###########.WTFFFFFTW.#',
      '#...,...........,....##,,,,.,,##.WFFFFFFFW.#',
      '#....................HH,,.,,,,##.WWWWDWWWW.#',
      '#.S..................##,,,,,,,##...........#',
      '#....................###########,..........#',
      '#########==##############################..#',
      '#........==..........##.WWWWWWW..WWWWWWWW..#',
      '#.WWWWWWW==....~~~.#.#..WBFFFBW..WZFFFFBW.##',
      '#.WTFFFTW==.,..~~~.#.#..WKKKKKW..WFFFFFFW.##',
      '#.WFFFFFW==.............WFFFFFW..WFTFFTFW..#',
      '#.WTFFFTW==.............WFTFTFW..WFFFFFFW..#',
      '#.WWWDWWW==..WWWWWWW.#..WWWDWWW..WWWWDWWW#.#',
      '#....=...==..WBFFFBW.#.#...=.WWWWWWW.=.....#',
      '#....======..WKKKKKW.#.....=.WZFFBFW.=...,.#',
      '#...,....==..WFFFFFW.#.,...=.WFTFFFW.=.,...#',
      '#.##.....==..WWWDWWW.#.....=.WWWDWWW.=..,..#',
      '#........=================================.#',
      '#.#.,..#.==..,....,#.#,....................#',
      '#........==.............,......,..,.....,..#',
      '#########EE#################################',
    ],
    ground: [92, 158, 102],
    path: [150, 192, 140],
    solidEmoji: '🌲',
    decoEmoji: '🍄',
    spawn: { x: 10, y: 12 },
    buildings: [
      { id: 'flora-greenhouse', name: "Flora's Greenhouse", x: 2, y: 15, w: 7, h: 5, roof: 'leaf', style: 'leaf', sign: 'sage' },
      { id: 'tadpole-tonics', name: "Tadpole's Tonics", x: 13, y: 19, w: 7, h: 5, roof: 'green', style: 'leaf', sign: 'shop' },
      // East meadow district (village expansion).
      { id: 'sunseed-stand', name: 'Sunseed Stand', x: 24, y: 14, w: 7, h: 6, roof: 'thatch', style: 'leaf', sign: 'shop' },
      { id: 'bee-cottage', name: "Beekeeper's Cottage", x: 33, y: 14, w: 8, h: 6, roof: 'leaf', style: 'leaf', sign: 'house' },
      { id: 'sprout-treehouse', name: "Sprout's Treehouse", x: 29, y: 20, w: 7, h: 4, roof: 'green', style: 'leaf', sign: 'house' },
      // Every town has an inn (#75 item 11): rest here and a defeat wakes you here.
      { id: 'verdara-inn', name: 'Mossy Pillow Inn', x: 33, y: 5, w: 9, h: 6, roof: 'green', style: 'leaf', sign: 'inn' },
    ],
    npcs: [
      { defId: 'sage-flora', x: 5, y: 17 },
      { defId: 'verdara-villager', x: 16, y: 11 },
      { defId: 'verdara-merchant', x: 16, y: 20 },
      { defId: 'verdara-seed-merchant', x: 27, y: 15 },
      { defId: 'verdara-beekeeper', x: 36, y: 17 },
      { defId: 'verdara-kid', x: 30, y: 25 },
      { defId: 'verdara-botanist', x: 40, y: 21 },
      // The innkeeper hears every traveler's tale, and a traveler passing through (#75 item 11).
      { defId: 'verdara-innkeeper', x: 38, y: 8 },
      { defId: 'verdara-traveler', x: 16, y: 17 },
    ],
    secrets: [
      {
        id: 'verdara-queen-bee',
        x: 28,
        y: 10,
        text: 'A hidden glade full of clover — and the runaway Queen Bee, napping on a blossom!',
        reward: { questItem: 'queen-bee' },
      },
      {
        id: 'verdara-treehouse-bed',
        x: 30,
        y: 21,
        text: "Under Sprout's hammock: an emergency snack stash! Sprout says you can share.",
        reward: { items: { snack: 2 } },
      },
      {
        id: 'verdara-lily-pond',
        x: 16,
        y: 15,
        text: 'A frog hops off a lily pad, revealing a tiny bottle and a few coins.',
        reward: { coins: 30, items: { potion: 1 } },
      },
    ],
    enemies: [
      { defId: 'spore-puff', x: 5, y: 9 },
      { defId: 'static-jelly', x: 15, y: 9 },
      { defId: 'comet-crab', x: 6, y: 4 },
      { defId: 'fizzlet', x: 11, y: 11 },
      { defId: 'magnetick', x: 18, y: 9 },
      { defId: 'germinator', x: 16, y: 5 },
      { defId: 'smog-fiend', x: 10, y: 2 },
    ],
    exits: [
      // Out onto Dawnreach, beside Verdara's icon in the south-west (#75 item 8).
      { x: 9, y: 27, to: 'dawnreach', spawnX: 13, spawnY: 47 },
      { x: 10, y: 27, to: 'dawnreach', spawnX: 13, spawnY: 47 },
    ],
    // The Smog Fiend's gate opens to the Thornroot Key (Whispering Woods, #58).
    keyGate: { x: 10, y: 7 },
  },

  gearfall: {
    id: 'gearfall',
    name: 'Gearfall Canyon',
    kind: 'field',
    topic: 'engineering',
    map: [
      '############################################',
      '#....,....#......,...#######################',
      '#.S.......#..........##...,..........#....##',
      '#.........#...##.....##....WWWWWWWWW.H..,.##',
      '#...##....#..........##....WTFFFFFTW.#....##',
      '#.........#..........##.#..WFFFFFFFW.#######',
      'E.........G..........##.#..WBFFFFFBW......##',
      'E.........G..........##....WFFFFFFFW......##',
      '#...##....#...##.....##.,..WFFFFFFFW......##',
      '#.........#..........##....WWWWDWWWW....#.##',
      '#....,....#.......,..##..#.....==.........##',
      '#.........#........C.###.....,.==...#..,..##',
      '#....,....#....,.....##########==###########',
      '####==#########################==###########',
      '#...==..................##.....==.....,..#.#',
      '#...==..,.#...,....#.#......,..==.........##',
      '#...=======================================#',
      '#...=======================================#',
      '#.........==..............=.........=......#',
      '#.WWWWWWWW==WWWWWWW....WWWWWWW..WWWWWWWW...#',
      '#.WTFFFTTW==WBFFFBW....WBFFFBW..WTFFFBBW...#',
      '#.WFFFFFFW==WKKKKKW...,WKKKKKW..WFFFFFFW...#',
      '#.WBFFFFBW==WFFFFFW....WFFFFFW..WFTFFFFW.,.#',
      '#.WWWDWWWW==WWWDWWW....WTFFFTW..WZFFFFFW...#',
      '#....===========.......WWWDWWW..WWWWDWWW...#',
      '##.,......##.....,..##.....................#',
      '#.....................#...,...#,..........##',
      '##############..############################',
      '#..........................................#',
      '#...........WWWWWWWWW................,.....#',
      '#...........WZFZFZFZW.....,................#',
      '#...........WFFFFFFFW......................#',
      '#..,........WTFFFFFTW...................,..#',
      '#...........WFFFFFFFW......................#',
      '#...........WWWWDWWWW..........,...........#',
      '#..........................................#',
      '############################################',
    ],
    ground: [176, 142, 100],
    path: [205, 180, 140],
    solidEmoji: '🪨',
    decoEmoji: '⚙️',
    spawn: { x: 2, y: 6 },
    buildings: [
      { id: 'cog-workshop', name: "Cog's Workshop", x: 2, y: 19, w: 8, h: 5, roof: 'copper', style: 'brass', sign: 'tools' },
      { id: 'volt-gadgets', name: "Volt's Gadgets", x: 12, y: 19, w: 7, h: 5, roof: 'slate', style: 'brass', sign: 'shop' },
      // East district + Clockwork Plaza (village expansion).
      { id: 'coil-spring', name: 'Coil & Spring', x: 23, y: 19, w: 7, h: 6, roof: 'teal', style: 'brass', sign: 'shop' },
      { id: 'inventor-workshop', name: "Sprocket's Workshop", x: 32, y: 19, w: 8, h: 6, roof: 'red', style: 'brass', sign: 'tools' },
      { id: 'clocktower', name: 'Clocktower', x: 27, y: 3, w: 9, h: 7, roof: 'dusk', style: 'brass', sign: 'star' },
      // Every town has an inn (#75 item 11): rest here and a defeat wakes you here.
      { id: 'gearfall-inn', name: 'Wound-Down Inn', x: 12, y: 29, w: 9, h: 6, roof: 'copper', style: 'brass', sign: 'inn' },
    ],
    npcs: [
      { defId: 'sage-cog', x: 5, y: 21 },
      { defId: 'gearfall-villager', x: 4, y: 9 },
      { defId: 'gearfall-merchant', x: 15, y: 20 },
      { defId: 'gearfall-coil-merchant', x: 26, y: 20 },
      { defId: 'gearfall-inventor', x: 35, y: 21 },
      { defId: 'gearfall-clockkeeper', x: 31, y: 5 },
      { defId: 'gearfall-apprentice', x: 34, y: 11 },
      // The innkeeper hears every traveler's tale, and a traveler passing through (#75 item 11).
      { defId: 'gearfall-innkeeper', x: 17, y: 32 },
      { defId: 'gearfall-traveler', x: 30, y: 32 },
    ],
    secrets: [
      {
        id: 'gearfall-gear-crate',
        x: 24,
        y: 5,
        text: 'A loose plate on the crate swings open — a shiny Brass Gear rolls out!',
        reward: { questItem: 'brass-gear' },
      },
      {
        id: 'gearfall-nook-gear',
        x: 40,
        y: 3,
        text: 'A hidden nook behind the canyon wall! A Silver Gear and some coins sit in an old oil tin.',
        reward: { coins: 25, questItem: 'silver-gear' },
      },
      {
        id: 'gearfall-workshop-bed',
        x: 33,
        y: 23,
        text: "Professor Sprocket keeps spare parts under the bed. 'Take some — science should be shared!'",
        reward: { items: { coil: 1, spark: 1 } },
      },
    ],
    enemies: [
      { defId: 'bolt-mouse', x: 6, y: 4 },
      { defId: 'scrap-golem', x: 8, y: 9 },
      { defId: 'gear-wyrm', x: 14, y: 6 },
      { defId: 'pulley-spider', x: 7, y: 2 },
      { defId: 'piston-boar', x: 16, y: 15 },
      { defId: 'ironhorn-rampager', x: 13, y: 10 },
      { defId: 'rust-fiend', x: 18, y: 6 },
    ],
    exits: [
      // Out onto Dawnreach, beside Gearfall's icon in the north-east (#75 item 8).
      { x: 0, y: 6, to: 'dawnreach', spawnX: 67, spawnY: 10 },
      { x: 0, y: 7, to: 'dawnreach', spawnX: 67, spawnY: 10 },
    ],
    // The Rust Fiend's gate opens to the Mainspring Key (Clockwork Depths, #58).
    keyGate: { x: 10, y: 6 },
  },

  chromaria: {
    id: 'chromaria',
    name: 'Chromaria',
    kind: 'field',
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
      '################################==##########',
      '#..........#..........,.........==......,..#',
      '#..========================================#',
      '###########.............WWWWWWW..WWWWWWWWWW#',
      '#,,,,,,,,,#.WWWWWWWW.,..WBFFFBW#.WBFBFFBFBW#',
      '#,,#,,,#,,#.WZFFFFBW....WKKKKKW#.WFFFFFFFFW#',
      '#,,,,,,,,,#.WFFFFFFW.#..WFFFFFW..WFFTFFTFFW#',
      '#,,,.,,,,,H.WFTFFTFW.#..WTFFFTW..WFFFFFFFFW#',
      '#,,,..,,#,#.WFFFFFFW....WWWDWWW..WFFFFFFFFW#',
      '#,,,,.,,,,#.WWWDWWWW.,.....=.....WWWWDWWWWW#',
      '#,#,,,,,,,#....=...........=.........=.....#',
      '#,,,,,#,,,#================================#',
      '#,,,,,,,,,#....................,..........##',
      '#,,,,,,,,,#.,...........................,..#',
      '########################..##################',
      '#..........................................#',
      '#..............,......WWWWWWWWW............#',
      '#.....................WZFZFZFZW.....,......#',
      '#...,.................WFFFFFFFW............#',
      '#.....................WTFFFFFTW............#',
      '#.....................WFFFFFFFW.........#..#',
      '#........#............WWWWDWWWW............#',
      '#..........................................#',
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
      // South district (village expansion), down the lane from the street.
      { id: 'mirror-hall', name: 'Mirror Hall', x: 24, y: 16, w: 7, h: 6, roof: 'purple', style: 'paint', sign: 'shop' },
      { id: 'grand-gallery', name: 'Grand Gallery', x: 33, y: 16, w: 10, h: 7, roof: 'red', style: 'paint', sign: 'star' },
      { id: 'music-house', name: 'Music House', x: 12, y: 17, w: 8, h: 6, roof: 'blue', style: 'paint', sign: 'house' },
      // Every town has an inn (#75 item 11): rest here and a defeat wakes you here.
      { id: 'chromaria-inn', name: 'Rainbow Quilt Inn', x: 22, y: 29, w: 9, h: 6, roof: 'pink', style: 'paint', sign: 'inn' },
    ],
    npcs: [
      { defId: 'sage-muse', x: 28, y: 9 },
      { defId: 'chromaria-villager', x: 16, y: 5 },
      { defId: 'chromaria-merchant', x: 37, y: 8 },
      { defId: 'chromaria-mirror-merchant', x: 27, y: 17 },
      { defId: 'chromaria-curator', x: 37, y: 18 },
      { defId: 'chromaria-musician', x: 16, y: 19 },
      { defId: 'chromaria-kid', x: 20, y: 25 },
      // The innkeeper hears every traveler's tale, and a traveler passing through (#75 item 11).
      { defId: 'chromaria-innkeeper', x: 27, y: 32 },
      { defId: 'chromaria-traveler', x: 12, y: 31 },
    ],
    secrets: [
      {
        id: 'chromaria-lost-painting',
        x: 4,
        y: 21,
        text: 'A secret sculpture garden! Leaning on a statue: the missing masterpiece, "Sunrise in Seven Colours".',
        reward: { questItem: 'lost-painting' },
      },
      {
        id: 'chromaria-mirror-table',
        x: 25,
        y: 20,
        text: 'One hand mirror on the display table shows a different room… reach in and find a Mirror Charm and some coins!',
        reward: { coins: 20, items: { mirror: 1 } },
      },
      {
        id: 'chromaria-pond',
        x: 37,
        y: 2,
        text: 'The rainbow pond shimmers — a Rainbow Ward and a handful of coins sparkle under the water.',
        reward: { coins: 40, items: { ward: 1 } },
      },
    ],
    enemies: [
      { defId: 'doodle-imp', x: 6, y: 5 },
      { defId: 'off-key-bird', x: 15, y: 4 },
      { defId: 'pixel-witch', x: 10, y: 9 },
      { defId: 'flicker-goblin', x: 17, y: 1 },
      { defId: 'graffiti-gargoyle', x: 40, y: 6 },
      { defId: 'dog-knight', x: 17, y: 9 },
      { defId: 'gray-fiend', x: 10, y: 11 },
    ],
    exits: [
      // Out onto Dawnreach, beside Chromaria's icon in the south-east (#75 item 8).
      { x: 9, y: 0, to: 'dawnreach', spawnX: 66, spawnY: 45 },
      { x: 10, y: 0, to: 'dawnreach', spawnX: 66, spawnY: 45 },
    ],
    // The Gray Fiend's gate opens to the Starlight Prism (Starfall Coast, #58).
    keyGate: { x: 11, y: 7 },
  },

  // --- Expansion: the homeward regions (story zones, no topic) ----------------
  // These are exploration screens around the village (on Dawnreach since #75) — no fiends,
  // gates, or chests (those need a topic). They carry the expanded narrative.

  'lumina-village': {
    id: 'lumina-village',
    name: 'Lumina Village',
    kind: 'town',
    // The hero's home (HUB_ZONE): a four-by-two-screen market town (#72, grown
    // east twice); the camera scrolls with the hero. West: Clove's Curios, the
    // Sleepy Sheep Inn (home's inn — every town has one since #75 item 11), the Lantern Workshop and
    // Grandmother Wick's house around the plaza and fountain. Middle: the Town
    // Hall, Clover's Market, Dot's Bakery, Nib's house and a hedge garden
    // reached only through a hidden gap (H) in its west hedge. Far east (#75
    // item 8, from the retired Lumina Field): the Lumina Library, Maple's
    // Trading Post, Elder Lumen and Pip, by a pond.
    map: [
      '#####################EE#################################################################',
      '#....................==.....................,............,.....,.......,..........,....#',
      '#.#..................==....................#.WWWWWWWWWWW##.......#.WWWWWWWWW.WWWWWWWWW.#',
      '#...WWWWWWWWW..##....==....##..WWWWWWWWW...#.WBBFFFFFBBW..WWWWWWW#.WBBBFBBBW.WBBFFFBBW.#',
      '#...WBBFFFBBW..#....,==,....#..WZFZFZFZW.....WFFFFFFFFFW..WBFFFBW#.WFFFFFFFW.WFFFFFFFW.#',
      '#...WFFFFFFFW........==........WFFFFFFFW.....WFTFFFFFTFW..WFFFFFW#.WBFFFFFBW.WKKKKKKKW.#',
      '#...WKKKKKKKW........==........WFFFFFFFW.....WFFFFFFFFFW..WKKKKKW#.WFTFFFTFW.WFTFFFTFW.#',
      '#...WFTFFFTFW........==........WTFFFFFTW....#WFFFFFFFFFW..WFFFFFW#.WFFFFFFFW.WFFFFFFFW.#',
      '#...WFFFFFFFW...#...,==,.......WFFFFFFFW.....WBFFFFFFFBW..WFFFFFW#.WWWWDWWWW.WWWWDWWWW.#',
      '#...WWWWDWWWW........==.....#..WWWWDWWWW...#.WWWWWDWWWWW..WWWDWWW#.....=.........=.....#',
      '#.#.....=........==========........=.....#.#......=..........=......,..=.........=..,..#',
      '#.#..,,.=...,....=S========...,,...=..,..#.....,..=.....,....=.........=....,....=.....#',
      '#.......=........==========........=..............=..........=.........=.........=.....#',
      'E======================================================================================E',
      'E======================================================================================E',
      '#..............,.=======~~=.,....................=....,....=....,......,..........,....#',
      '#.....,....,.....=======~~=.........,..,.....WWWWWWWWW..WWWWWWWW.#..,..................#',
      '#.#..............==========..................WTFFFFFTW..WZFFFFBW.#...~~~.........,.....#',
      '#...WWWWWWWWWWW......==.......WWWWWWWWW....#.WFFFFFFFW..WFFFFFFW.#..~~~~~.......##.....#',
      '#...WTFFFFFFFTW......==.......WZFFFFBBW....#.WKKKKKKKW..WFFTTFFW.#...~~~........##..,..#',
      '#...WFFFFFFFFFW.##...==...##..WFFFFFFFW..#..,WFFFFFFFW..WFFFFFFW.#.,...................#',
      '#...WFTTFFFTTFW......==.......WFFTTFFFW..#...WFBFFFBFW..WWWDWWWW.#.......,......,......#',
      '#...WFFFFFFFFFW....#.==.#.....WFFFFFFFW......WWWWDWWWW.....=.....#...,.................#',
      '#...WBFFFFFFFBW...,..==..,....WFFFFFFFW....#.....=......##########..........##.....,...#',
      '#...WFFFFFFFFFW......==.......WWWWDWWWW......,...=..,.#.#,,,,,,,,#..,.......##.........#',
      '#...WWWWWDWWWWW......==...........=..............=...#..H,,,..,,,#.....,...........,...#',
      '#.=====================================================.#,,,,,,,,#.....................#',
      '###EE################EE#################################################################',
    ],
    ground: [120, 160, 110],
    path: [196, 178, 128],
    solidEmoji: '🌳',
    decoEmoji: '🌷',
    // Home: a new game starts on the plaza, and a defeated hero wakes here.
    spawn: { x: 21, y: 12 },
    buildings: [
      { id: 'village-shop', name: "Clove's Curios", x: 4, y: 3, w: 9, h: 7, roof: 'red', style: 'timber', sign: 'shop' },
      { id: 'village-inn', name: 'Sleepy Sheep Inn', x: 31, y: 3, w: 9, h: 7, roof: 'blue', style: 'timber', sign: 'inn' },
      { id: 'lantern-workshop', name: 'Lantern Workshop', x: 4, y: 18, w: 11, h: 8, roof: 'purple', style: 'timber', sign: 'tools' },
      { id: 'wick-house', name: "Wick's House", x: 30, y: 18, w: 9, h: 7, roof: 'green', style: 'timber', sign: 'house' },
      { id: 'town-hall', name: 'Town Hall', x: 45, y: 2, w: 11, h: 8, roof: 'slate', style: 'timber', sign: 'star' },
      { id: 'clover-market', name: "Clover's Market", x: 58, y: 3, w: 7, h: 7, roof: 'leaf', style: 'timber', sign: 'shop' },
      { id: 'dot-bakery', name: "Dot's Bakery", x: 45, y: 16, w: 9, h: 7, roof: 'thatch', style: 'timber', sign: 'shop' },
      { id: 'nib-house', name: "Nib's House", x: 56, y: 16, w: 8, h: 6, roof: 'pink', style: 'timber', sign: 'house' },
      // Moved in from Lumina Field when it stopped being a hub (#75 item 8).
      { id: 'lumina-library', name: 'Lumina Library', x: 67, y: 2, w: 9, h: 7, roof: 'dusk', style: 'timber', sign: 'library' },
      { id: 'trading-post', name: "Maple's Trading Post", x: 77, y: 2, w: 9, h: 7, roof: 'copper', style: 'timber', sign: 'shop' },
    ],
    npcs: [
      { defId: 'village-shopkeeper', x: 8, y: 5 },
      { defId: 'hub-innkeeper', x: 36, y: 6 },
      { defId: 'village-elder', x: 35, y: 22 },
      { defId: 'village-friend', x: 19, y: 15 },
      { defId: 'village-keeper', x: 9, y: 21 },
      { defId: 'village-mayor', x: 50, y: 4 },
      { defId: 'village-clover-merchant', x: 61, y: 5 },
      { defId: 'village-baker', x: 49, y: 18 },
      { defId: 'village-guard', x: 54, y: 11 },
      { defId: 'village-kid', x: 51, y: 24 },
      // From Lumina Field (#75 item 8): Elder Lumen greets a new hero on the
      // plaza, then keeps the Library with the Librarian (giving tips on what
      // to do next); Maple at work in her shop; Pip out on the green.
      { defId: 'elder-lumen', x: 23, y: 11, unlessFlag: MET_ELDER },
      { defId: 'elder-lumen', x: 69, y: 5, ifFlag: MET_ELDER },
      { defId: 'hub-librarian', x: 71, y: 4 },
      { defId: 'hub-merchant', x: 81, y: 4 },
      { defId: 'hub-kid', x: 76, y: 20 },
    ],
    secrets: [
      {
        id: 'village-fountain-seal',
        x: 24,
        y: 15,
        text: 'Something glints at the bottom of the fountain… the Mayor\'s golden Town Seal!',
        reward: { questItem: 'town-seal' },
      },
      {
        id: 'village-hall-shelf',
        x: 54,
        y: 3,
        text: 'A hollow book on the Town Hall shelf hides two Hint Feathers.',
        reward: { items: { hint: 2 } },
      },
      {
        id: 'village-secret-garden',
        x: 63,
        y: 25,
        text: 'In the hidden garden, a four-leaf clover grows beside a forgotten coin jar!',
        reward: { coins: 40, items: { clover: 1 } },
      },
    ],
    enemies: [],
    exits: [
      // Every gate leads out onto Dawnreach (#75 Phase 1), beside the
      // Village's icon on the side you left by.
      { x: 21, y: 0, to: 'dawnreach', spawnX: 40, spawnY: 29 },
      { x: 22, y: 0, to: 'dawnreach', spawnX: 40, spawnY: 29 },
      { x: 0, y: 13, to: 'dawnreach', spawnX: 39, spawnY: 30 },
      { x: 0, y: 14, to: 'dawnreach', spawnX: 39, spawnY: 30 },
      { x: 87, y: 13, to: 'dawnreach', spawnX: 41, spawnY: 30 },
      { x: 87, y: 14, to: 'dawnreach', spawnX: 41, spawnY: 30 },
      { x: 3, y: 27, to: 'dawnreach', spawnX: 39, spawnY: 31 },
      { x: 4, y: 27, to: 'dawnreach', spawnX: 39, spawnY: 31 },
      { x: 21, y: 27, to: 'dawnreach', spawnX: 40, spawnY: 31 },
      { x: 22, y: 27, to: 'dawnreach', spawnX: 40, spawnY: 31 },
    ],
  },

  'whispering-woods': {
    id: 'whispering-woods',
    name: 'Whispering Woods',
    the: true,
    kind: 'field',
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
      { defId: 'dart-frog', x: 11, y: 2 },
      { defId: 'snapjaw', x: 19, y: 10 },
      { defId: 'oak-owl', x: 5, y: 4 },
      { defId: 'thicket-warden', x: 16, y: 4 },
    ],
    exits: [
      // Out onto Dawnreach beside the Woods' icon (#75 Phase 1). The Depths
      // are their own cave now, a little way south.
      { x: 21, y: 6, to: 'dawnreach', spawnX: 26, spawnY: 30 },
      { x: 21, y: 7, to: 'dawnreach', spawnX: 26, spawnY: 30 },
      { x: 10, y: 13, to: 'dawnreach', spawnX: 26, spawnY: 31 },
      { x: 11, y: 13, to: 'dawnreach', spawnX: 26, spawnY: 31 },
    ],
  },

  'starfall-coast': {
    id: 'starfall-coast',
    name: 'Starfall Coast',
    kind: 'field',
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
      { defId: 'orbit-otter', x: 2, y: 2 },
      { defId: 'gravity-beetle', x: 14, y: 2 },
      { defId: 'eclipse-fox', x: 19, y: 5 },
      { defId: 'tide-colossus', x: 12, y: 3 },
    ],
    exits: [
      { x: 0, y: 6, to: 'dawnreach', spawnX: 62, spawnY: 30 },
      { x: 0, y: 7, to: 'dawnreach', spawnX: 62, spawnY: 30 },
    ],
  },

  'clockwork-depths': {
    id: 'clockwork-depths',
    name: 'Clockwork Depths',
    the: true,
    kind: 'dungeon',
    topic: 'history',
    // B1 of a three-floor dungeon (#75 item 10). A gated vault (the bottom
    // half, behind the row-8 wall) holds the chest and the stairs down; old-
    // machine critters wind through the open upper galleries. Unchanged but for
    // the stairs, so every chest, gate and save position still matches.
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
      '#..##..........##..>.#',
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
    ],
    enemies: [
      { defId: 'cog-sprite', x: 6, y: 5 },
      { defId: 'hourglass-imp', x: 14, y: 6 },
      { defId: 'relic-golem', x: 8, y: 2 },
      { defId: 'tut-tut', x: 3, y: 7 },
    ],
    exits: [
      // Up out of the cave mouth onto Dawnreach (#75 Phase 1).
      { x: 10, y: 0, to: 'dawnreach', spawnX: 21, spawnY: 42 },
      { x: 11, y: 0, to: 'dawnreach', spawnX: 21, spawnY: 42 },
      // Down the stairs in the vault (#75 item 10).
      { x: 19, y: 10, to: 'clockwork-depths-b2', spawnX: 3, spawnY: 2 },
    ],
  },

  // B2 of the Clockwork Depths (#75 item 10): great halls of stopped gears, two
  // screens deep. Dim — the hero sees a good way around them — and a side
  // vault the old lamps never reached stays pitch dark until Glow.
  'clockwork-depths-b2': {
    id: 'clockwork-depths-b2',
    name: 'The Gear Halls',
    kind: 'dungeon',
    topic: 'history',
    map: [
      '######################',
      '#....................#',
      '#.<..##........##....#',
      '#........S...........#',
      '#....................#',
      '##=.##################',
      '##=.##################',
      '##=.############....,#',
      '##=.############...C.#',
      '##=.############.....#',
      '##=.############.,...#',
      '##=.############.....#',
      '##=.#############..###',
      '#....................#',
      '#.....##....##.......#',
      '#..,............,....#',
      '#.....##....##.......#',
      '#....................#',
      '#################.=###',
      '#################.=###',
      '#################.=###',
      '#################.=###',
      '#################.=###',
      '#################.=###',
      '#..............,.....#',
      '#===,=====>========..#',
      '#....................#',
      '######################',
    ],
    ground: [78, 72, 98],
    path: [124, 114, 140],
    solidEmoji: '⚙️',
    decoEmoji: '⏳',
    spawn: { x: 3, y: 3 },
    npcs: [],
    enemies: [
      { defId: 'knight-mare', x: 9, y: 15 },
      { defId: 'cog-sprite', x: 14, y: 3 },
    ],
    exits: [
      { x: 2, y: 2, to: 'clockwork-depths', spawnX: 18, spawnY: 10 },
      { x: 10, y: 25, to: 'clockwork-depths-b3', spawnX: 3, spawnY: 2 },
    ],
    dark: {
      pitch: [{ x: 16, y: 7, w: 5, h: 6 }],
      dim: 160,
      hint: "That side hall is pitch dark — the old lamps never reached it. A Glow spell would light the way.",
      lit: '🔆 Glow! Lamps flicker on all along the Gear Halls — even in the dark side hall.',
      guards: { x: 19, y: 8 },
    },
  },

  // B3, the bottom of the Clockwork Depths (#75 item 10): the forge where the
  // Clockwork Titan still turns, guarding the Gearwright Key and the Depths'
  // old hoard. A save crystal waits in the antechamber.
  'clockwork-depths-b3': {
    id: 'clockwork-depths-b3',
    name: "The Titan's Forge",
    kind: 'dungeon',
    topic: 'history',
    map: [
      '######################',
      '#......##............#',
      '#.<........#......#..#',
      '#....S...............#',
      '#......##............#',
      '#########...........,#',
      '#########............#',
      '#########..#......#..#',
      '#########............#',
      '##############..######',
      '##############..######',
      '###########.,......###',
      '###########.....,C.###',
      '######################',
    ],
    ground: [104, 78, 70],
    path: [150, 112, 88],
    solidEmoji: '⚙️',
    decoEmoji: '🔥',
    spawn: { x: 3, y: 3 },
    npcs: [{ defId: 'depths-warden-sign', x: 4, y: 2 }],
    enemies: [{ defId: 'clockwork-titan', x: 14, y: 8 }],
    exits: [{ x: 2, y: 2, to: 'clockwork-depths-b2', spawnX: 11, spawnY: 25 }],
  },

  // A hidden nature-themed side-region off Lumina Village (#grove). A dark
  // Moonwell sits at its heart; a gated south chamber holds the riddle-chest.
  'moonwell-grove': {
    id: 'moonwell-grove',
    name: 'Moonwell Grove',
    kind: 'field',
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
      // Back out through the gap in the trees (#75 Phase 1).
      { x: 10, y: 0, to: 'dawnreach', spawnX: 28, spawnY: 46 },
      { x: 11, y: 0, to: 'dawnreach', spawnX: 28, spawnY: 46 },
    ],
  },

  'crystal-spire': {
    id: 'crystal-spire',
    name: 'The Crystal Spire',
    kind: 'field',
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
      { x: 10, y: 0, to: 'dawnreach', spawnX: 40, spawnY: 44 },
      { x: 11, y: 0, to: 'dawnreach', spawnX: 40, spawnY: 44 },
    ],
    // The Spire itself stands in the central shrine — the endgame entrance.
    spire: { x: 10, y: 6 },
  },

  // --- The overworld (#75 Phase 1) --------------------------------------------
  // Dawnreach, the home continent — a 64×48 slice around Lumina Village. Every
  // place is an icon ('P') you walk onto; leaving a place puts you back beside
  // its icon. Roads link the Village to the Field (north), the Woods (west),
  // the Coast (east) and the Spire's plateau (south), with a branch to the
  // Clockwork Depths cave; the Grove hides in a ring of trees (find the gap);
  // the Shrine of First Light waits behind fog that lifts with the first
  // restored crystal. Painted by a script, kept as plain ASCII.
  dawnreach: {
    id: 'dawnreach',
    name: 'Dawnreach',
    kind: 'overworld',
    // Painted in Tiled (#75 item 5): src/content/maps/dawnreach.tmj — see
    // docs/MAP-AUTHORING.md. Turned into the usual rows when the game loads.
    map: DAWNREACH_MAP,
    ground: [104, 168, 104],
    path: [196, 178, 128],
    solidEmoji: '🌳',
    decoEmoji: '🌼',
    spawn: { x: 40, y: 29 },
    places: [
      { x: 40, y: 30, icon: 'town', name: 'Lumina Village' },
      { x: 25, y: 30, icon: 'forest', name: 'Whispering Woods' },
      { x: 20, y: 42, icon: 'cave', name: 'Clockwork Depths' },
      { x: 30, y: 46, icon: 'grove', name: 'Moonwell Grove' },
      { x: 40, y: 45, icon: 'tower', name: 'The Crystal Spire' },
      { x: 63, y: 30, icon: 'coast', name: 'Starfall Coast' },
      { x: 57, y: 15, icon: 'shrine', name: 'Shrine of First Light' },
      // The four crystal regions, one at each corner of the land (#75 item 8).
      { x: 10, y: 13, icon: 'city', name: 'Numbria' },
      { x: 68, y: 10, icon: 'canyon', name: 'Gearfall Canyon' },
      { x: 12, y: 47, icon: 'garden', name: 'Verdara' },
      { x: 66, y: 46, icon: 'pavilion', name: 'Chromaria' },
      // Where the field spells are learned — and needed (#75 item 9).
      { x: 34, y: 18, icon: 'shrine', name: "Wayfarer's Shrine" },
      { x: 50, y: 39, icon: 'shrine', name: 'Shrine of Quiet Paws' },
      { x: 57, y: 20, icon: 'cave', name: 'Echo Mine' },
    ],
    exits: [
      { x: 40, y: 30, to: 'lumina-village', spawnX: 21, spawnY: 1 },
      { x: 25, y: 30, to: 'whispering-woods', spawnX: 20, spawnY: 6 },
      { x: 20, y: 42, to: 'clockwork-depths', spawnX: 10, spawnY: 2 },
      { x: 30, y: 46, to: 'moonwell-grove', spawnX: 10, spawnY: 2 },
      { x: 40, y: 45, to: 'crystal-spire', spawnX: 10, spawnY: 2 },
      { x: 63, y: 30, to: 'starfall-coast', spawnX: 1, spawnY: 6 },
      { x: 57, y: 15, to: 'dawn-shrine', spawnX: 10, spawnY: 11 },
      { x: 10, y: 13, to: 'numbria', spawnX: 42, spawnY: 6 },
      { x: 68, y: 10, to: 'gearfall', spawnX: 2, spawnY: 6 },
      { x: 12, y: 47, to: 'verdara', spawnX: 10, spawnY: 26 },
      { x: 66, y: 46, to: 'chromaria', spawnX: 10, spawnY: 2 },
      { x: 34, y: 18, to: 'wayfarer-shrine', spawnX: 10, spawnY: 11 },
      { x: 50, y: 39, to: 'quiet-shrine', spawnX: 10, spawnY: 11 },
      { x: 57, y: 20, to: 'echo-mine', spawnX: 11, spawnY: 11 },
    ],
    // Fog of Forgetting (#75 item 7): the first crystal clears the way to the
    // shrine and the Spire grounds; each crystal also clears its own pocket.
    fogs: [
      {
        id: 'shrine-fog',
        x: 52,
        y: 17,
        w: 3,
        h: 3,
        liftedBy: ANY_CRYSTAL,
        hint: 'Too foggy to pass! Restore a crystal to clear it.',
        guards: { x: 57, y: 15 },
        lifted: '✨ The fog lifts! The path to the Shrine of First Light is open.',
      },
      {
        id: 'spire-fog',
        x: 37,
        y: 42,
        w: 7,
        h: 6,
        liftedBy: ANY_CRYSTAL,
        hint: 'The fog hides the Spire grounds. Restore a crystal to clear it.',
        guards: { x: 40, y: 45 },
        lifted: '✨ The fog around the Crystal Spire is gone!',
      },
      // Each crystal's pocket sits near its own region (#75 item 8).
      crystalPocket('math', { x: 20, y: 17, w: 3, h: 2 }, { x: 21, y: 15 }, 'in the hills by Numbria'),
      crystalPocket('science', { x: 17, y: 51, w: 3, h: 2 }, { x: 18, y: 49 }, 'in the trees by Verdara'),
      crystalPocket('engineering', { x: 69, y: 16, w: 3, h: 2 }, { x: 70, y: 14 }, 'in the cliffs of Gearfall Canyon'),
      crystalPocket('creativity', { x: 55, y: 45, w: 3, h: 2 }, { x: 56, y: 43 }, 'in the little grove by Chromaria'),
    ],
    npcs: [
      { defId: 'dawnreach-scout', x: 42, y: 28 },
      // Signposts at the two crossroads on the long east–west road (#75 item 6).
      { defId: 'dawnreach-sign-west', x: 32, y: 29 },
      { defId: 'dawnreach-sign-east', x: 44, y: 31 },
      // …and where the roads fork for the corners (#75 item 8).
      { defId: 'dawnreach-sign-north', x: 41, y: 14 },
      { defId: 'dawnreach-sign-fork', x: 61, y: 31 },
      // Hermit Moss, on the hill beside the Echo Mine (#75 item 13).
      { defId: 'dawnreach-hermit', x: 61, y: 20 },
    ],
    enemies: [
      { defId: 'thornhare', x: 30, y: 25 },
      { defId: 'mossback-cub', x: 35, y: 34 },
      { defId: 'grumblebee', x: 27, y: 39 },
      { defId: 'tide-sprite', x: 56, y: 35 },
      { defId: 'meteor-mite', x: 53, y: 25 },
      // A critter from each region roams near it (#75 item 8).
      { defId: 'sum-slime', x: 16, y: 16 },
      { defId: 'bolt-mouse', x: 67, y: 19 },
      { defId: 'spore-puff', x: 8, y: 52 },
      { defId: 'doodle-imp', x: 63, y: 51 },
    ],
  },

  // A small, quiet shrine behind the fog in Dawnreach's north-east. Old Wren
  // has kept one candle lit here since the fog came. (#75 Phase 1)
  'dawn-shrine': {
    id: 'dawn-shrine',
    name: 'Shrine of First Light',
    the: true,
    kind: 'shrine',
    map: [
      '######################',
      '#,..................,#',
      '#..##....~~~~....##..#',
      '#..##....~~~~....##..#',
      '#........~~~~........#',
      '#,........==........,#',
      '#.........==.........#',
      '#.##......==......##.#',
      '#.##......==......##.#',
      '#.........==.........#',
      '#,........==........,#',
      '#....S....==.........#',
      '#.........==.........#',
      '##########EE##########',
    ],
    ground: [196, 188, 170],
    path: [190, 90, 80],
    solidEmoji: '🏛️',
    decoEmoji: '🕯️',
    spawn: { x: 10, y: 11 },
    npcs: [{ defId: 'shrine-keeper', x: 13, y: 5 }],
    enemies: [],
    exits: [
      { x: 10, y: 13, to: 'dawnreach', spawnX: 57, spawnY: 16 },
      { x: 11, y: 13, to: 'dawnreach', spawnX: 57, spawnY: 16 },
    ],
  },

  // A starlit shrine just north-west of the village, open from the start: its
  // keeper teaches Return, so the long roads are only walked once (#75 item 9).
  'wayfarer-shrine': {
    id: 'wayfarer-shrine',
    name: "Wayfarer's Shrine",
    kind: 'shrine',
    map: [
      '######################',
      '#,.....,......,.....,#',
      '#...##..........##...#',
      '#..#....~~~~~~....#..#',
      '#..#...~~~~~~~~...#..#',
      '#......~~~~~~~~......#',
      '#.......~~~~~~.......#',
      '#,........==........,#',
      '#..##.....==.....##..#',
      '#..##.....==.....##..#',
      '#.........==.........#',
      '#....S....==.........#',
      '#,........==........,#',
      '##########EE##########',
    ],
    ground: [70, 78, 120],
    path: [150, 160, 210],
    solidEmoji: '🏛️',
    decoEmoji: '✨',
    spawn: { x: 10, y: 11 },
    npcs: [{ defId: 'wayfarer-keeper', x: 12, y: 7 }],
    enemies: [],
    exits: [
      { x: 10, y: 13, to: 'dawnreach', spawnX: 35, spawnY: 18 },
      { x: 11, y: 13, to: 'dawnreach', spawnX: 35, spawnY: 18 },
    ],
  },

  // A mossy garden shrine with two lily ponds, off the east road. Its keeper
  // teaches Calm, and every critter for miles knows her name (#75 item 9).
  'quiet-shrine': {
    id: 'quiet-shrine',
    name: 'Shrine of Quiet Paws',
    the: true,
    kind: 'shrine',
    map: [
      '######################',
      '#,,....#......#....,,#',
      '#,..........,........#',
      '#...~~~~......~~~~...#',
      '#..~~~~~~....~~~~~~..#',
      '#...~~~~......~~~~...#',
      '#.........==.........#',
      '#.,.......==......,..#',
      '#.....#...==...#.....#',
      '#.........==.........#',
      '#..,......==.....,...#',
      '#.........==...S.....#',
      '#,........==........,#',
      '##########EE##########',
    ],
    ground: [96, 140, 92],
    path: [176, 160, 120],
    solidEmoji: '🌳',
    decoEmoji: '🌸',
    spawn: { x: 10, y: 11 },
    npcs: [{ defId: 'quiet-keeper', x: 12, y: 6 }],
    enemies: [],
    exits: [
      { x: 10, y: 13, to: 'dawnreach', spawnX: 51, spawnY: 39 },
      { x: 11, y: 13, to: 'dawnreach', spawnX: 51, spawnY: 39 },
    ],
  },

  // An old mine in the ridge south of the shrine valley. Its lamps went out
  // with the fog: past the first chamber it's pitch dark until Glow lights it
  // (#75 item 9). Miner Mabel waits at the mouth; a chest waits at the bottom.
  'echo-mine': {
    id: 'echo-mine',
    name: 'Echo Mine',
    kind: 'dungeon',
    // The chest's riddle is about the old days (the mine's long history).
    topic: 'history',
    // Two tiles wide everywhere, like the gates, so no one snags on a corner.
    map: [
      '######################',
      '##############.=.....#',
      '####======.=##.=...C.#',
      '####.......=##.=.....#',
      '####=.#..#.=##.=.,.,.#',
      '####=.#..#.=##.=######',
      '####=.#..#.....=######',
      '####=.#.C#====.=######',
      '####=.################',
      '####=.################',
      '#,..=...............,#',
      '#...=................#',
      '#...========.,.......#',
      '##########EE##########',
    ],
    ground: [84, 72, 70],
    path: [140, 116, 92],
    solidEmoji: '🪨',
    decoEmoji: '💎',
    spawn: { x: 11, y: 11 },
    npcs: [{ defId: 'mine-miner', x: 15, y: 11 }],
    enemies: [],
    exits: [
      { x: 10, y: 13, to: 'dawnreach', spawnX: 57, spawnY: 21 },
      { x: 11, y: 13, to: 'dawnreach', spawnX: 57, spawnY: 21 },
    ],
    dark: {
      pitch: [{ x: 4, y: 7, w: 2, h: 3 }],
      hint: "It's pitch dark in there! You'd need a light to go on. Old Wren at the Shrine of First Light knows a spell for that.",
      lit: '🔆 Glow! The old mine lamps flicker back to life, one after another, deep into the tunnels.',
      guards: { x: 19, y: 2 },
    },
    // The old miners' Moonstone, at the end of the oldest seam — Hermit Moss
    // wants it for his moon-lamp (#75 item 13, "The Hermit's Moonstone").
    keyChests: [{ x: 8, y: 7, item: 'moonstone' }],
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

/**
 * A position (pixels) the hero can safely stand on, else the zone spawn. With
 * `flags`, a spot shut in behind fog that hasn't lifted counts as unsafe too:
 * a save from before the fog (or an exit that lands inside it) must never
 * leave the hero sealed in (#75 item 7).
 */
export function safeSpawn(
  z: ZoneDef,
  pos: { x: number; y: number } | null,
  flags?: Record<string, boolean>,
): { x: number; y: number } {
  const fallback = { x: z.spawn.x * TILE + TILE / 2, y: z.spawn.y * TILE + TILE / 2 };
  if (!pos) return fallback;
  const cx = Math.floor(pos.x / TILE);
  const cy = Math.floor(pos.y / TILE);
  if (!WALKABLE_CHARS.has(tileAt(z, cx, cy))) return fallback;
  if (flags && z.fogs?.length && behindFog(z, flags).has(`${cx},${cy}`)) return fallback;
  return pos;
}

/**
 * Cells you can walk to from the zone's spawn (4-way), with fog (and pitch
 * dark) in the way unless `flags` lift it; `flags` null ignores both.
 */
export function reachableOnFoot(z: ZoneDef, flags: Record<string, boolean> | null): Set<string> {
  const seen = new Set<string>([`${z.spawn.x},${z.spawn.y}`]);
  const queue: [number, number][] = [[z.spawn.x, z.spawn.y]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const key = `${nx},${ny}`;
      if (seen.has(key) || !WALKABLE_CHARS.has(tileAt(z, nx, ny))) continue;
      if (flags && (fogAt(z, nx, ny, flags) || darkAt(z, nx, ny, flags))) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

/** Cells only reachable through fog that hasn't lifted (the fog itself included). */
export function behindFog(z: ZoneDef, flags: Record<string, boolean>): Set<string> {
  const open = reachableOnFoot(z, flags);
  return new Set([...reachableOnFoot(z, null)].filter((c) => !open.has(c)));
}

/** Has any of this bank's flags been earned? */
export function fogLifted(f: FogDef, flags: Record<string, boolean>): boolean {
  return f.liftedBy.some((flag) => flags[flag]);
}

/** The unlifted fog bank covering this cell, if any (#75). */
export function fogAt(z: ZoneDef, x: number, y: number, flags: Record<string, boolean>): FogDef | null {
  return (
    z.fogs?.find((f) => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h && !fogLifted(f, flags)) ?? null
  );
}

/** A town's inn (#75 item 11: every town has exactly one), if the zone has one. */
export function innOf(z: ZoneDef): BuildingDef | undefined {
  return z.buildings?.find((b) => b.sign === 'inn');
}

/** Where a hero wakes in a town's inn: just inside its door. */
export function innWakeCell(z: ZoneDef): { x: number; y: number } | null {
  const inn = innOf(z);
  if (!inn) return null;
  const facade = inn.y + inn.h - 1;
  for (let x = inn.x; x < inn.x + inn.w; x++) if (z.map[facade][x] === 'D') return { x, y: facade - 1 };
  return null;
}

/** Save flag: the Glow field spell has lit this dark place, for good (#75 item 9). */
export function litFlag(zoneId: ZoneId): string {
  return `lit:${zoneId}`;
}

/** Is this cell pitch dark — part of an unlit dark place's `pitch`? */
export function darkAt(z: ZoneDef, x: number, y: number, flags: Record<string, boolean>): boolean {
  if (!z.dark || flags[litFlag(z.id)]) return false;
  return z.dark.pitch.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

/** Save flag: this bank's lifting has been shown — the camera pan to it (#75 item 7). */
export function fogSeenFlag(id: string): string {
  return `fog-${id}-seen`;
}

/** Banks that have lifted but whose lifting the hero hasn't watched yet. */
export function fogsToReveal(z: ZoneDef, flags: Record<string, boolean>): FogDef[] {
  return (z.fogs ?? []).filter((f) => fogLifted(f, flags) && !flags[fogSeenFlag(f.id)]);
}

/** The quest item in the chest with this path-target id, if it's a key-item chest (#75 item 13). */
export function chestKeyItem(chestId: string): string | undefined {
  for (const z of Object.values(ZONES)) {
    const chest = z.keyChests?.find((c) => pathTargetId(z.id, 'chest', c.x, c.y) === chestId);
    if (chest) return chest.item;
  }
  return undefined;
}

/** A chest's question topic: the one its fog bank names, else the zone's, else math. */
export function chestTopicAt(z: ZoneDef, x: number, y: number): Topic {
  return z.fogs?.find((f) => f.chestTopic && f.guards.x === x && f.guards.y === y)?.chestTopic ?? z.topic ?? 'math';
}

/** The place on this map whose entrance is at (x, y), if any. */
export function placeAt(z: ZoneDef, x: number, y: number): PlaceDef | null {
  return z.places?.find((p) => p.x === x && p.y === y) ?? null;
}
