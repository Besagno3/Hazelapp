import type { BattleEnemy, EnemyBehavior, FightStyle, PowerUps } from '../types';
import { CHARGE_MAX } from '../content/abilities';
import { POTION_HEAL, SNACK_HEAL, SPARK_CHARGE, TEA_DAMAGE_MULT, type ConsumableId } from '../content/items';
import type { Spell } from '../content/spells';
import { BASE_TIER, DANGER, type DangerTier } from '../content/regions';
import {
  bossPhase,
  defendReduction,
  enemyAttack,
  healerMends,
  healerRegen,
} from './battleMath';
import { clampLevel, nextSkillLevelFromBattle } from './age';

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
 *
 * Alongside the resolvers live the battle's other rules (#92–#98): enemy
 * intents (telegraphed power blows), answer streaks, topic weakness, mercy,
 * victory rewards, the age-based defend countdown and the speed trigger.
 * Companion / Pair Attack damage is in `battleMath`.
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
  /** Mirror Charm: the next enemy hit is blocked AND bounced back at it. */
  mirrored: boolean;
  /** Focus Tea: the next landed Attack deals TEA_DAMAGE_MULT× damage. */
  focused: boolean;
  /** Lucky Clover: a win pays CLOVER_COIN_MULT× coins. */
  lucky: boolean;
  /** Forget-Me-Knot (#75 item 14e): the next wrong answer gets a second try. */
  knotted: boolean;
}

/**
 * A boss enrage phase crossed by the enemy dropping to `enemyHp` (from any
 * damage source — strikes or Mirror bounces), or null. Each phase is
 * announced once; a defeated enemy announces nothing.
 */
function phaseCrossed(s: CombatState, enemyHp: number, isBoss: boolean): { lastPhase: number; newPhase: 1 | 2 | null } {
  if (!isBoss || enemyHp <= 0) return { lastPhase: s.lastPhase, newPhase: null };
  const p = bossPhase(enemyHp, s.enemyMaxHp);
  return p > s.lastPhase ? { lastPhase: p, newPhase: p as 1 | 2 } : { lastPhase: s.lastPhase, newPhase: null };
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
  const { lastPhase, newPhase } = phaseCrossed(s, enemyHp, opts.isBoss);
  return { state: { ...s, enemyHp, lastPhase }, outcome: 'hit', dealt, refunded: 0, newPhase };
}

/**
 * Focus Tea on a basic Attack: a landed hit deals TEA_DAMAGE_MULT× and spends
 * the focus. Against a shielded foe the focus waits — the shield would
 * swallow the doubled hit (#80 review fix).
 */
export function applyFocus(s: CombatState, dmg: number): { state: CombatState; dmg: number; note: string } {
  if (!s.focused || dmg <= 0) return { state: s, dmg, note: '' };
  if (s.enemyShielded) return { state: s, dmg, note: ' 🍵 (Your focus holds for the next swing!)' };
  return { state: { ...s, focused: false }, dmg: dmg * TEA_DAMAGE_MULT, note: ' 🍵 Focused — double damage!' };
}

// --- Enemy intents (telegraphed power moves) --------------------------------------

/**
 * What the enemy does on its turn: a normal `attack`, `charge` (gathers power —
 * no attack this turn, a warning is shown), or `power` (the charged blow,
 * POWER_MULTIPLIER × damage — Guard / Aegis / Rainbow Ward still block it).
 */
export type EnemyIntent = 'attack' | 'charge' | 'power';

export const POWER_MULTIPLIER = 2;
/**
 * Chance a regular enemy starts charging on a given turn (never turn 0) — the
 * balance before regions; far regions charge more often (`DANGER[tier].chargeChance`).
 */
export const CHARGE_CHANCE = DANGER[BASE_TIER].chargeChance;
/** Bosses charge on a fixed rhythm — every BOSS_CHARGE_EVERY-th turn. */
export const BOSS_CHARGE_EVERY = 3;

/**
 * The enemy's next intent. `turn` counts enemy turns from 0; `roll` ∈ [0, 1)
 * (defaults to Math.random; fixed in tests). A charge is ALWAYS followed by its
 * power blow, and a power blow is never followed by another charge. A regular
 * enemy in a far region charges more often (`tier`, #75 item 12); a boss
 * keeps its rhythm anywhere.
 */
