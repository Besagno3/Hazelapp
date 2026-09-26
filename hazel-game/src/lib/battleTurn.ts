import type { EnemyBehavior, FightStyle, PowerUps } from '../types';
import { CHARGE_MAX } from '../content/abilities';
import { POTION_HEAL, SPARK_CHARGE, type ConsumableId } from '../content/items';
import type { Spell } from '../content/spells';
import {
  bossPhase,
  defendReduction,
  enemyAttack,
  healerMends,
  healerRegen,
} from './battleMath';

/**
 * Pure turn resolution for the command battle (#44, #69b, #70). Every rule
 * that changes the numbers of a fight lives here; `BattleArena` only picks
 * the next screen and plays the animations.
 *
 * Each resolver takes the combat state *as it is right now* and returns the
 * next state plus what happened. The arena reads the state from the store at
 * the moment a command resolves (never from a render-captured closure) and
 * writes the result back immediately — that is what closes the #70 tap-race,
 * where a delayed HP write could clobber a potion heal.
 */
export interface CombatState {
  playerHp: number;
  playerMaxHp: number;
  enemyHp: number;
  enemyMaxHp: number;
  /** Spell charge (◆), 0..CHARGE_MAX. */
  charge: number;
  /** The hero's next incoming hit is fully blocked (Guard / Aegis / Ward). */
  guarded: boolean;
  /** Shielded archetype: the first landed hit is absorbed and breaks it. */
  enemyShielded: boolean;
  /** Highest boss enrage phase already announced (0 = calm). */
  lastPhase: number;
}

/** Charge after answering a question — each correct answer fills one ◆. */
export function chargeAfterAnswer(charge: number, correct: boolean): number {
  return correct ? Math.min(CHARGE_MAX, charge + 1) : charge;
}

// --- Hero strikes (Attack + offensive spells) ---------------------------------

export type HeroHitOutcome = 'shield-broken' | 'hit' | 'defeated';

export interface HeroHitResult {
  state: CombatState;
  outcome: HeroHitOutcome;
  /** Damage actually taken by the enemy (0 when a shield absorbed it). */
  dealt: number;
  /** Charge given back because a shield absorbed an offensive spell. */
  refunded: number;
  /** A boss enrage phase crossed by this hit (announce it), else null. */
  newPhase: 1 | 2 | null;
}

/**
 * The hero lands `dmg` on the enemy. A shielded enemy absorbs the first landed
 * hit (any hit — even a glancing blow shatters it); offensive spells pass
 * `refundCharge` so a shield-absorbed cast gives the charge back — a correct
 * super-hard answer must never buy less than a free glancing blow would.
 */
export function resolveHeroHit(
  s: CombatState,
  dmg: number,
  opts: { isBoss: boolean; refundCharge?: number },
): HeroHitResult {
  const refundCharge = opts.refundCharge ?? 0;
  if (s.enemyShielded && dmg > 0) {
    return {
      state: {
        ...s,
        enemyShielded: false,
        charge: Math.min(CHARGE_MAX, s.charge + refundCharge),
      },
      outcome: 'shield-broken',
      dealt: 0,
      refunded: refundCharge,
      newPhase: null,
    };
  }
  const enemyHp = Math.max(0, s.enemyHp - dmg);
  const dealt = s.enemyHp - enemyHp;
  if (enemyHp <= 0) {
    return { state: { ...s, enemyHp }, outcome: 'defeated', dealt, refunded: 0, newPhase: null };
  }
  let lastPhase = s.lastPhase;
  let newPhase: 1 | 2 | null = null;
  if (opts.isBoss) {
    const p = bossPhase(enemyHp, s.enemyMaxHp);
    if (p > lastPhase) {
      lastPhase = p;
      newPhase = p as 1 | 2;
    }
  }
  return { state: { ...s, enemyHp, lastPhase }, outcome: 'hit', dealt, refunded: 0, newPhase };
}

// --- Enemy turn ----------------------------------------------------------------

export interface EnemyTurnInput {
  /** Whether the hero answered the defend question correctly. */
  wasCorrect: boolean;
  level: number;
  isBoss: boolean;
  behavior?: EnemyBehavior;
  style: FightStyle;
  powerUps: PowerUps;
}

