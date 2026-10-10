// Player level & XP — overall progression, distinct from the per-topic skill
// ramp (lib/age.ts). Level is derived from total XP; nothing is stored but XP.

/** XP awarded per correct answer, in a quiz or a battle. */
export const XP_PER_CORRECT = 10;

/**
 * XP needed to clear level 1. Each level after spans proportionally more:
 * level n takes `n * XP_BASE` XP to clear (100, 200, 300, …).
 */
export const XP_BASE = 100;

/** XP needed to advance from `level` to the next one. */
export function xpForLevel(level: number): number {
  return Math.max(1, level) * XP_BASE;
}

/** Total XP at which `level` begins — level 1 starts at 0. */
export function xpToReachLevel(level: number): number {
  const l = Math.max(1, level);
  return (XP_BASE * l * (l - 1)) / 2;
}

/** Bonus XP for defeating an NPC, scaled by the NPC's level. */
export function npcDefeatXp(npcLevel: number): number {
  return 50 + npcLevel * 10;
}

/** Player level derived from total XP — level 1 at 0 XP. */
export function playerLevel(xp: number): number {
  const total = Math.max(0, xp);
  let level = 1;
  while (xpToReachLevel(level + 1) <= total) level++;
  return level;
}

/** Progress through the current level. */
export function xpProgress(xp: number): { into: number; needed: number; fraction: number } {
  const level = playerLevel(xp);
  const into = Math.max(0, xp) - xpToReachLevel(level);
  const needed = xpForLevel(level);
  return { into, needed, fraction: into / needed };
}
