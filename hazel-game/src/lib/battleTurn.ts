import type { EnemyBehavior, FightStyle, PowerUps } from '../types';
import type { ConsumableId } from '../content/items';
import { bossPhase, defendReduction, enemyAttack, healerMends, healerRegen } from './battleMath';
import { clampLevel, nextSkillLevelFromBattle } from './age';

/**
 * Pure battle-turn resolution (#83 follow-up). BattleArena decides WHAT the
 * player did; these functions decide what it DOES — damage, shields, enemy
 * intents, streaks, mercy, drops — so the rules are unit-tested and the
 * component only plays them back (animations, sounds, messages).
 */

// --- Hero / companion hits ------------------------------------------------------

export interface HeroHitInput {
  dmg: number;
  enemyHp: number;
  enemyMaxHp: number;
  /** Shielded archetype: the first landed hit shatters the shield instead. */
  shielded: boolean;
  isBoss: boolean;
  /** The boss phase already announced (so a crossing is reported once). */
  lastPhase: number;
}

export interface HeroHitResult {
  shieldBroke: boolean;
  newEnemyHp: number;
  defeated: boolean;
  /** The boss phase just crossed into, or null if none. */
  phaseCrossed: 1 | 2 | null;
}

export function resolveHeroHit(i: HeroHitInput): HeroHitResult {
  if (i.shielded && i.dmg > 0) {
    return { shieldBroke: true, newEnemyHp: i.enemyHp, defeated: false, phaseCrossed: null };
  }
  const newEnemyHp = Math.max(0, i.enemyHp - i.dmg);
  const defeated = newEnemyHp <= 0;
  let phaseCrossed: 1 | 2 | null = null;
  if (i.isBoss && !defeated) {
    const p = bossPhase(newEnemyHp, i.enemyMaxHp);
    if (p > i.lastPhase && p > 0) phaseCrossed = p as 1 | 2;
  }
  return { shieldBroke: false, newEnemyHp, defeated, phaseCrossed };
}

// --- Enemy intents (telegraphed power moves) --------------------------------------

/**
 * What the enemy does on its turn: a normal `attack`, `charge` (gathers power —
 * no attack this turn, a warning is shown), or `power` (the charged blow,
 * POWER_MULTIPLIER × damage — Guard / Aegis / Rainbow Ward still block it).
 */
export type EnemyIntent = 'attack' | 'charge' | 'power';

export const POWER_MULTIPLIER = 2;
/** Chance a regular enemy starts charging on a given turn (never turn 0). */
export const CHARGE_CHANCE = 0.2;
/** Bosses charge on a fixed rhythm — every BOSS_CHARGE_EVERY-th turn. */
export const BOSS_CHARGE_EVERY = 3;

/**
 * The enemy's next intent. `turn` counts enemy turns from 0; `roll` ∈ [0, 1)
 * (defaults to Math.random; fixed in tests). A charge is ALWAYS followed by its
 * power blow, and a power blow is never followed by another charge.
 */
export function nextIntent(
  prev: EnemyIntent | null,
  turn: number,
  isBoss: boolean,
  roll: number = Math.random(),
): EnemyIntent {
  if (prev === 'charge') return 'power';
  if (prev === 'power' || turn === 0) return 'attack';
  if (isBoss) return turn % BOSS_CHARGE_EVERY === BOSS_CHARGE_EVERY - 1 ? 'charge' : 'attack';
  return roll < CHARGE_CHANCE ? 'charge' : 'attack';
}

/** Named signature blows for bosses; everyone else "winds up a mighty blow". */
const POWER_MOVE_NAMES: Record<string, string> = {
  'null-fiend': 'Zero Crush',
  'smog-fiend': 'Choking Cloud',
  'rust-fiend': 'Rust Hammer',
  'gray-fiend': 'Colorless Wave',
  'thicket-warden': 'Bramble Charge',
  'tide-colossus': 'Tidal Slam',
  'clockwork-titan': 'Gear Grinder',
};

