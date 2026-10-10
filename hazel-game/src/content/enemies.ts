import type { BattleEnemy, BossRole, CrystalTopic, EnemyBehavior, Habitat, Topic, ZoneId } from '../types';
import { clampLevel, skillLevelFor } from '../lib/age';
import { topicInfo } from './topics';
import { BOSS_LINES, type BossScript } from './story';
import { keyForBoss } from './keys';
import { bossCoinDrop, enemyCoinDrop } from './items';
import { BASE_TIER, DANGER, placementTier, zoneTier, type DangerTier } from './regions';
import type { EnemyPlacement } from './zones';

/**
 * Enemy archetypes (#37). Placements in zones.ts reference these by id; the
 * actual level is resolved at spawn time from the player's age-appropriate
 * level + the placement's offset, so the same world scales to every kid
 * (replacing the old random `generateNpcs`).
 */
export interface EnemyDef {
  id: string;
  name: string;
  sprite: string;
  /** key into src/content/sprites.ts SPRITES; falls back to `sprite` (emoji) when absent */
  spriteId?: string;
  topic: Topic;
  /** Question level = the player's question level for this topic + levelOffset, clamped 1-10. */
  levelOffset: number;
  /** maxHp = HP_BASE + level * hpPerLevel. */
  hpPerLevel: number;
  isBoss?: boolean;
  /** A boss's part in the story — required on every boss (#75 item 14c, `BossRole`). */
  role?: BossRole;
  /**
   * A miniboss's / echo's / the finale's own monologue and last words. A
   * Fiend speaks `BOSS_LINES[topic]` and a warden its key's lines instead.
   */
  lines?: BossScript;
  /** Mechanical archetype (Wave 0.5) — see EnemyBehavior in types. */
  behavior?: EnemyBehavior;
  /**
   * Where it lives (#75 item 14d) — missing = land. A sea critter swims open
   * sea only and fights only a hero sailing Marlow's boat; a land critter
   * never fights a sailing hero (`meetsHero`, lib/travel.ts).
   */
  habitat?: Habitat;
}

