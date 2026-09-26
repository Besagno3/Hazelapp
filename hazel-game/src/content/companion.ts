import type { SaveData } from '../types';
import type { EmberStage } from './story';
import { EMBER_SPRITE_IDS, EMBER_SPRITES } from './story';

/**
 * Battle companions. One companion fights beside the hero at a time, and the
 * 🔄 Swap command brings in another **without spending the turn** — swap, then
 * act. Each companion has:
 *
 * - **a strike** — a normal question like Attack, a little softer than the hero,
 *   plus a **perk** on a correct answer that makes it worth choosing:
 *   Ember stokes an extra ◆ (sets up combos), Pip "peeks" at the next question
 *   (one wrong answer crossed out), Wisp mends the hero.
 * - **Pair Attacks** — hero and companion unleash a special together. Like
 *   spells, each spends charge and needs one *super-hard* answer (a miss
 *   fizzles, the charge is safe), and their combined power means a Pair Attack
 *   always outdamages a solo spell of the same cost.
 *
 * Who is in the party derives from the save (Ember from the start; Pip and
 * Wisp once their quests are done) — no new save field.
 */

export const COMPANION_IDS = ['ember', 'pip', 'wisp'] as const;
export type CompanionId = (typeof COMPANION_IDS)[number];

/** What a correct companion strike adds on top of its damage. */
export type CompanionPerk = 'charge' | 'peek' | 'mend';

export interface CompanionDef {
  id: CompanionId;
  name: string;
  emoji: string;
  /** One word for the swap menu. */
  role: string;
  /** Kid-friendly line for the swap menu. */
  blurb: string;
  /** What a correct strike adds — shown under the strike in the companion menu. */
  perkLine: string;
  perk: CompanionPerk;
  /** Wind-up SFX for the companion's strike. */
  sound: 'roar' | 'attack' | 'spell';
  /** Save flag that brings them into the party (null = always there). */
  joinFlag: string | null;
  /** How they join — shown when they aren't in the party yet. */
  joinHint: string;
}

// --- Perk tuning --------------------------------------------------------------------

/** Extra ◆ a correct Ember strike adds on top of the usual +1 per correct answer. */
export const EMBER_BONUS_CHARGE = 1;
/** Wrong options Pip crosses out on the next question after a correct strike. */
export const PIP_PEEK_HIDES = 1;
/** HP Wisp mends after a correct strike. */
export const WISP_MEND = 20;

export const COMPANIONS: Record<CompanionId, CompanionDef> = {
  ember: {
    id: 'ember',
    name: 'Ember',
    emoji: '🐉',
    role: 'Striker',
    blurb: 'Hits hard and stokes an extra ◆ for combos.',
    perkLine: `Right answer: +${EMBER_BONUS_CHARGE}◆ toward a Pair Attack.`,
    perk: 'charge',
    sound: 'roar',
    joinFlag: null,
    joinHint: 'Always by your side.',
  },
  pip: {
    id: 'pip',
    name: 'Pip',
    emoji: '🧒',
    role: 'Helper',
    blurb: 'Peeks at the next question and crosses out a wrong answer.',
    perkLine: 'Right answer: Pip crosses out a wrong answer on your next question.',
    perk: 'peek',
    sound: 'attack',
    // Must match questDoneFlag() for "Pip's Lucky Marble" (companion.test checks).
    joinFlag: 'quest:pips-marble:done',
    joinHint: "Find Pip's Lucky Marble.",
  },
  wisp: {
    id: 'wisp',
    name: 'Wisp',
    emoji: '🧚',
    role: 'Healer',
    blurb: 'A glimmer of light that mends your wounds.',
    perkLine: `Right answer: Wisp heals you ${WISP_MEND} HP.`,
    perk: 'mend',
    sound: 'spell',
    // Must match questDoneFlag() for "The Darkened Moonwell".
    joinFlag: 'quest:grove-moonwell:done',
    joinHint: 'Light the Moonwell in the hidden grove.',
  },
};

// --- Ember (grows with the crystals) ---------------------------------------------

/** Ember's basic strike power per growth stage (0 = still an egg, can't act). */
export const EMBER_POWER: Record<EmberStage, number> = {
  egg: 0,
  hatchling: 18,
  whelp: 26,
  dragon: 36,
};