export function powerMoveName(enemyId: string): string {
  return POWER_MOVE_NAMES[enemyId] ?? 'Mighty Blow';
}

// --- Enemy attacks ----------------------------------------------------------------

export interface EnemyAttackInput {
  level: number;
  isBoss: boolean;
  phase: number;
  intent: 'attack' | 'power';
  /** A Guard / Aegis / Rainbow Ward is up — the blow is fully blocked. */
  guarded: boolean;
  /**
   * A Mirror Charm is up: the blow is blocked AND bounced back at the enemy
   * (a shielded enemy's shield takes the bounce and shatters instead).
   */
  mirrored?: boolean;
  /** The enemy's shield (shielded archetype) is still up. */
  enemyShielded?: boolean;
  /** The defend question was answered correctly. */
  wasCorrect: boolean;
  style: FightStyle;
  powerUps: PowerUps;
  behavior?: EnemyBehavior;
  playerHp: number;
  enemyHp: number;
  enemyMaxHp: number;
}

export interface EnemyAttackResult {
  dmg: number;
  newPlayerHp: number;
  newEnemyHp: number;
  /** HP a healer-archetype enemy mended at the end of its turn. */
  mended: number;
  /** Damage a Mirror Charm bounced back at the enemy. */
  reflected: number;
  /** The bounced blow shattered the enemy's shield (no damage to it). */
  shieldBroke: boolean;
  knockedOut: boolean;
  /** The bounced blow finished the enemy off (a win beats a knockout). */
  defeated: boolean;
}

export function resolveEnemyAttack(i: EnemyAttackInput): EnemyAttackResult {
  const raw = Math.round(
    enemyAttack(i.level, i.isBoss, i.phase) * (i.intent === 'power' ? POWER_MULTIPLIER : 1),
  );
  const shieldBroke = !!i.mirrored && !!i.enemyShielded && raw > 0;
  const reflected = i.mirrored && !shieldBroke ? raw : 0;
  const dmg = i.mirrored || i.guarded ? 0 : Math.max(0, raw - defendReduction(i.wasCorrect, i.style, i.powerUps));
  const newPlayerHp = Math.max(0, i.playerHp - dmg);
  const afterBounce = Math.max(0, i.enemyHp - reflected);
  let newEnemyHp = afterBounce;
  if (afterBounce > 0 && i.behavior === 'healer' && healerMends(afterBounce, i.enemyMaxHp)) {
    newEnemyHp = Math.min(i.enemyMaxHp, afterBounce + healerRegen(i.enemyMaxHp));
  }
  const defeated = newEnemyHp <= 0;
  return {
    dmg,
    newPlayerHp,
    newEnemyHp,
    mended: newEnemyHp - afterBounce,
    reflected,
    shieldBroke,
    knockedOut: !defeated && newPlayerHp <= 0,
    defeated,
  };
}

// --- Answer streaks -----------------------------------------------------------------

/** Streak length where the bonus starts, and where it maxes out. */
export const STREAK_START = 3;
export const STREAK_MAX = 5;

/** Damage multiplier for the current run of correct answers in a row. */
export function streakMultiplier(streak: number): number {
  if (streak >= STREAK_MAX) return 1.4;
  if (streak >= STREAK_START) return 1.2;
  return 1;
}

// --- Topic weakness ------------------------------------------------------------------

/** Damage multiplier when a Sage spell matches the enemy's topic. */
export const SUPER_EFFECTIVE = 1.5;

// --- Mercy after repeated losses --------------------------------------------------------

/** Losses to the same enemy before it eases off. */
export const MERCY_AFTER = 2;

/**
 * After MERCY_AFTER losses to the same kind of enemy its questions are one
 * level easier — no game over, and no wall either. The enemy still hits just
 * as hard: mercy helps with the learning, not the fight.
 */