export interface EnemyTurnResult {
  state: CombatState;
  /** Damage the hero took (0 = fully blocked). */
  dmg: number;
  /** HP the healer archetype mended at the end of its turn (0 = none). */
  mended: number;
  /** The hero is out of HP. */
  heroDown: boolean;
}

/**
 * The enemy's counterattack. A standing guard blocks it completely (and is
 * spent); otherwise a correct defend answer softens it. Boss damage scales
 * with the enrage phase at the moment it swings. A healer-archetype enemy
 * then mends itself while below half HP — rewards pressing the attack.
 */
export function resolveEnemyTurn(s: CombatState, input: EnemyTurnInput): EnemyTurnResult {
  const phase = input.isBoss ? bossPhase(s.enemyHp, s.enemyMaxHp) : 0;
  const raw = enemyAttack(input.level, input.isBoss, phase);
  const dmg = s.guarded
    ? 0
    : Math.max(0, raw - defendReduction(input.wasCorrect, input.style, input.powerUps));

  let enemyHp = s.enemyHp;
  if (input.behavior === 'healer' && healerMends(s.enemyHp, s.enemyMaxHp)) {
    enemyHp = Math.min(s.enemyMaxHp, s.enemyHp + healerRegen(s.enemyMaxHp));
  }
  const playerHp = Math.max(0, s.playerHp - dmg);
  return {
    state: { ...s, playerHp, enemyHp, guarded: false },
    dmg,
    mended: enemyHp - s.enemyHp,
    heroDown: playerHp <= 0,
  };
}

// --- Spells ----------------------------------------------------------------------

export type SpellResult =
  | { kind: 'fizzle'; state: CombatState }
  | { kind: 'heal'; state: CombatState; healed: number }
  | { kind: 'shield'; state: CombatState; healed: number }
  /** Offensive spell: charge is spent; feed `multiplier` into spellDamage → resolveHeroHit. */
  | { kind: 'strike'; state: CombatState; multiplier: number };

/**
 * A spell's super-hard question resolved. A miss never punishes effort: the
 * charge is safe and the spell just fizzles. A landed cast spends its cost.
 */
export function resolveSpell(s: CombatState, spell: Spell, wasCorrect: boolean): SpellResult {
  if (!wasCorrect) return { kind: 'fizzle', state: s };
  const spent: CombatState = { ...s, charge: Math.max(0, s.charge - spell.cost) };
  const effect = spell.effect;
  if (effect.kind === 'heal') {
    const playerHp = Math.min(s.playerMaxHp, s.playerHp + effect.amount);
    return { kind: 'heal', state: { ...spent, playerHp }, healed: playerHp - s.playerHp };
  }
  if (effect.kind === 'shield') {
    const playerHp = Math.min(s.playerMaxHp, s.playerHp + effect.heal);
    return {
      kind: 'shield',
      state: { ...spent, playerHp, guarded: true },
      healed: playerHp - s.playerHp,
    };
  }
  return { kind: 'strike', state: spent, multiplier: effect.multiplier };
}

// --- Battle items ----------------------------------------------------------------

/** Why a battle item can't be used right now (null = usable). */
export function itemBlocked(s: CombatState, id: ConsumableId, count: number): string | null {
  if (count <= 0) return 'None left';
  if ((id === 'potion' || id === 'elixir') && s.playerHp >= s.playerMaxHp) return 'HP is full';
  if (id === 'spark' && s.charge >= CHARGE_MAX) return 'Charge is full';
  if (id === 'ward' && s.guarded) return 'Already warded';
  return null;
}

export interface ItemResult {
  state: CombatState;
  healed: number;
  chargeGained: number;
}

/** Apply a battle item's effect (the caller spends it from the save). */
export function resolveItem(s: CombatState, id: ConsumableId): ItemResult {
  if (id === 'potion' || id === 'elixir') {
    const playerHp = id === 'elixir' ? s.playerMaxHp : Math.min(s.playerMaxHp, s.playerHp + POTION_HEAL);
    return { state: { ...s, playerHp }, healed: playerHp - s.playerHp, chargeGained: 0 };
  }
  if (id === 'spark') {
    const charge = Math.min(CHARGE_MAX, s.charge + SPARK_CHARGE);
    return { state: { ...s, charge }, healed: 0, chargeGained: charge - s.charge };
  }
  if (id === 'ward') return { state: { ...s, guarded: true }, healed: 0, chargeGained: 0 };
  return { state: s, healed: 0, chargeGained: 0 };
}
