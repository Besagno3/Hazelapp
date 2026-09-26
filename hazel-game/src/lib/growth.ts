import type { Profile } from '../types';
import { ageToStartLevel, clampLevel, playerAge } from './age';
import { playerLevel } from './level';

/**
 * The one rule for how hard things are: **the child's age is the baseline**
 * (from the birth year/month given at sign-up — `playerAge` recomputes it, so
 * it moves up on every birthday), and **their player level nudges it up** as
 * they play. Enemies, battle questions, the Spire and the defend countdown all
 * read from here so the whole game grows with the kid at the same pace.
 * (Quiz rounds, gates and chests additionally track each topic's own skill
 * level — `skillLevelFor` — which also starts from age.)
 */

/** Player levels per +1 challenge step (Lv 1–5 → +0, 6–10 → +1, …). */
export const LEVELS_PER_STEP = 5;
/** Leveling up never adds more than this many steps on top of age. */
export const MAX_GROWTH_STEPS = 3;

/** How many challenge steps the player's level has earned above their age baseline. */
export function growthSteps(level: number): number {
  return Math.min(MAX_GROWTH_STEPS, Math.floor(Math.max(0, level - 1) / LEVELS_PER_STEP));
}

/** Challenge level (1–10) for enemies and battle questions: age baseline + growth. */
export function challengeLevel(age: number, level: number): number {
  return clampLevel(ageToStartLevel(age) + growthSteps(level));
}

/** The two inputs every scaler needs, from the loaded profile (defaults without one). */
export function playerStanding(profile: Pick<Profile, 'birthYear' | 'birthMonth' | 'xp'> | null): {
  age: number;
  level: number;
} {
  return { age: playerAge(profile), level: playerLevel(profile?.xp ?? 0) };
}
