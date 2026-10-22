import type { CompanionId } from '../content/companion';

/**
 * The crystal main-quest topic ids — each has a crystal, a Fiend, a Sage, and
 * a topic zone. Crystal/ending logic keys off these. THE single source of
 * truth for the crystal count: adding a crystal topic means adding its id
 * here, and the compiler then walks you through every exhaustive
 * `Record<CrystalTopic, …>` (SAGES, BOSS_LINES, CRYSTAL_PANELS) while
 * `topics.test.ts` enforces the registry entry.
 */
export const CRYSTAL_TOPIC_IDS = [
  'math',
  'science',
  'engineering',
  'creativity',
  // Act II (#75 item 14h): the Crystal of Memory, in the Sunken Archive.
  'history',
  // Act III (#75 item 15g): the Crystal of Voices, on Chorus Isle.
  'words',
] as const;

export type CrystalTopic = (typeof CRYSTAL_TOPIC_IDS)[number];

/** How many Crystals of Knowing exist — derived, never hardcode `4`. */
export const TOTAL_CRYSTALS = CRYSTAL_TOPIC_IDS.length;

/**
 * The expansion question-theme ids (#55) — styling only, no crystal/Fiend.
 * (History was one until it became Act II's crystal, #75 item 14h.)
 * Geography and music are Act III's (#75 item 15a); so was words, until it
 * became the sixth crystal, Voices (#75 item 15g).
 */
export const EXTRA_TOPIC_IDS = ['nature', 'space', 'geography', 'music'] as const;

/**
 * Every question category the game can generate: the `CrystalTopic`s plus the
 * expansion themes that flavour the new zones. Only `CrystalTopic`s bear
 * crystals.
 */
export type Topic = CrystalTopic | (typeof EXTRA_TOPIC_IDS)[number];

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

/**
 * A hero's type — sets their attack, block and spell power (`lib/battleMath.ts`)
 * and its two signature abilities (`HERO_ABILITIES`, `content/avatars.ts`).
 */
export const FIGHT_STYLES = ['aggressive', 'defensive', 'balanced', 'swift', 'mystic'] as const;
export type FightStyle = (typeof FIGHT_STYLES)[number];

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

/**
 * The world zones of Lumina — derived from `ZONE_IDS` in content/zones.ts
 * (Wave 0.3), re-exported here so shared types keep a single
 * import surface.
 * (Type-only circularity with zones.ts is fine — both directions are erased
 * at compile time.)
 */
import type { TravelMode, ZoneId } from '../content/zones';
import type { ConsumableId } from '../content/items';
import type { DangerTier } from '../content/regions';
export type { ZoneId };

/**
 * Mechanical enemy archetypes (Wave 0.5, ROADMAP-4X) — zones differ in play,
 * not just palette. shielded: the first landed hit shatters its shield
 * instead of dealing damage. trickster: too slippery for Hint Feathers.
 * healer: mends itself at the end of its turn while below half HP.
 * swift (#75 item 14h, roadmap decision 14): it strikes first — the battle
 * opens with its turn. No new timers: a defend question blocks it as ever.
 */
export const ENEMY_BEHAVIORS = ['shielded', 'trickster', 'healer', 'swift'] as const;
export type EnemyBehavior = (typeof ENEMY_BEHAVIORS)[number];

/**
 * Where a critter lives (#75 item 14d): on land it roams walkable ground and
 * fights a hero on foot; at sea it swims open water and fights only a hero
 * sailing Marlow's boat (`meetsHero`, lib/travel.ts).
 */
export const HABITATS = ['land', 'sea'] as const;
export type Habitat = (typeof HABITATS)[number];

/**
 * What a boss is to the story (#75 item 14c) — this, not "a boss without a
 * key", decides what beating it does: a `fiend` restores its topic's crystal,
 * a `warden` gives up its gate key (`content/keys.ts`); a `miniboss`, an
 * `echo` (Act IV's memories of the wardens) or the `finale` restore nothing
 * and stay beaten by their own flag (`bossFlag`).
 */
