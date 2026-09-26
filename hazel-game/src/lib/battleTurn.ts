import type { EnemyBehavior, FightStyle, PowerUps } from '../types';
import type { ConsumableId } from '../content/items';
import { bossPhase, defendReduction, enemyAttack, healerMends, healerRegen } from './battleMath';

/**
 * Pure battle-turn resolution (#75 follow-up). BattleArena decides WHAT the
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
  knockedOut: boolean;
}

export function resolveEnemyAttack(i: EnemyAttackInput): EnemyAttackResult {
  const raw = Math.round(
    enemyAttack(i.level, i.isBoss, i.phase) * (i.intent === 'power' ? POWER_MULTIPLIER : 1),
  );
  const dmg = i.guarded ? 0 : Math.max(0, raw - defendReduction(i.wasCorrect, i.style, i.powerUps));
  const newPlayerHp = Math.max(0, i.playerHp - dmg);
  let newEnemyHp = i.enemyHp;
  if (i.behavior === 'healer' && healerMends(i.enemyHp, i.enemyMaxHp)) {
    newEnemyHp = Math.min(i.enemyMaxHp, i.enemyHp + healerRegen(i.enemyMaxHp));
  }
  return { dmg, newPlayerHp, newEnemyHp, mended: newEnemyHp - i.enemyHp, knockedOut: newPlayerHp <= 0 };
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
