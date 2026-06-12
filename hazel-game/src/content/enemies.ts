import type { BattleEnemy, Topic, ZoneId } from '../types';
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
  topic: Topic;
  /** Question level = ageToStartLevel(age) + levelOffset, clamped 1-10. */
  levelOffset: number;
  /** maxHp = HP_BASE + level * hpPerLevel. */
  hpPerLevel: number;
  isBoss?: boolean;
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
  'pixel-witch': { id: 'pixel-witch', name: 'Pixel Witch', sprite: '🦹', topic: 'creativity', levelOffset: 1, hpPerLevel: 14 },
  'gray-fiend': { id: 'gray-fiend', name: 'The Gray Fiend', sprite: '🌑', topic: 'creativity', levelOffset: 1, hpPerLevel: 20, isBoss: true },
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
  const name = def.isBoss ? topicInfo(def.topic).fiendName : def.name;
  return {
    id: def.id,
    instanceId: `${zoneId}:${placementKey}`,
    name,
    sprite: def.sprite,
    topic: def.topic,
    level,
    maxHp: (def.isBoss ? BOSS_HP_BASE : HP_BASE) + level * def.hpPerLevel,
    zoneId,
    isBoss: def.isBoss ?? false,
    coins: def.isBoss ? bossCoinDrop(level) : enemyCoinDrop(level),
  };
}
