// Player level & XP — overall progression, distinct from the per-topic skill
// ramp (lib/age.ts). Level is derived from total XP; nothing is stored but XP.

/** XP awarded per correct answer, in a quiz or a battle. */
export const XP_PER_CORRECT = 10;

// --- Leveling curve -------------------------------------------------------
// The XP needed to clear a level GROWS as the player levels up: each level
// costs the previous level's cost grown by a percentage, and that percentage
// starts high and tapers as levels climb (big jumps early, gentler later).
//
// Because level is derived from total XP (nothing but XP is stored), the
// per-level growth must be DETERMINISTIC — the same level always yields the
// same threshold, so the medallion / progress bar never jump on a reload. The
// randomness is therefore a pure function of the level index, seeded by a tiny
// LCG (same refresh-proof trick as `choicesForLevel` in lib/powerups.ts).

/** XP to clear the very first level (1 → 2). */
export const XP_BASE = 100;
/** Growth-% ceiling — the target growth rate at the earliest levels. */
export const MAX_GROWTH_PCT = 60;
/** Growth-% floor — the rate the growth tapers toward at high levels. */
export const MIN_GROWTH_PCT = 8;
/** How fast the growth-% target decays toward the floor each level. */
export const GROWTH_DECAY = 0.9;
/** ± points of deterministic random wobble around each level's target %. */
export const GROWTH_JITTER = 8;
/** Loop bound so a garbage/huge XP value can never spin forever. */
export const MAX_LEVEL = 500;

/** Deterministic 0..1 value seeded by `level` (tiny LCG, refresh-proof). */
function seededUnit(level: number): number {
  let seed = (level * 9301 + 49297) % 233280;
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
}

/**
 * The percentage the cost grows when advancing FROM `level` to the next.
 * High near level 1 (~MAX_GROWTH_PCT), decaying toward MIN_GROWTH_PCT, with a
 * deterministic per-level wobble so it feels randomized but stays stable.
 */
export function growthPct(level: number): number {
  const lvl = Math.max(1, level);
  const target =
    MIN_GROWTH_PCT + (MAX_GROWTH_PCT - MIN_GROWTH_PCT) * GROWTH_DECAY ** (lvl - 1);
  const jitter = (seededUnit(lvl) - 0.5) * 2 * GROWTH_JITTER;
  return Math.max(MIN_GROWTH_PCT, target + jitter);
}

/** XP required to go from `level` to `level + 1`. Strictly increasing. */
export function xpToAdvance(level: number): number {
  let cost = XP_BASE;
  for (let l = 1; l < Math.max(1, level); l++) {
    cost = Math.round(cost * (1 + growthPct(l) / 100));
  }
  return cost;
}

/** Cumulative XP needed to reach the start of `level` (level 1 = 0 XP). */
export function totalXpForLevel(level: number): number {
  let total = 0;
  let cost = XP_BASE;
  for (let l = 1; l < Math.max(1, level); l++) {
    total += cost;
    cost = Math.round(cost * (1 + growthPct(l) / 100));
  }
  return total;
}

/** Bonus XP for defeating an NPC, scaled by the NPC's level. */
export function npcDefeatXp(npcLevel: number): number {
  return 50 + npcLevel * 10;
}

/**
 * Walk the curve from level 1, accumulating each level's cost, until the next
 * threshold would exceed `xp`. Returns the current level plus the XP base and
 * span of that level — the single source of truth for the two consumers below.
 */
function locate(xp: number): { level: number; base: number; needed: number } {
  const x = Math.max(0, xp);
  let level = 1;
  let base = 0; // total XP to reach the start of `level`
  let needed = XP_BASE; // xpToAdvance(level)
  while (base + needed <= x && level < MAX_LEVEL) {
    base += needed;
    level += 1;
    needed = Math.round(needed * (1 + growthPct(level - 1) / 100));
  }
  return { level, base, needed };
}

/** Player level derived from total XP — level 1 at 0 XP. */
export function playerLevel(xp: number): number {
  return locate(xp).level;
}

/** Progress through the current level. */
export function xpProgress(xp: number): { into: number; needed: number; fraction: number } {
  const { base, needed } = locate(xp);
  const into = Math.max(0, xp) - base;
  return { into, needed, fraction: into / needed };
}