export function mercyFor(losses: number): { levelDrop: number } {
  return { levelDrop: losses >= MERCY_AFTER ? 1 : 0 };
}

// --- Victory rewards ----------------------------------------------------------------------

/** Coin bonus multiplier the first time a kind of enemy is ever beaten. */
export const FIRST_WIN_BONUS = 0.5;

export function victoryCoins(baseCoins: number, killsBefore: number): number {
  return killsBefore === 0 ? Math.round(baseCoins * (1 + FIRST_WIN_BONUS)) : baseCoins;
}

/**
 * The item (if any) a beaten enemy drops. Bosses always drop a Honey Elixir;
 * regular enemies sometimes drop a staple. `roll` ∈ [0, 1) (defaults to Math.random).
 */
export function rollDrop(isBoss: boolean, roll: number = Math.random()): ConsumableId | null {
  if (isBoss) return 'elixir';
  if (roll < 0.18) return 'potion';
  if (roll < 0.28) return 'hint';
  if (roll < 0.34) return 'spark';
  return null;
}

// --- Defend countdown ------------------------------------------------------------

/** The countdown never goes below / above these, in ms. */
export const DEFEND_MIN_MS = 10_000;
export const DEFEND_MAX_MS = 25_000;
/** Mercy (a couple of losses to this enemy) also buys extra time. */
export const DEFEND_MERCY_BONUS_MS = 5_000;

/**
 * Time to answer a defend question before the blow lands, from the child's
 * age (from the sign-up birth date, so it shortens a little each birthday):
 * 25s at age 5, 1.5s less per year (≈19s at 9, 15s at 12), clamped 10–25s,
 * rounded to whole seconds, plus a bonus under mercy. Leveling up (XP) never
 * changes it.
 */
export function defendTimeMs(age: number, mercy = false): number {
  const seconds = Math.round(25 - 1.5 * (age - 5));
  const ms = Math.min(DEFEND_MAX_MS, Math.max(DEFEND_MIN_MS, seconds * 1000));
  return ms + (mercy ? DEFEND_MERCY_BONUS_MS : 0);
}

// --- Speed trigger: fast + correct raises the question level --------------------

/**
 * Two separate tracks per player: the **question level** per topic
 * (`profiles.skill_levels`, 1–10 — starts from the sign-up age, moves with
 * performance) is what sets difficulty; **XP / player level** only tracks
 * progress and power-ups. In battle, answering quickly AND correctly
 * FAST_STREAK times in a row raises the question level on the spot.
 */
export const FAST_STREAK = 5;
/** A battle can raise the question level by at most this much. */
export const MAX_SPEED_BOOST = 2;

/** An answer counts as quick within half the child's defend countdown (≈9.5s at 9). */
export function fastAnswerMs(age: number): number {
  return Math.round(defendTimeMs(age) / 2);
}

/**
 * Advance the run of quick correct answers. `ms` = time from the question
 * appearing to the pick (pass Infinity when a Hint Feather was used — a hinted
 * answer isn't evidence the questions are too easy). When the run reaches
 * FAST_STREAK (and the battle's boost isn't maxed) it `boosted`, and the run
 * starts over so the next step needs another full streak.
 */
export function speedStep(
  run: number,
  correct: boolean,
  ms: number,
  age: number,
  boost: number,
): { run: number; boosted: boolean } {
  if (!correct || ms > fastAnswerMs(age)) return { run: 0, boosted: false };
  const next = run + 1;
  if (next >= FAST_STREAK && boost < MAX_SPEED_BOOST) return { run: 0, boosted: true };
  return { run: Math.min(next, FAST_STREAK), boosted: false };
}

/**
 * The topic's question level after a battle: the usual battle ramp (never
 * lowers it — #32), but never below what the speed trigger already earned.
 */
export function skillAfterBattle(current: number, answers: boolean[], speedBoost: number): number {
  return Math.max(nextSkillLevelFromBattle(current, answers), clampLevel(current + speedBoost));
}