const HP_BASE = 60;
const BOSS_HP_BASE = 140;

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  // --- Numbria (math) ---
  'sum-slime': { id: 'sum-slime', name: 'Sum Slime', sprite: '🟦', topic: 'math', levelOffset: -1, hpPerLevel: 10 },
  'count-bat': { id: 'count-bat', name: 'Count Bat', sprite: '🦇', topic: 'math', levelOffset: 0, hpPerLevel: 12 },
  'sir-sumsalot': { id: 'sir-sumsalot', name: 'Sir Sumsalot', sprite: '🐉', topic: 'math', levelOffset: 1, hpPerLevel: 14 },
  'raven-prince': { id: 'raven-prince', name: 'Raven Prince', sprite: '🐦‍⬛', topic: 'math', levelOffset: -1, hpPerLevel: 10 },
  'kia': { id: 'kia', name: 'Kia', sprite: '🦑', topic: 'math', levelOffset: 0, hpPerLevel: 12 },
  'pirate-parrot': { id: 'pirate-parrot', name: 'Pi-rate Parrot', sprite: '🦜', topic: 'math', levelOffset: 1, hpPerLevel: 14, behavior: 'trickster' },
  'null-fiend': { id: 'null-fiend', name: 'The Null Fiend', sprite: '👹', topic: 'math', levelOffset: 1, hpPerLevel: 20, isBoss: true, role: 'fiend' },

  // --- Verdara (science) ---
  'spore-puff': { id: 'spore-puff', name: 'Spore Puff', sprite: '🍄', topic: 'science', levelOffset: -1, hpPerLevel: 10 },
  'static-jelly': { id: 'static-jelly', name: 'Static Jelly', sprite: '🪼', topic: 'science', levelOffset: 0, hpPerLevel: 12 },
  'comet-crab': { id: 'comet-crab', name: 'Comet Crab', sprite: '🦀', topic: 'science', levelOffset: 1, hpPerLevel: 14 },
  'fizzlet': { id: 'fizzlet', name: 'Fizzlet', sprite: '🫧', topic: 'science', levelOffset: -1, hpPerLevel: 10 },
  'magnetick': { id: 'magnetick', name: 'Magnetick', sprite: '🧲', topic: 'science', levelOffset: 0, hpPerLevel: 12 },
  'germinator': { id: 'germinator', name: 'Germinator', sprite: '🦠', topic: 'science', levelOffset: 1, hpPerLevel: 14, behavior: 'healer' },
  'smog-fiend': { id: 'smog-fiend', name: 'The Smog Fiend', sprite: '🌫️', topic: 'science', levelOffset: 1, hpPerLevel: 20, isBoss: true, role: 'fiend' },

  // --- Gearfall (engineering) ---
  'bolt-mouse': { id: 'bolt-mouse', name: 'Bolt Mouse', sprite: '🐭', topic: 'engineering', levelOffset: -1, hpPerLevel: 10 },
  'scrap-golem': { id: 'scrap-golem', name: 'Scrap Golem', sprite: '🗿', topic: 'engineering', levelOffset: 0, hpPerLevel: 12 },
  'gear-wyrm': { id: 'gear-wyrm', name: 'Gear Wyrm', sprite: '🐍', topic: 'engineering', levelOffset: 1, hpPerLevel: 14 },
  'pulley-spider': { id: 'pulley-spider', name: 'Pulley Spider', sprite: '🕷️', topic: 'engineering', levelOffset: -1, hpPerLevel: 10 },
  'piston-boar': { id: 'piston-boar', name: 'Piston Boar', sprite: '🐗', topic: 'engineering', levelOffset: 0, hpPerLevel: 12 },
  'ironhorn-rampager': { id: 'ironhorn-rampager', name: 'Ironhorn Rampager', sprite: '🦏', topic: 'engineering', levelOffset: 1, hpPerLevel: 14, behavior: 'shielded' },
  'rust-fiend': { id: 'rust-fiend', name: 'The Rust Fiend', sprite: '🤖', topic: 'engineering', levelOffset: 1, hpPerLevel: 20, isBoss: true, role: 'fiend' },

  // --- Chromaria (creativity) ---
  'doodle-imp': { id: 'doodle-imp', name: 'Doodle Imp', sprite: '👻', topic: 'creativity', levelOffset: -1, hpPerLevel: 10 },
  'off-key-bird': { id: 'off-key-bird', name: 'Off-Key Bird', sprite: '🐦', topic: 'creativity', levelOffset: 0, hpPerLevel: 12 },
  'pixel-witch': { id: 'pixel-witch', name: 'Pixel Witch', sprite: '🦹', topic: 'creativity', levelOffset: 1, hpPerLevel: 14, behavior: 'trickster' },
  'flicker-goblin': { id: 'flicker-goblin', name: 'Flicker Goblin', sprite: '🔥', topic: 'creativity', levelOffset: -1, hpPerLevel: 10 },
  'graffiti-gargoyle': { id: 'graffiti-gargoyle', name: 'Graffiti Gargoyle', sprite: '🎨', topic: 'creativity', levelOffset: 0, hpPerLevel: 12 },
  'dog-knight': { id: 'dog-knight', name: 'Dog-Knight', sprite: '🐕', topic: 'creativity', levelOffset: 1, hpPerLevel: 14, behavior: 'healer' },
  'gray-fiend': { id: 'gray-fiend', name: 'The Gray Fiend', sprite: '🌑', topic: 'creativity', levelOffset: 1, hpPerLevel: 20, isBoss: true, role: 'fiend' },

  // --- Whispering Woods (nature & animals) — critters + the warden boss (#58) ---
  'mossback-cub': { id: 'mossback-cub', name: 'Mossback Cub', sprite: '🐻', topic: 'nature', levelOffset: -1, hpPerLevel: 10 },
  'thornhare': { id: 'thornhare', name: 'Thornhare', sprite: '🐰', topic: 'nature', levelOffset: 0, hpPerLevel: 12 },
  'grumblebee': { id: 'grumblebee', name: 'Grumblebee', sprite: '🐝', topic: 'nature', levelOffset: 1, hpPerLevel: 13 },
  'dart-frog': { id: 'dart-frog', name: 'Dart Frog', sprite: '🐸', topic: 'nature', levelOffset: -1, hpPerLevel: 10 },
  'snapjaw': { id: 'snapjaw', name: 'Snapjaw', sprite: '🪴', topic: 'nature', levelOffset: 0, hpPerLevel: 12 },
  'oak-owl': { id: 'oak-owl', name: 'Oak Owl', sprite: '🦉', topic: 'nature', levelOffset: 1, hpPerLevel: 13, behavior: 'trickster' },
  'thicket-warden': { id: 'thicket-warden', name: 'The Thicket Warden', sprite: '🦌', topic: 'nature', levelOffset: 1, hpPerLevel: 16, isBoss: true, role: 'warden' },

  // --- Starfall Coast (space) — critters + the warden boss (#58) ---
  'tide-sprite': { id: 'tide-sprite', name: 'Tide Sprite', sprite: '🌊', topic: 'space', levelOffset: -1, hpPerLevel: 10 },
  'meteor-mite': { id: 'meteor-mite', name: 'Meteor Mite', sprite: '☄️', topic: 'space', levelOffset: 0, hpPerLevel: 12 },
  'moon-moth': { id: 'moon-moth', name: 'Moon Moth', sprite: '🌙', topic: 'space', levelOffset: 1, hpPerLevel: 13, behavior: 'healer' },
  'orbit-otter': { id: 'orbit-otter', name: 'Orbit Otter', sprite: '🦦', topic: 'space', levelOffset: -1, hpPerLevel: 10 },
  'gravity-beetle': { id: 'gravity-beetle', name: 'Gravity Beetle', sprite: '🪲', topic: 'space', levelOffset: 0, hpPerLevel: 12 },
  'eclipse-fox': { id: 'eclipse-fox', name: 'Eclipse Fox', sprite: '🦊', topic: 'space', levelOffset: 1, hpPerLevel: 13, behavior: 'shielded' },
  'tide-colossus': { id: 'tide-colossus', name: 'The Tide Colossus', sprite: '🐳', topic: 'space', levelOffset: 1, hpPerLevel: 16, isBoss: true, role: 'warden' },

  // --- Clockwork Depths (time & history) — critters + the warden boss (#58) ---
  'cog-sprite': { id: 'cog-sprite', name: 'Cog Sprite', sprite: '⚙️', topic: 'history', levelOffset: -1, hpPerLevel: 10 },
  'hourglass-imp': { id: 'hourglass-imp', name: 'Hourglass Imp', sprite: '⏳', topic: 'history', levelOffset: 0, hpPerLevel: 12 },
  'relic-golem': { id: 'relic-golem', name: 'Relic Golem', sprite: '🗿', topic: 'history', levelOffset: 1, hpPerLevel: 13, behavior: 'shielded' },
  'tut-tut': { id: 'tut-tut', name: 'Tut-Tut', sprite: '🧟', topic: 'history', levelOffset: 0, hpPerLevel: 12 },
  'knight-mare': { id: 'knight-mare', name: 'Knight-Mare', sprite: '🐴', topic: 'history', levelOffset: 1, hpPerLevel: 13 },
  'clockwork-titan': { id: 'clockwork-titan', name: 'The Clockwork Titan', sprite: '🦾', topic: 'history', levelOffset: 1, hpPerLevel: 16, isBoss: true, role: 'warden' },

  // --- The Silver Shallows (sea life) — sea critters, met only from the boat (#75 item 14d) ---
  'bubble-puffer': { id: 'bubble-puffer', name: 'Bubble Puffer', sprite: '🐡', topic: 'nature', levelOffset: -1, hpPerLevel: 10, habitat: 'sea' },
  // Its ink cloud hides the Hint Feather's work (trickster).
  'inkling': { id: 'inkling', name: 'Inkling', sprite: '🐙', topic: 'nature', levelOffset: 0, hpPerLevel: 12, behavior: 'trickster', habitat: 'sea' },
  // A sea star regrows its arms — this one mends itself (healer).
  'starfix': { id: 'starfix', name: 'Starfix', sprite: '⭐', topic: 'nature', levelOffset: 1, hpPerLevel: 13, behavior: 'healer', habitat: 'sea' },

  // --- Eldergrove (history, #75 item 14f): critters of the ring-trees ---
  'ring-beetle': { id: 'ring-beetle', name: 'Ring Beetle', sprite: '🪲', topic: 'history', levelOffset: -1, hpPerLevel: 10 },
  'sap-sprite': { id: 'sap-sprite', name: 'Sap Sprite', sprite: '✨', topic: 'history', levelOffset: 0, hpPerLevel: 12 },
  // Shielded: its cap takes the first hit (Guard first, STORY-4X §4). An empty
  // face for its emoji, so it's never Fen's 🌰 acorns (#75 item 14f review).
  'hollow-acorn': { id: 'hollow-acorn', name: 'Hollow Acorn', sprite: '🫥', topic: 'history', levelOffset: 1, hpPerLevel: 13, behavior: 'shielded' },
  // The warden of the Great Ring: beat it for the Memoria Key (keys.ts).
  ringkeeper: { id: 'ringkeeper', name: 'The Ringkeeper', sprite: '🦌', topic: 'history', levelOffset: 1, hpPerLevel: 16, isBoss: true, role: 'warden' },
};

