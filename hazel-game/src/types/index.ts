/**
 * The four main-quest topics — each has a crystal, a Fiend, a Sage, and a
 * topic zone. Crystal/ending logic keys off these.
 */
export type CrystalTopic = 'math' | 'science' | 'engineering' | 'creativity';

/**
 * Every question category the game can generate. The four `CrystalTopic`s plus
 * the expansion themes that flavour the new zones (nature/animals, space,
 * time/history). Only `CrystalTopic`s bear crystals.
 */
export type Topic = CrystalTopic | 'nature' | 'space' | 'history';

export interface Question {
  id: string;
  topic: Topic;
  level: number;
  text: string;
  options: string[];
  correctIndex: number;
  /** Kid-friendly one-line explanation (set for AI-generated questions). */
  explanation?: string;
  /** How many times this question has been served (cached questions only). */
  timesAsked?: number;
}

export type FightStyle = 'aggressive' | 'defensive' | 'balanced';

export interface Avatar {
  id: string;
  name: string;
  sprite: string;
  /** key into src/content/sprites.ts SPRITES; falls back to `sprite` (emoji) when absent */
  spriteId?: string;
  fightStyle: FightStyle;
  maxHp: number;
}

export interface NPC {
  id: string;
  name: string;
  sprite: string;
  /** key into src/content/sprites.ts SPRITES; falls back to `sprite` (emoji) when absent */
  spriteId?: string;
  level: number;
  topic: Topic;
  maxHp: number;
}

/** The world zones of Lumina (see src/content/zones.ts). */
export type ZoneId =
  // Original five (hub + four topic regions)
  | 'lumina-field'
  | 'numbria'
  | 'verdara'
  | 'gearfall'
  | 'chromaria'
  // Expansion: story / exploration regions reached through the village
  | 'lumina-village'
  | 'whispering-woods'
  | 'starfall-coast'
  | 'clockwork-depths'
  | 'crystal-spire';

/** An enemy instance the player bumped into on the map. */
export interface BattleEnemy extends NPC {
  /** Unique per placement — used to keep defeated enemies off the map this session. */
  instanceId: string;
  zoneId: ZoneId;
  isBoss: boolean;
  /** Coins dropped on victory. */
  coins: number;
}

/** Town/zone services opened by talking to the matching NPC. */
export type ServiceType = 'inn' | 'shop' | 'library' | 'sage';

/** A question-locked obstacle on the path: a gate or a treasure chest. */
export interface PathTarget {
  kind: 'gate' | 'chest' | 'keygate';
  /** Stable id, e.g. "numbria:gate:12,4" — flags/openedChests key on it. */
  id: string;
  topic: Topic;
  zoneId: ZoneId;
}

/** Per-topic skill level (integers, see lib/age.ts MIN/MAX_SKILL_LEVEL). */
export type SkillLevels = Partial<Record<Topic, number>>;

/** Power-ups a player can choose on level-up (see lib/powerups.ts). */
export type PowerUpId = 'attack' | 'defense' | 'vitality' | 'scholar';

/** How many of each power-up the player has chosen. */
export type PowerUps = Partial<Record<PowerUpId, number>>;

/** A player's Supabase profile (see supabase/migrations/). */
export interface Profile {
  id: string;
  birthYear: number;
  birthMonth: number;
  skillLevels: SkillLevels;
  /** Total experience points; player level is derived from this (lib/level.ts). */
  xp: number;
  /** Power-ups chosen on level-ups. */
  powerUps: PowerUps;
  /** Consecutive days played (#28). */
  currentStreak: number;
  /** High-water mark of `currentStreak`. */
  longestStreak: number;
  /** YYYY-MM-DD (local) of the player's last activity, or null if never played. */
  lastPlayedOn: string | null;
}

/** A missed question queued for re-answering at the Library. */
export interface LibraryEntry {
  question: Question;
  /** The option index the player picked when they missed it. */
  picked: number;
}

/**
 * The per-player save file (#37). Stored as JSONB in the Supabase `saves`
 * table with a localStorage write-through cache keyed by user id (#12).
 */
export interface SaveData {
  version: 1;
  avatarId: string | null;
  zoneId: ZoneId;
  /** Pixel position in the current zone; null → the zone's default spawn. */
  pos: { x: number; y: number } | null;
  /** Current HP; null → full (max derives from avatar + power-ups). */
  hp: number | null;
  coins: number;
  items: { potion: number; hint: number };
  badges: string[];
  /** Topics whose Sage the player has met (each grants that topic's spell). */
  sages: CrystalTopic[];
  sageEquipped: CrystalTopic | null;
  /** Story + world flags: crystal-<topic>-restored, gate:<id>, ending-seen… */
  flags: Record<string, boolean>;
  openedChests: string[];
  /** Lifetime victories per enemy def id — drives defeat quests (#42). */
  kills: Record<string, number>;
  /** Carried quest items (delivery quests, #42) — see content/quests.ts. */
  questItems: string[];
  /** Quiz rounds passed at the training grounds (world unlock gate). */
  passedRounds: number;
  worldUnlocked: boolean;
  /** Missed questions awaiting re-answer at the Library (FIFO, capped). */
  library: LibraryEntry[];
}
