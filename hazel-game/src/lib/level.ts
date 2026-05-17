// Player level & XP — overall progression, distinct from the per-topic skill
// ramp (lib/age.ts). Level is derived from total XP; nothing is stored but XP.

/** XP awarded per correct answer, in a quiz or a battle. */
export const XP_PER_CORRECT = 10;

/** Total XP that each player level spans. */
export const XP_PER_LEVEL = 100;

/** Bonus XP for defeating an NPC, scaled by the NPC's level. */
export function npcDefeatXp(npcLevel: number): number {
  return 50 + npcLevel * 10;
}

/** Player level derived from total XP — level 1 at 0 XP. */
export function playerLevel(xp: number): number {
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
}

/** Progress through the current level. */
export function xpProgress(xp: number): { into: number; needed: number; fraction: number } {
  const into = Math.max(0, xp) % XP_PER_LEVEL;
  return { into, needed: XP_PER_LEVEL, fraction: into / XP_PER_LEVEL };
}
