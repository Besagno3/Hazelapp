import type { Topic } from '../types';
import type { MusicTrack } from '../lib/audio';
import { VILLAIN_NAME } from './story';
import type { ZoneDef } from './zones';

/**
 * The Crystal Spire endgame (#55): a multi-floor question climb, unlocked only
 * once all four crystals are restored. Each floor is harder than the last
 * (higher level, escalating taunts) and draws from different question topics;
 * the top floor is the final boss — Umbra, the Forgotten One, the hidden evil
 * who fed the world to the fog and pulls the strings from the Spire's peak.
 *
 * Kid-friendly fail rule: the hero carries `SPIRE_LIVES` candle-lights; each
 * wrong answer snuffs one. Run out and the Spire gently casts you back to
 * Lumina Field, fully healed — climb again any time, no penalty.
 *
 * Every floor is a walkable, themed map (#74): its questions are guarded by
 * rune seals ('Q'), and breaking them all unseals the stairs ('U') up. The
 * dark closes in as candles go out (the hero's light shrinks). The top floor
 * is Umbra's throne room — walk up to the Forgotten One to begin the end.
 */

export interface SpireFloor {
  /** Floor title shown on the landing. */
  name: string;
  /** Umbra's taunt as the floor begins. */
  taunt: string;
  /** Question topics this floor draws from (mixed + shuffled). */
  topics: Topic[];
  /** Question level = base (age) + this bonus, clamped 1-10. */
  levelBonus: number;
  /** Questions that must be cleared to ascend. */
  questions: number;
  isBoss?: boolean;
  /** Which themed map + tileset this floor uses (`SPIRE_FLOOR_MAPS`). */
  theme: SpireTheme;
  /** Spooky loop that plays while exploring this floor. */
  music: MusicTrack;
}

/** The floor themes — each has its own tileset (`/tiles/spire-<theme>.png`). */
export const SPIRE_THEMES = ['archive', 'thicket', 'stars', 'engine', 'throne'] as const;
export type SpireTheme = (typeof SPIRE_THEMES)[number];

/**
 * Floor maps (22×14, one screen). Legend adds to the zone legend:
 *   'Q'  rune seal — solid; bump it to face one of the floor's questions
 *   'U'  stairs up — solid; climbs once every seal on the floor is broken
 *   'Y'  Umbra's throne (solid scenery; Umbra stands at `umbra`, in front)
 * `spawn` is where the hero arrives at the foot of the floor.
 */
export interface SpireFloorMap {
  map: string[];
  spawn: { x: number; y: number };
  /** Ground / path colours (the canvas background under the tiles). */
  ground: [number, number, number];
  path: [number, number, number];
  /** Umbra's tile (throne floor only); drawn centred on the carpet (x..x+1). */
  umbra?: { x: number; y: number };
}

export const SPIRE_FLOOR_MAPS: Record<SpireTheme, SpireFloorMap> = {
  archive: {
    map: [
      '######################',
      '#.........UU.........#',
      '#.######..==..######.#',
      '#.######..==..######.#',
      '#.Q.....,.==,...~~~..#',
      '#.........==....~~~..#',
      '#..######.==.######..#',
      '#..######.==.######..#',
      '#....,....==.......Q.#',
      '#.........==.,.......#',
      '#.#####...==...#####.#',
      '#...~~~...==.....,...#',
      '#..Q~~~...==.........#',
      '######################',
    ],
    spawn: {
      x: 10,
      y: 12,
    },
    ground: [70, 62, 58],
    path: [110, 40, 50],
  },
  thicket: {
    map: [
      '######################',
      '#.........UU.........#',
      '#...#####.==.######..#',
      '#.....,...==.......Q.#',
      '#.==========...,.....#',
      '#.=..........#...###.#',
      '#.=Q.~~~~~~~~#~~~###.#',
      '#.=..~~~~~~~~~~~~....#',
      '#.=..~~~~~~~~~~~~....#',
      '#.=.#~~~~~~~~~~~~.Q..#',
      '#.=.#...,...,......,.#',
      '#.==================.#',
      '#................,...#',
      '######################',
    ],
    spawn: {
      x: 17,
      y: 12,
    },
    ground: [46, 62, 50],
    path: [80, 70, 50],
  },
  stars: {
    map: [
      '######################',
      '#Q.~~~~~~.UU.~~~~~~.Q#',
      '#..~~~~~~.==.~~~~~~..#',
      '#..~~~~~~#==,~~~~~~..#',
      '#.,~~~~~~.==.~~~~~~#.#',
      '#.........==.........#',
      '#====================#',
      '#====================#',
      '#.........==.........#',
      '#.#~~~~~~,==.~~~~~~,.#',
      '#..~~~~~~.==#~~~~~~..#',
      '#..~~~~~~.==.~~~~~~..#',
      '#Q.~~~~~~.==.~~~~~~.Q#',
      '######################',
    ],
    spawn: {
      x: 10,
      y: 12,
    },
    ground: [26, 24, 48],
    path: [60, 56, 96],
  },
  engine: {
    map: [
      '######################',
      '#..Q......UU.........#',
      '#.........==.........#',
      '#====================#',
      '#=...,........,....==#',
      '#=..##############.==#',
      '#=..##############Q==#',
      '#=...............#.==#',
      '#===============.#.==#',
      '#.....~~~.......Q..==#',
      '#..###############.==#',
      '#.Q......,..~~~...,==#',
      '#====================#',
      '######################',
    ],
    spawn: {
      x: 2,
      y: 12,
    },
    ground: [64, 60, 66],
    path: [96, 90, 70],
  },
  throne: {
    map: [
      '######################',
      '#~~~~~~~~.YY.~~~~~~~~#',
      '#.........==.........#',
      '#....#.,..==..,.#....#',
      '#.........==.........#',
      '#.........==.........#',
      '#....#....==....#....#',
      '#.........==.........#',
      '#.........==.........#',
      '#....#.,..==..,.#....#',
      '#.........==.........#',
      '#..,......==......,..#',
      '#.........==.........#',
      '######################',
    ],
    spawn: {
      x: 10,
      y: 12,
    },
    ground: [30, 20, 40],
    path: [88, 40, 120],
    umbra: {
      x: 10,
      y: 2,
    },
  },
};