export function nextIntent(
  prev: EnemyIntent | null,
  turn: number,
  isBoss: boolean,
  roll: number = Math.random(),
  tier: DangerTier = BASE_TIER,
): EnemyIntent {
  if (prev === 'charge') return 'power';
  if (prev === 'power' || turn === 0) return 'attack';
  if (isBoss) return turn % BOSS_CHARGE_EVERY === BOSS_CHARGE_EVERY - 1 ? 'charge' : 'attack';
  return roll < DANGER[tier].chargeChance ? 'charge' : 'attack';
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

// --- Enemy turn ----------------------------------------------------------------

export interface EnemyTurnInput {
  /** Whether the hero answered the defend question correctly. */
  wasCorrect: boolean;
  /** A charged `power` blow hits POWER_MULTIPLIER× (Guard / Ward / Mirror still stop it). */
  intent?: 'attack' | 'power';
  level: number;
  isBoss: boolean;
  behavior?: EnemyBehavior;
  /** Danger tier of where it roams (#75 item 12): far regions hit harder. */
  tier?: DangerTier;
  style: FightStyle;
  powerUps: PowerUps;
}

export interface EnemyTurnResult {
  state: CombatState;
  /** Damage the hero took (0 = fully blocked). */
  dmg: number;
  /** Damage a Mirror Charm bounced back onto the enemy. */
  reflected: number;
  /** A Mirror Charm bounce shattered the enemy's shield instead of hurting it. */
  shieldShattered: boolean;
  /** HP the healer archetype mended at the end of its turn (0 = none). */
  mended: number;
  /** The hero is out of HP. */
  heroDown: boolean;
  /** A Mirror Charm bounce defeated the enemy (checked before heroDown). */
  enemyDown: boolean;
  /** A boss enrage phase crossed by a bounce, else null. */
  newPhase: 1 | 2 | null;
}

/**
 * The enemy's counterattack. A Mirror Charm blocks it AND bounces the full
 * hit back (a shielded foe's shield takes the bounce and shatters — any
 * landed hit does); the charm is spent, a standing guard is kept. A charged
 * `power` blow (see nextIntent) hits POWER_MULTIPLIER× harder. Otherwise a
 * standing guard blocks it completely (and is spent), or a correct defend
 * answer softens it. Boss damage scales with the enrage phase at the moment
 * it swings. A surviving healer-archetype enemy then mends itself while below
 * half HP — rewards pressing the attack.
 */
export function resolveEnemyTurn(s: CombatState, input: EnemyTurnInput): EnemyTurnResult {
  const phase = input.isBoss ? bossPhase(s.enemyHp, s.enemyMaxHp) : 0;
  const raw = Math.round(enemyAttack(input.level, input.isBoss, phase, input.tier) * (input.intent === 'power' ? POWER_MULTIPLIER : 1));

  let next: CombatState = { ...s };
  let dmg: number;
  let reflected = 0;
  let shieldShattered = false;
  if (s.mirrored) {
    dmg = 0;
    next.mirrored = false;
    if (s.enemyShielded && raw > 0) {
      shieldShattered = true;
      next.enemyShielded = false;
    } else {
      reflected = raw;
    }
  } else if (s.guarded) {
    dmg = 0;
    next.guarded = false;
  } else {
    dmg = Math.max(0, raw - defendReduction(input.wasCorrect, input.style, input.powerUps));
  }

  let enemyHp = Math.max(0, s.enemyHp - reflected);
  reflected = s.enemyHp - enemyHp;
  const afterBounce = enemyHp;
  if (enemyHp > 0 && input.behavior === 'healer' && healerMends(enemyHp, s.enemyMaxHp)) {
    enemyHp = Math.min(s.enemyMaxHp, enemyHp + healerRegen(s.enemyMaxHp));
  }
  const playerHp = Math.max(0, s.playerHp - dmg);
  const { lastPhase, newPhase } = phaseCrossed(s, afterBounce, input.isBoss);
  next = { ...next, playerHp, enemyHp, lastPhase };
  return {
    state: next,
    dmg,
    reflected,
    shieldShattered,
    mended: enemyHp - afterBounce,
    heroDown: playerHp <= 0,
    enemyDown: enemyHp <= 0,
    newPhase,
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
  if (id === 'snack' && s.playerHp >= s.playerMaxHp && s.charge >= CHARGE_MAX) return 'HP and charge are full';
  if (id === 'coil' && s.charge >= CHARGE_MAX) return 'Charge is full';
  if (id === 'mirror' && s.mirrored) return 'Mirror is up';
  if (id === 'tea' && s.focused) return 'Already focused';
  if (id === 'clover' && s.lucky) return 'Already lucky';
  if (id === 'knot' && s.knotted) return 'Already tied on';
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
  if (id === 'snack') {
    const playerHp = Math.min(s.playerMaxHp, s.playerHp + SNACK_HEAL);
    const charge = Math.min(CHARGE_MAX, s.charge + 1);
    return { state: { ...s, playerHp, charge }, healed: playerHp - s.playerHp, chargeGained: charge - s.charge };
  }
  if (id === 'coil') return { state: { ...s, charge: CHARGE_MAX }, healed: 0, chargeGained: CHARGE_MAX - s.charge };
  if (id === 'ward') return { state: { ...s, guarded: true }, healed: 0, chargeGained: 0 };
  if (id === 'mirror') return { state: { ...s, mirrored: true }, healed: 0, chargeGained: 0 };
  if (id === 'tea') return { state: { ...s, focused: true }, healed: 0, chargeGained: 0 };
  if (id === 'clover') return { state: { ...s, lucky: true }, healed: 0, chargeGained: 0 };
  if (id === 'knot') return { state: { ...s, knotted: true }, healed: 0, chargeGained: 0 };
  return { state: s, healed: 0, chargeGained: 0 };
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
 * level easier — no game over, and no wall either. Near home it still hits
 * just as hard (mercy helps with the learning); a critter that fights tougher
 * than that, far from home (#75 item 12), also fights like a Numbria one
 * from then on (`fightTier`), since there the fight may be the wall.
 */
export function mercyFor(losses: number, tier: DangerTier = BASE_TIER): { levelDrop: number; fightTier: DangerTier } {
  const merciful = losses >= MERCY_AFTER;
  return { levelDrop: merciful ? 1 : 0, fightTier: merciful && tier > BASE_TIER ? BASE_TIER : tier };
}

/** The mercy banner: what eased, in a child's words. */
export function mercyCallout(enemy: Pick<BattleEnemy, 'name' | 'eased'>): string {
  return enemy.eased !== undefined
    ? `Tough one last time? ${enemy.name} will go easier on you now — gentler hits and easier questions.`
    : `Tough one last time? ${enemy.name}'s questions will be a little easier now.`;
}

/**
 * Where losses to an enemy count (`battleStore.losses`): its kind AND the tier
 * it roams at, so losing to a Mighty doodle-imp by Chromaria doesn't soften
 * the gentle ones near home (and an eased fight still counts as the tough one).
 */
export function lossKey(enemy: Pick<BattleEnemy, 'id' | 'tier' | 'eased'>): string {
  return `${enemy.id}@${enemy.eased ?? enemy.tier ?? BASE_TIER}`;
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