/** Where an enemy lives (#75 item 14d): its def's habitat, else land. */
export function habitatOf(e: Pick<EnemyDef, 'habitat'> | Pick<BattleEnemy, 'habitat'>): Habitat {
  return e.habitat ?? 'land';
}

/** A crystal topic's Fiend — the boss whose defeat restores its crystal. */
export function fiendFor(topic: Topic): EnemyDef {
  const def = Object.values(ENEMY_DEFS).find((e) => e.role === 'fiend' && e.topic === topic);
  if (!def) throw new Error(`No fiend defined for topic ${topic}`);
  return def;
}

/**
 * Resolves a placed enemy into a battle-ready instance, scaled to the player's
 * **question level** for the enemy's topic (`skillLevels`, 1–10) — it starts
 * from their sign-up age and moves with how well (and how fast) they answer.
 * XP / player level never changes it. A player with no level for the topic
 * yet gets the age baseline. `instanceId` keys session defeat-tracking.
 * `tier` is the danger of where it roams (#75 item 12, `placementTier`): it
 * scales HP and coins here, its blows and power moves in battle — the
 * questions stay at `level`.
 */
export function spawnEnemy(
  defId: string,
  zoneId: ZoneId,
  placementKey: string,
  age: number,
  skillLevels: Partial<Record<Topic, number>> = {},
  tier: DangerTier = zoneTier(zoneId),
): BattleEnemy {
  const def = ENEMY_DEFS[defId];
  if (!def) throw new Error(`Unknown enemy def: ${defId}`);
  const level = clampLevel(skillLevelFor(skillLevels, def.topic, age) + def.levelOffset);
  // A Fiend goes by its crystal's Fiend name; every other boss by its own (#75 item 14c).
  const name = def.role === 'fiend' ? (topicInfo(def.topic).fiendName ?? def.name) : def.name;
  return {
    id: def.id,
    instanceId: `${zoneId}:${placementKey}`,
    name,
    sprite: def.sprite,
    // Generated art is keyed by the def id; an explicit spriteId overrides.
    spriteId: def.spriteId ?? def.id,
    topic: def.topic,
    level,
    maxHp: scaledHp(def, level, tier),
    zoneId,
    isBoss: def.isBoss ?? false,
    role: def.role,
    coins: scaledCoins(def, level, tier),
    behavior: def.behavior,
    habitat: def.habitat,
    tier,
  };
}