/** Arrival point (px) for a floor — the centre of its spawn tile. */
export function floorSpawnPx(theme: SpireTheme, tile: number): { x: number; y: number } {
  const s = SPIRE_FLOOR_MAPS[theme].spawn;
  return { x: s.x * tile + tile / 2, y: s.y * tile + tile / 2 };
}

/** Grid cells of a floor's rune seals, in reading order (their ids are "x,y"). */
export function floorWards(theme: SpireTheme): { x: number; y: number; id: string }[] {
  const out: { x: number; y: number; id: string }[] = [];
  SPIRE_FLOOR_MAPS[theme].map.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === 'Q') out.push({ x, y, id: `${x},${y}` });
    }),
  );
  return out;
}

/**
 * A floor as a renderable map for the world canvas. It borrows the Spire
 * zone's id (the hero never leaves the Spire) and names its own tileset.
 */
export function floorZone(theme: SpireTheme): ZoneDef {
  const f = SPIRE_FLOOR_MAPS[theme];
  return {
    id: 'crystal-spire',
    name: 'The Crystal Spire',
    map: f.map,
    ground: f.ground,
    path: f.path,
    solidEmoji: '🕸️',
    decoEmoji: '🕯️',
    spawn: f.spawn,
    npcs: [],
    enemies: [],
    exits: [],
    tileset: `spire-${theme}`,
  };
}

/** Candle-lights (wrong answers allowed) for the whole climb. */
export const SPIRE_LIVES = 4;

/** XP awarded for clearing the Spire and beating Umbra. */
export const SPIRE_CLEAR_XP = 600;

/** Spoken before the first floor (one box at a time). */
export const SPIRE_INTRO: string[] = [
  'The Spire door swings shut behind you. The dark at the top breathes out, slow and patient.',
  `"Welcome, little spark," says ${VILLAIN_NAME}. "Four crystals bought you these stairs. Every step costs an answer. Climb — and let us see how much you truly remember."`,
];

export const SPIRE_FLOORS: SpireFloor[] = [
  {
    name: 'Floor 1 — The Whispering Stair',
    theme: 'archive',
    music: 'spireArchive',
    taunt: '"This first stair is made of old, forgotten things. Name them, if you can."',
    topics: ['history'],
    levelBonus: 1,
    questions: 3,
  },
  {
    name: 'Floor 2 — The Overgrown Landing',
    theme: 'thicket',
    music: 'spireThicket',
    taunt: '"Vines and creatures I let the fog eat. You think you know them better than I forgot them?"',
    topics: ['nature'],
    levelBonus: 2,
    questions: 3,
  },
  {
    name: 'Floor 3 — The Star Gallery',
    theme: 'stars',
    music: 'spireStars',
    taunt: '"Up here I smothered the very stars. Reach them — if your little mind can stretch that far."',
    topics: ['space'],
    levelBonus: 3,
    questions: 4,
  },
  {
    name: 'Floor 4 — The Engine Vault',
    theme: 'engine',
    music: 'spireEngine',
    taunt: '"Numbers, gears, wild ideas — I jammed them all. Untangle my locks. They get nastier from here."',
    topics: ['math', 'engineering', 'creativity'],
    levelBonus: 4,
    questions: 4,
  },
  {
    name: 'Floor 5 — The Forgotten Throne',
    theme: 'throne',
    // The throne hall creeps with the Spire theme; 'finalBoss' takes over
    // once the hero walks up to Umbra and the fight begins.
    music: 'spire',
    taunt: `"No more stairs, spark. Only me. I am ${VILLAIN_NAME} — and I will out-last every answer you have left."`,
    topics: ['math', 'science', 'engineering', 'creativity', 'nature', 'space', 'history'],
    levelBonus: 5,
    questions: 5,
    isBoss: true,
  },
];

/** Umbra's last words when the final floor is cleared (before the cutscene). */
export const SPIRE_BOSS_DEFEAT =
  '"Out-remembered… by a child… perhaps being remembered is not so terrible after all…"';
