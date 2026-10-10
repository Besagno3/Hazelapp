import type { FightStyle, PowerUps } from '../types';
import { attackBonus, defenseBonus } from './powerups';
import { SPECIAL_MULTIPLIER } from '../content/abilities';
import { BASE_TIER, DANGER, type DangerTier } from '../content/regions';

/**
 * Battle math for the JRPG command battles (#37). Pure functions — all
 * tuning lives here. Kid-friendly rules: a wrong answer on Attack still
 * lands a glancing blow (effort is never worth zero), a wrong answer on a
 * Special just fizzles (never backfires).
 */

export const STYLE_ATTACK: Record<FightStyle, number> = {
  aggressive: 40,
  balanced: 30,
  defensive: 26,
  swift: 32,
  mystic: 26,
};

export const STYLE_BLOCK: Record<FightStyle, number> = {
  aggressive: 24,
  balanced: 30,
  defensive: 40,
  swift: 28,
  mystic: 30,
};

/**
 * Spell power: what offensive spells and Pair Attacks scale from. The original
 * three heroes' equals their attack (so their spells hit exactly as before); a
 * mystic's (Nyx's Spell Power) is the highest of all, though her Attack is the
 * weakest.
 */
export const STYLE_MAGIC: Record<FightStyle, number> = {
  aggressive: 40,
  balanced: 30,
  defensive: 26,
  swift: 32,
  mystic: 50,
};

/** Skye's Counter Strike: a share of her attack power, struck back after a defend answered right. */
export const COUNTER_SHARE = 0.4;

/** Which hero types strike back after a defend answered right. */
const COUNTERS: Record<FightStyle, boolean> = {
  aggressive: false,
  balanced: false,
  defensive: false,
  swift: true,
  mystic: false,
};

/** Fraction of attack damage dealt on a wrong answer (glancing blow). */
const GLANCING = 0.25;

export function attackDamage(correct: boolean, style: FightStyle, powerUps: PowerUps): number {
  const base = STYLE_ATTACK[style] + attackBonus(powerUps);
  return correct ? base : Math.round(base * GLANCING);
}

/** Damage of a landed Special Attack (the question was answered correctly). */
export function specialDamage(style: FightStyle, powerUps: PowerUps): number {
  return Math.round((STYLE_ATTACK[style] + attackBonus(powerUps)) * SPECIAL_MULTIPLIER);
}

/**
 * Damage of a landed offensive spell — the hero's spell power (`STYLE_MAGIC`)
 * scaled by the spell's own multiplier (see `src/content/spells.ts`).
 */
export function spellDamage(style: FightStyle, powerUps: PowerUps, multiplier: number): number {
  return Math.round((STYLE_MAGIC[style] + attackBonus(powerUps)) * multiplier);
}

/**
 * Counter Strike (Skye, swift): the blow she strikes back after answering a
 * defend question right — 0 for heroes who don't counter.
 */
export function counterDamage(style: FightStyle, powerUps: PowerUps): number {
  return COUNTERS[style] ? Math.round((STYLE_ATTACK[style] + attackBonus(powerUps)) * COUNTER_SHARE) : 0;
}

/**
 * A companion's strike (Ember, Pip, Wisp — see `content/companion.ts`). Like
 * Attack, a wrong answer still lands a glancing blow; power 0 (an egg) can't
 * fight.
 */
export function companionAttackDamage(correct: boolean, power: number): number {
  return correct ? power : Math.round(power * GLANCING);
}

/**
 * Damage of a landed Pair Attack: the hero's spell power AND the companion's
 * power combined, then scaled by the combo's multiplier — so it always beats
 * a solo spell of the same cost, for every hero type.
 */
export function pairDamage(
  style: FightStyle,
  powerUps: PowerUps,
  companionPower: number,
  multiplier: number,
): number {
  return Math.round((STYLE_MAGIC[style] + attackBonus(powerUps) + companionPower) * multiplier);
}

/**
 * Raw enemy attack power; bosses hit harder and enrage by phase, and enemies
 * in far regions hit harder (`DANGER[tier].attack`, #75 item 12).
 */
export function enemyAttack(level: number, isBoss: boolean, phase: number, tier: DangerTier = BASE_TIER): number {
  return Math.round((16 + level * 3) * (isBoss ? 1.3 : 1) * (1 + phase * 0.15) * DANGER[tier].attack);
}

/** Bonus XP for beating an enemy: its level's, scaled by where it roams (#75 item 12). */
export function defeatXp(baseXp: number, tier: DangerTier = BASE_TIER): number {
  return Math.round(baseXp * DANGER[tier].xp);
}

/**
 * Damage blocked when defending: a correct answer blocks style + power-up
 * worth; a wrong answer still gets half the Iron Guard passive.
 */
export function defendReduction(correct: boolean, style: FightStyle, powerUps: PowerUps): number {
  if (correct) return STYLE_BLOCK[style] + defenseBonus(powerUps);
  return Math.round(defenseBonus(powerUps) / 2);
}

/** Healer archetype (Wave 0.5): fraction of max HP mended per enemy turn. */
export const HEALER_REGEN_RATE = 0.1;
/**
 * The most a healer mends in one turn — the biggest mend before regions
 * (a level-10 healer's 200 HP), so a far region's beefier healer (#75 item 12)
 * still can't out-mend a correctly answered hit (enemies.test).
 */
export const HEALER_REGEN_MAX = 20;

/** HP a healer-archetype enemy recovers at the end of its turn (below half HP). */
export function healerRegen(maxHp: number): number {
  return Math.min(HEALER_REGEN_MAX, Math.round(maxHp * HEALER_REGEN_RATE));
}

/** Whether a healer-archetype enemy mends this turn (hurt below half, alive). */
export function healerMends(hp: number, maxHp: number): boolean {
  return hp > 0 && hp < maxHp / 2;
}

/** Boss enrage phase from remaining HP: 0 (calm) → 2 (furious). */
export function bossPhase(hp: number, maxHp: number): 0 | 1 | 2 {
  if (hp > (2 / 3) * maxHp) return 0;
  if (hp > (1 / 3) * maxHp) return 1;
  return 2;
}

/** Bonus XP on top of npcDefeatXp for felling a Fiend. */
export const BOSS_XP_BONUS = 100;
