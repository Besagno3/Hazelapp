import type { EmberStage } from './story';

/**
 * Ember in battle (companion commands). Once hatched, Ember fights beside the
 * hero from the 🐉 Ember command:
 *
 * - **Ember Attack** — Ember strikes, resolved by a normal question like
 *   Attack. It hits a little softer than the hero but a correct answer stokes
 *   the spell gauge with an extra ◆ (`EMBER_BONUS_CHARGE`), so it's the "build
 *   up" move that sets up a Pair Attack.
 * - **Pair Attacks** — hero and Ember unleash a special together. Like spells,
 *   each spends charge and needs one *super-hard* answer (a miss fizzles, the
 *   charge is safe), but the hero's AND Ember's power combine, so a Pair Attack
 *   always outdamages a solo spell of the same cost. Stronger combos unlock as
 *   Ember grows.
 *
 * Everything derives from Ember's stage (the save flags) — no new save field.
 */

/** Ember's basic strike power per growth stage (0 = still an egg, can't act). */
export const EMBER_POWER: Record<EmberStage, number> = {
  egg: 0,
  hatchling: 18,
  whelp: 26,
  dragon: 36,
};

/** Extra ◆ a correct Ember Attack adds on top of the usual +1 per correct answer. */
export const EMBER_BONUS_CHARGE = 1;

/** Ember's move name per stage — flavour for the command menu and messages. */
export const EMBER_MOVE: Record<EmberStage, { name: string; emoji: string }> = {
  egg: { name: 'Wobble', emoji: '🥚' },
  hatchling: { name: 'Ember Nip', emoji: '🔥' },
  whelp: { name: 'Flame Claw', emoji: '🔥' },
  dragon: { name: 'Dragon Tail', emoji: '🐲' },
};

export interface PairAttack {
  id: string;
  name: string;
  emoji: string;
  /** Kid-friendly one-liner for the Ember menu. */
  description: string;
  /** Charge (◆) consumed on a landed combo. */
  cost: number;
  /** Multiplier applied to the hero's + Ember's combined power. */
  multiplier: number;
  /** Ember stage needed to learn it. */
  unlock: Exclude<EmberStage, 'egg'>;
  /** Tailwind text color for the flash + labels. */
  color: string;
}

export const PAIR_ATTACKS: PairAttack[] = [
  {
    id: 'twin-strike',
    name: 'Twin Strike',
    emoji: '⚔️',
    description: 'You and Ember strike at the very same moment.',
    cost: 2,
    multiplier: 1.6,
    unlock: 'hatchling',
    color: 'text-orange-200',
  },
  {
    id: 'blazing-comet',
    name: 'Blazing Comet',
    emoji: '☄️',
    description: 'Ember flings you skyward — you crash down wrapped in fire!',
    cost: 3,
    multiplier: 2.0,
    unlock: 'whelp',
    color: 'text-amber-300',
  },
  {
    id: 'dragon-duet',
    name: 'Dragon Duet',
    emoji: '🌋',
    description: 'Ride Ember into the sky and dive together — the ultimate combo!',
    cost: 4,
    multiplier: 2.4,
    unlock: 'dragon',
    color: 'text-red-300',
  },
];

const STAGE_ORDER: EmberStage[] = ['egg', 'hatchling', 'whelp', 'dragon'];

/** Whether Ember can act in battle at all (hatched). */
export function emberCanFight(stage: EmberStage): boolean {
  return EMBER_POWER[stage] > 0;
}

/** The Pair Attacks Ember's current stage has unlocked, in menu order. */
export function pairAttacksKnown(stage: EmberStage): PairAttack[] {
  const rank = STAGE_ORDER.indexOf(stage);
  return PAIR_ATTACKS.filter((p) => STAGE_ORDER.indexOf(p.unlock) <= rank);
}