export const BOSS_ROLES = ['fiend', 'warden', 'miniboss', 'echo', 'finale'] as const;
export type BossRole = (typeof BOSS_ROLES)[number];

/** An enemy instance the player bumped into on the map. */
export interface BattleEnemy extends NPC {
  /** Unique per placement — used to keep defeated enemies off the map this session. */
  instanceId: string;
  zoneId: ZoneId;
  isBoss: boolean;
  /** A boss's part in the story (#75 item 14c); every boss has one. */
  role?: BossRole;
  /** Coins dropped on victory. */
  coins: number;
  behavior?: EnemyBehavior;
  /** Where it lives (#75 item 14d) — missing = land. A sea critter's battle is fought from the boat. */
  habitat?: Habitat;
  /**
   * Danger tier of where it roams (#75 item 12, content/regions.ts): scales
   * its HP, blows, power moves and rewards — never its questions (`level`).
   * Missing = BASE_TIER (the balance before regions).
   */
  tier?: DangerTier;
  /**
   * Set when mercy eased this fight (`atTier`): the tier of where it roams,
   * while `tier` is the gentler one it fights at. Its losses still count
   * under where it roams (`lossKey`).
   */
  eased?: DangerTier;
}

/** Town/zone services opened by talking to the matching NPC (`trial`: a shrine keeper's, #75 item 9). */
/** `name`: Umbra Remembered's finale at the Root's Heart (#75 item 16e, `NameFinale`). */
export type ServiceType = 'inn' | 'shop' | 'library' | 'sage' | 'trial' | 'name';

/** A question-locked obstacle on the path: a gate or a treasure chest. */
export interface PathTarget {
  /** A riddle is a riddle step's question (#75 item 15e: Yarn's tale-stones); its id is the step's. */
  kind: 'gate' | 'chest' | 'keygate' | 'riddle';
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
  /** Lifetime experience points. */
  xp: number;
  /**
   * Saved player level, and the XP earned toward the next one (lib/level.ts).
   * Absent on a profile cached before levels were saved — `levelState`
   * derives them from `xp` then.
   */
  level?: number;
  levelXp?: number;
  /** Power-ups chosen on level-ups. */
  powerUps: PowerUps;
  /** Consecutive days played (#28). */
  currentStreak: number;
  /** High-water mark of `currentStreak`. */
  longestStreak: number;
  /** YYYY-MM-DD (local) of the player's last activity, or null if never played. */
  lastPlayedOn: string | null;
  /**
   * Where each topic really started — the level for the kid's age and that
   * age — noted the first time the topic's level is saved (`profiles.skill_starts`,
   * migration 0026, #174; the server keeps the first). Absent on a profile read
   * from a database without the column; the save's `topicStarts` stands in.
   */
  skillStarts?: Partial<Record<Topic, TopicStart>>;
}

/** One topic's answers on one day (#173): `a` asked, `r` right (bank questions only), `l` the topic's level at the day's end. */
export interface TopicTally {
  a: number;
  r: number;
  l?: number;
}

/**
 * One kid's play on one calendar day (their device's), for 👪 Grown-ups →
 * 📈 Progress (#169, #172, #173; migrations 0026–0027): kept on the device as
 * it grows and sent as this browser's part of the day (`note_device_play`,
 * #179), the server keeping the larger of each part and adding the parts up.
 */
export interface PlayDayRecord {
  /** `YYYY-MM-DD`. */
  day: string;
  /** XP earned that day. */
  xp: number;
  /** Active minutes played that day (a visible tab with input in the last minute). */
  minutes: number;
  /** Answers per topic id. */
  topics: Partial<Record<string, TopicTally>>;
}

/**
 * One of a grown-up's kids (#124): a `profiles` row as the family screens see
 * it. `icon` is an id from `content/family.ts` (null for a kid from before
 * parent accounts, until a grown-up picks one).
 */
