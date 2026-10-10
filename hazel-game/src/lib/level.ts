// Player level & XP — overall progression, distinct from the per-topic skill
// ramp (lib/age.ts). The level is saved (`profiles.level`) along with the XP
// earned toward the next one (`profiles.level_xp`), so retuning the curve
// never takes a level away. `profiles.xp` stays the lifetime total.

import type { Profile } from '../types';

/** XP awarded per correct answer, in a quiz or a battle. */
export const XP_PER_CORRECT = 10;

/** XP needed to clear level 1. */
export const XP_BASE = 100;

/** Extra XP each level needs over the one before — a gentle, steady climb. */
export const XP_STEP = 25;

/** XP that existing players' levels were earned at, before levels were saved. */
const LEGACY_XP_PER_LEVEL = 100;

/** Bonus XP for defeating an NPC, scaled by the NPC's level. */
export function npcDefeatXp(npcLevel: number): number {
  return 50 + npcLevel * 10;
}

/** XP needed to advance from `level` to the next one: 100, 125, 150, … */
export function xpForLevel(level: number): number {
  return XP_BASE + (Math.max(1, level) - 1) * XP_STEP;
}

export interface LevelState {
  level: number;
  /** XP earned toward the next level. */
  levelXp: number;
}

/**
 * The player's saved level. A profile from before levels were saved has
 * only its total XP, so its level comes from the old flat 100-XP curve —
 * exactly what the player last saw, so nobody drops a level.
 */
export function levelState(profile: Pick<Profile, 'xp' | 'level' | 'levelXp'> | null): LevelState {
  if (!profile) return { level: 1, levelXp: 0 };
  if (profile.level != null && profile.levelXp != null) {
    return { level: Math.max(1, profile.level), levelXp: Math.max(0, profile.levelXp) };
  }
  const xp = Math.max(0, profile.xp);
  return {
    level: Math.floor(xp / LEGACY_XP_PER_LEVEL) + 1,
    levelXp: xp % LEGACY_XP_PER_LEVEL,
  };
}

/** Add XP to a level state, rolling over as many levels as it clears. */
export function gainXp(state: LevelState, amount: number): LevelState {
  let { level, levelXp } = state;
  levelXp += Math.max(0, amount);
  while (levelXp >= xpForLevel(level)) {
    levelXp -= xpForLevel(level);
    level++;
  }
  return { level, levelXp };
}

/** Whichever level state is further along. */
export function furthestLevel(a: LevelState, b: LevelState): LevelState {
  if (a.level !== b.level) return a.level > b.level ? a : b;
  return a.levelXp >= b.levelXp ? a : b;
}

/** Progress through the current level. */
export function xpProgress(state: LevelState): { into: number; needed: number; fraction: number } {
  const needed = xpForLevel(state.level);
  const into = Math.min(state.levelXp, needed);
  return { into, needed, fraction: into / needed };
}
