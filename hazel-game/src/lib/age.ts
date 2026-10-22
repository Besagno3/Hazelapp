import type { Profile, Topic } from '../types';

/** Whole-years age from a birth year + month (month is 1-12). */
export function calcAge(birthYear: number, birthMonth: number, now = new Date()): number {
  let age = now.getFullYear() - birthYear;
  // getMonth() is 0-11; birthMonth is 1-12. Not had this year's birth month yet → subtract 1.
  if (now.getMonth() + 1 < birthMonth) age -= 1;
  return Math.max(0, age);
}

/** Age used when no profile is loaded (e.g. the migration isn't applied yet). */
export const DEFAULT_AGE = 10;

/** Oldest age questions are pitched at; anyone older plays as this age. */
export const MAX_PLAYER_AGE = 18;

/**
 * Youngest age a topic start keeps (`profiles.skill_starts`, migration 0026 —
 * its trigger keeps an age within this and `MAX_PLAYER_AGE`;
 * `playDays.limits.test` holds the two together, #182).
 */
export const MIN_START_AGE = 3;

/** The player's age (capped at MAX_PLAYER_AGE), falling back to DEFAULT_AGE without a profile. */
export function playerAge(profile: Pick<Profile, 'birthYear' | 'birthMonth'> | null): number {
  return profile ? Math.min(MAX_PLAYER_AGE, calcAge(profile.birthYear, profile.birthMonth)) : DEFAULT_AGE;
}

export const MIN_SKILL_LEVEL = 1;
export const MAX_SKILL_LEVEL = 10;

/**
 * Highest starting level (#156). Levels are relative to the child's age (4-6
 * is "right for a typical child of this age"), so a teen starts in that band
 * rather than at 10, the hardest for their age.
 */
export const MAX_START_LEVEL = 6;

/**
 * Starting skill level for a brand-new player, derived from age.
 * A 6-year-old starts at level 1, rising one a year to 6 at 11 and older.
 */
export function ageToStartLevel(age: number): number {
  return clampLevel(Math.min(MAX_START_LEVEL, age - 5));
}

/** Keep a skill level within the valid range. */
export function clampLevel(level: number): number {
  return Math.min(MAX_SKILL_LEVEL, Math.max(MIN_SKILL_LEVEL, Math.round(level)));
}

/** Skill level for a topic, falling back to the age-based start level. */
export function skillLevelFor(
  skillLevels: Partial<Record<Topic, number>>,
  topic: Topic,
  age: number,
): number {
  return skillLevels[topic] ?? ageToStartLevel(age);
}

/** Longest run of consecutive correct answers. */
function longestCorrectStreak(answers: boolean[]): number {
  let max = 0;
  let run = 0;
  for (const ok of answers) {
    run = ok ? run + 1 : 0;
    if (run > max) max = run;
  }
  return max;
}

/**
 * The persistent skill level after a round. Consecutive correct answers raise
 * it — a flawless run climbs fast; a strong run climbs by one. A weak round
 * lowers it slowly (never more than one level per round). Clamped to range.
 */
export function nextSkillLevel(current: number, answers: boolean[]): number {
  if (answers.length === 0) return clampLevel(current);
  const total = answers.length;
  const correct = answers.filter(Boolean).length;
  const streak = longestCorrectStreak(answers);

  let delta: number;
  if (streak === total) delta = 2; // flawless — climb fast
  else if (streak >= Math.ceil(total * 0.6)) delta = 1; // strong consecutive run
  else if (correct * 2 < total) delta = -1; // struggled — ease off, slowly
  else delta = 0; // holding steady
  return clampLevel(current + delta);
}

/**
 * Skill level after a battle — same logic as `nextSkillLevel`, but battles
 * never *lower* the player's skill. NPCs scale to the player's age, not
 * their skill, so a tough loss shouldn't make the next quiz round easier
 * (that would punish the kid twice). Strong play still raises it. (#32)
 */
export function nextSkillLevelFromBattle(current: number, answers: boolean[]): number {
  return Math.max(clampLevel(current), nextSkillLevel(current, answers));
}

/**
 * The answers a level change rests on (#153): the bank questions' only —
 * starter questions repeat, six a band, so knowing them isn't a level — and
 * only while they're most of the `total` answers given. A short batch topped
 * up with starters can leave one or two, too few to judge: then the level
 * holds (one wrong would drop a round passed 4 of 5; one right would lift a
 * round failed 1 of 5 by two — review round 2).
 */
export function bankRamp(bankAnswers: boolean[], total: number): boolean[] {
  return bankAnswers.length * 2 > total ? bankAnswers : [];
}