function scaledHp(def: EnemyDef, level: number, tier: DangerTier): number {
  return Math.round(((def.isBoss ? BOSS_HP_BASE : HP_BASE) + level * def.hpPerLevel) * DANGER[tier].hp);
}

function scaledCoins(def: EnemyDef, level: number, tier: DangerTier): number {
  return Math.round((def.isBoss ? bossCoinDrop(level) : enemyCoinDrop(level)) * DANGER[tier].coins);
}

/**
 * The same enemy fighting at another tier — mercy far from home (`mercyFor`'s
 * `fightTier`): HP, blows, power moves and pay all follow `tier`, while
 * `eased` remembers where it roams. Its questions don't change.
 */
export function atTier(enemy: BattleEnemy, tier: DangerTier): BattleEnemy {
  if (tier === (enemy.tier ?? BASE_TIER)) return enemy;
  const def = ENEMY_DEFS[enemy.id];
  if (!def) throw new Error(`Unknown enemy def: ${enemy.id}`);
  return {
    ...enemy,
    maxHp: scaledHp(def, enemy.level, tier),
    coins: scaledCoins(def, enemy.level, tier),
    tier,
    eased: enemy.eased ?? enemy.tier ?? BASE_TIER,
  };
}

/**
 * A zone's placed enemy, ready for battle: its instance id ("count-bat@12,4",
 * the key session defeat-tracking matches) and its danger tier (the
 * placement's own, else the zone's — #75 item 12). The world and the
 * question prefetch both spawn through this, so they always agree.
 */
export function spawnPlaced(
  zoneId: ZoneId,
  p: EnemyPlacement,
  age: number,
  skillLevels: Partial<Record<Topic, number>> = {},
): BattleEnemy {
  return spawnEnemy(p.defId, zoneId, `${p.defId}@${p.x},${p.y}`, age, skillLevels, placementTier(zoneId, p));
}

/**
 * What a boss says before the fight and as it falls (#75 item 14c), by its
 * role: a Fiend its crystal's `BOSS_LINES`, a warden its key's lines, any
 * other boss its own `lines` — or nothing, never a crash.
 */
export function bossScript(boss: { id: string; topic: Topic; role?: BossRole }): BossScript | null {
  if (boss.role === 'fiend') return BOSS_LINES[boss.topic as CrystalTopic] ?? null;
  const key = keyForBoss(boss.id);
  if (key) return { intro: key.bossIntro, defeat: key.bossDefeat };
  return ENEMY_DEFS[boss.id]?.lines ?? null;
}