/** Ember's move name per stage — flavour for the command menu and messages. */
export const EMBER_MOVE: Record<EmberStage, { name: string; emoji: string }> = {
  egg: { name: 'Wobble', emoji: '🥚' },
  hatchling: { name: 'Ember Nip', emoji: '🔥' },
  whelp: { name: 'Flame Claw', emoji: '🔥' },
  dragon: { name: 'Dragon Tail', emoji: '🐲' },
};

const PIP_POWER = 16;
const WISP_POWER = 12;

/** Strike power of a companion (Ember's depends on its stage). */
export function companionPower(id: CompanionId, stage: EmberStage): number {
  if (id === 'ember') return EMBER_POWER[stage];
  return id === 'pip' ? PIP_POWER : WISP_POWER;
}

/** The companion's strike, named for the menu. */
export function companionMove(id: CompanionId, stage: EmberStage): { name: string; emoji: string } {
  if (id === 'ember') return EMBER_MOVE[stage];
  return id === 'pip' ? { name: 'Slingshot', emoji: '🪀' } : { name: 'Glimmer', emoji: '✨' };
}

/** Sprite id + emoji fallback for the battle sprite. */
export function companionSprite(id: CompanionId, stage: EmberStage): { spriteId: string; emoji: string } {
  if (id === 'ember') return { spriteId: EMBER_SPRITE_IDS[stage], emoji: EMBER_SPRITES[stage] };
  return id === 'pip' ? { spriteId: 'hub-kid', emoji: '🧒' } : { spriteId: 'woods-sprite', emoji: '🧚' };
}

/** Whether Ember can act in battle at all (hatched). */
export function emberCanFight(stage: EmberStage): boolean {
  return EMBER_POWER[stage] > 0;
}

/** Whether a companion can take a battle action right now. */
export function companionCanFight(id: CompanionId, stage: EmberStage): boolean {
  return id === 'ember' ? emberCanFight(stage) : true;
}

/** The companions in the party, in swap-menu order. Ember is always there. */
export function companionsInParty(save: Pick<SaveData, 'flags'>): CompanionId[] {
  return COMPANION_IDS.filter((id) => {
    const flag = COMPANIONS[id].joinFlag;
    return flag === null || save.flags[flag] === true;
  });
}

// --- Pair Attacks -----------------------------------------------------------------------

export interface PairAttack {
  id: string;
  companion: CompanionId;
  name: string;
  emoji: string;
  /** Kid-friendly one-liner for the companion menu. */
  description: string;
  /** Charge (◆) consumed on a landed combo. */
  cost: number;
  /** Multiplier applied to the hero's + companion's combined power. */
  multiplier: number;
  /** HP the combo also restores (Wisp's). */
  heal?: number;
  /** Ember stage needed to learn it (Ember's combos only). */
  unlock?: Exclude<EmberStage, 'egg'>;
  /** Tailwind text color for the flash + labels. */
  color: string;
}

export const PAIR_ATTACKS: PairAttack[] = [
  {
    id: 'twin-strike',
    companion: 'ember',
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
    companion: 'ember',
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
    companion: 'ember',
    name: 'Dragon Duet',
    emoji: '🌋',
    description: 'Ride Ember into the sky and dive together — the ultimate combo!',
    cost: 4,
    multiplier: 2.4,
    unlock: 'dragon',
    color: 'text-red-300',
  },
  {
    id: 'marble-volley',
    companion: 'pip',
    name: 'Marble Volley',
    emoji: '🔮',
    description: 'Pip fires lucky marbles while you charge in!',
    cost: 2,
    multiplier: 1.8,
    color: 'text-sky-300',
  },
  {
    id: 'starlight-chorus',
    companion: 'wisp',
    name: 'Starlight Chorus',
    emoji: '🌟',
    description: 'You and Wisp sing up a starburst — it hurts them and heals you.',
    cost: 2,
    multiplier: 1.6,
    heal: 30,
    color: 'text-emerald-200',
  },
];

const STAGE_ORDER: EmberStage[] = ['egg', 'hatchling', 'whelp', 'dragon'];

/** The Pair Attacks a companion knows (Ember's grow with its stage). */
export function pairAttacksFor(id: CompanionId, stage: EmberStage): PairAttack[] {
  const rank = STAGE_ORDER.indexOf(stage);
  return PAIR_ATTACKS.filter(
    (p) => p.companion === id && (!p.unlock || STAGE_ORDER.indexOf(p.unlock) <= rank),
  );
}

/** Ember's unlocked Pair Attacks, in menu order. */
export function pairAttacksKnown(stage: EmberStage): PairAttack[] {
  return pairAttacksFor('ember', stage);
}