export interface Kid {
  id: string;
  /** Nickname (null for a kid from before parent accounts). */
  name: string | null;
  icon: string | null;
  /** Whether their PIN is set (the PIN itself never leaves the database). */
  hasPin: boolean;
  birthYear: number;
  birthMonth: number;
}

/** What a grown-up fills in to add or change a kid. */
export interface KidInput {
  name: string;
  icon: string;
  /** A new 4-digit PIN; left out when changing a kid keeps theirs. */
  pin?: string;
  birthYear: number;
  birthMonth: number;
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
  version: 4;
  /**
   * How many times this save has been changed (#151): one more on every change
   * the game makes (`saveStore.update`). On load the copy with the higher
   * revision wins (this device's or the server's), and the server refuses a
   * copy that isn't newer than the one it holds (migration 0020). Additive: a
   * save from before it counts as 0 (`normalizeSave`).
   */
  revision: number;
  avatarId: string | null;
  zoneId: ZoneId;
  /** Pixel position in the current zone; null → the zone's default spawn. */
  pos: { x: number; y: number } | null;
  /** Current HP; null → full (max derives from avatar + power-ups). */
  hp: number | null;
  coins: number;
  /** Carried consumables — one count per `CONSUMABLE_IDS` entry (content/items.ts). */
  items: Record<ConsumableId, number>;
  badges: string[];
  /** Topics whose Sage the player has met (each grants that topic's spell). */
  sages: CrystalTopic[];
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
  /** The companion fighting beside the hero (🔄 Swap in battle) — kept across reloads. */
  companionId: CompanionId;
  /** Countdown on defend questions (⏳). A per-player setting in the 📜 menu; on by default. */
  defendTimer: boolean;
  /**
   * The home-row hold in typing (#165): the other hand holds its bump key (F
   * or J) while a letter is typed. A per-player setting (📜 Menu → ⌨️ Typing,
   * and the Library's lessons); on by default. Additive, like `defendTimer`.
   */
  typingAnchor: boolean;
  /**
   * The town whose inn the hero last rested at (#75 item 11) — where a defeat
   * wakes them. Null → home (Lumina Village's plaza), as before inns were everywhere.
   */
  lastRest: ZoneId | null;
  /**
   * Where Marlow's boat is moored (#75 item 14), in tiles — null = at his dock
   * (once it's mended; see `content/boat.ts` `boatSpot`). Formally part of the
   * save since v3 (#104a).
   */
  boat: BoatSpot | null;
  /**
   * How the hero is getting about at `pos` (save v3, #75 item 15b): on foot,
   * sailing Marlow's boat (#75 item 14 — v2 called this `aboard`), or flying
   * on Ember (#75 item 15b).
   */
  vehicle: TravelMode;
  /**
   * Where each topic's question level started (#29 review round 2), noted the
   * first time the game saves that topic's level — so 👪 Grown-ups → 📈
   * Progress compares a topic with where it really began, never with where a
   * player of the kid's age *today* would begin (a birthday moves that).
   * Additive: topics saved before this have no entry (the page then makes no
   * above/below claim), and an older save has none at all.
   */
  topicStarts: Partial<Record<Topic, TopicStart>>;
}

/**
 * A topic's real start (#29 review round 2): the level the game first set it
 * from — `ageToStartLevel` of the kid's age then — and that age.
 * `on`: the day it was noted (`YYYY-MM-DD`, the device's calendar; #183) —
 * the database works the age out from it and the kid's birth date, so a
 * corrected birth date corrects it exactly. Absent on starts noted before.
 */
export interface TopicStart {
  level: number;
  age: number;
  on?: string;
}

/** A boat's mooring (#75 item 14): a sea cell on a map, in tiles. */
export interface BoatSpot {
  zoneId: ZoneId;
  x: number;
  y: number;
}
