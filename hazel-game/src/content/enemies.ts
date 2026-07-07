import type { BattleEnemy, EnemyBehavior, Topic, ZoneId } from '../types';
import { ageToStartLevel, clampLevel } from '../lib/age';
import { topicInfo } from './topics';
import { bossCoinDrop, enemyCoinDrop } from './items';

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
  /** Question level = ageToStartLevel(age) + levelOffset, clamped 1-10. */
  levelOffset: number;
  /** maxHp = HP_BASE + level * hpPerLevel. */
  hpPerLevel: number;
  isBoss?: boolean;
  /** Mechanical archetype (Wave 0.5) — see EnemyBehavior in types. */
  behavior?: EnemyBehavior;
}

const HP_BASE = 60;
const BOSS_HP_BASE = 140;

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  // --- Numbria (math) ---
  'sum-slime': { id: 'sum-slime', name: 'Sum Slime', sprite: '🟦', topic: 'math', levelOffset: -1, hpPerLevel: 10 },
  'count-bat': { id: 'count-bat', name: 'Count Bat', sprite: '🦇', topic: 'math', levelOffset: 0, hpPerLevel: 12 },
  'sir-sumsalot': { id: 'sir-sumsalot', name: 'Sir Sumsalot', sprite: '🐉', topic: 'math', levelOffset: 1, hpPerLevel: 14 },
  'null-fiend': { id: 'null-fiend', name: 'The Null Fiend', sprite: '👹', topic: 'math', levelOffset: 1, hpPerLevel: 20, isBoss: true },

  // --- Verdara (science) ---
  'spore-puff': { id: 'spore-puff', name: 'Spore Puff', sprite: '🍄', topic: 'science', levelOffset: -1, hpPerLevel: 10 },
  'static-jelly': { id: 'static-jelly', name: 'Static Jelly', sprite: '🪼', topic: 'science', levelOffset: 0, hpPerLevel: 12 },
  'comet-crab': { id: 'comet-crab', name: 'Comet Crab', sprite: '🦀', topic: 'science', levelOffset: 1, hpPerLevel: 14 },
  'smog-fiend': { id: 'smog-fiend', name: 'The Smog Fiend', sprite: '🌫️', topic: 'science', levelOffset: 1, hpPerLevel: 20, isBoss: true },

  // --- Gearfall (engineering) ---
  'bolt-mouse': { id: 'bolt-mouse', name: 'Bolt Mouse', sprite: '🐭', topic: 'engineering', levelOffset: -1, hpPerLevel: 10 },
  'scrap-golem': { id: 'scrap-golem', name: 'Scrap Golem', sprite: '🗿', topic: 'engineering', levelOffset: 0, hpPerLevel: 12 },
  'gear-wyrm': { id: 'gear-wyrm', name: 'Gear Wyrm', sprite: '🐍', topic: 'engineering', levelOffset: 1, hpPerLevel: 14 },
  'rust-fiend': { id: 'rust-fiend', name: 'The Rust Fiend', sprite: '🤖', topic: 'engineering', levelOffset: 1, hpPerLevel: 20, isBoss: true },

  // --- Chromaria (creativity) ---
  'doodle-imp': { id: 'doodle-imp', name: 'Doodle Imp', sprite: '👻', topic: 'creativity', levelOffset: -1, hpPerLevel: 10 },
  'off-key-bird': { id: 'off-key-bird', name: 'Off-Key Bird', sprite: '🐦', topic: 'creativity', levelOffset: 0, hpPerLevel: 12 },
  'pixel-witch': { id: 'pixel-witch', name: 'Pixel Witch', sprite: '🦹', topic: 'creativity', levelOffset: 1, hpPerLevel: 14, behavior: 'trickster' },
  'gray-fiend': { id: 'gray-fiend', name: 'The Gray Fiend', sprite: '🌑', topic: 'creativity', levelOffset: 1, hpPerLevel: 20, isBoss: true },

  // --- Whispering Woods (nature & animals) — critters + the warden boss (#58) ---
  'mossback-cub': { id: 'mossback-cub', name: 'Mossback Cub', sprite: '🐻', topic: 'nature', levelOffset: -1, hpPerLevel: 10 },
  'thornhare': { id: 'thornhare', name: 'Thornhare', sprite: '🐰', topic: 'nature', levelOffset: 0, hpPerLevel: 12 },
  'grumblebee': { id: 'grumblebee', name: 'Grumblebee', sprite: '🐝', topic: 'nature', levelOffset: 1, hpPerLevel: 13 },
  'thicket-warden': { id: 'thicket-warden', name: 'The Thicket Warden', sprite: '🦌', topic: 'nature', levelOffset: 1, hpPerLevel: 16, isBoss: true },

  // --- Starfall Coast (space) — critters + the warden boss (#58) ---
  'tide-sprite': { id: 'tide-sprite', name: 'Tide Sprite', sprite: '🌊', topic: 'space', levelOffset: -1, hpPerLevel: 10 },
  'meteor-mite': { id: 'meteor-mite', name: 'Meteor Mite', sprite: '☄️', topic: 'space', levelOffset: 0, hpPerLevel: 12 },
  'moon-moth': { id: 'moon-moth', name: 'Moon Moth', sprite: '🌙', topic: 'space', levelOffset: 1, hpPerLevel: 13, behavior: 'healer' },
  'tide-colossus': { id: 'tide-colossus', name: 'The Tide Colossus', sprite: '🐳', topic: 'space', levelOffset: 1, hpPerLevel: 16, isBoss: true },

  // --- Clockwork Depths (time & history) — critters + the warden boss (#58) ---
  'cog-sprite': { id: 'cog-sprite', name: 'Cog Sprite', sprite: '⚙️', topic: 'history', levelOffset: -1, hpPerLevel: 10 },
  'hourglass-imp': { id: 'hourglass-imp', name: 'Hourglass Imp', sprite: '⏳', topic: 'history', levelOffset: 0, hpPerLevel: 12 },
  'relic-golem': { id: 'relic-golem', name: 'Relic Golem', sprite: '🗿', topic: 'history', levelOffset: 1, hpPerLevel: 13, behavior: 'shielded' },
  'clockwork-titan': { id: 'clockwork-titan', name: 'The Clockwork Titan', sprite: '🦾', topic: 'history', levelOffset: 1, hpPerLevel: 16, isBoss: true },
};

/** The boss enemy id for a topic's zone. */
export function fiendFor(topic: Topic): EnemyDef {
  const def = Object.values(ENEMY_DEFS).find((e) => e.isBoss && e.topic === topic);
  if (!def) throw new Error(`No fiend defined for topic ${topic}`);
  return def;
}

/**
 * Resolves a placed enemy into a battle-ready instance, scaled to the
 * player's age. `instanceId` keys session defeat-tracking.
 */
export function spawnEnemy(
  defId: string,
  zoneId: ZoneId,
  placementKey: string,
  age: number,
): BattleEnemy {
  const def = ENEMY_DEFS[defId];
  if (!def) throw new Error(`Unknown enemy def: ${defId}`);
  const level = clampLevel(ageToStartLevel(age) + def.levelOffset);
  // Bosses live only in crystal topics, so fiendName is always set there; the
  // fallback keeps non-crystal enemies (and any future boss) safe.
  const name = def.isBoss ? (topicInfo(def.topic).fiendName ?? def.name) : def.name;
  return {
    id: def.id,
    instanceId: `${zoneId}:${placementKey}`,
    name,
    sprite: def.sprite,
    spriteId: def.spriteId,
    topic: def.topic,
    level,
    maxHp: (def.isBoss ? BOSS_HP_BASE : HP_BASE) + level * def.hpPerLevel,
    zoneId,
    isBoss: def.isBoss ?? false,
    coins: def.isBoss ? bossCoinDrop(level) : enemyCoinDrop(level),
    behavior: def.behavior,
  };
}
