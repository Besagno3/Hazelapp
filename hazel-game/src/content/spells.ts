import type { CrystalTopic, SaveData } from '../types';
import { SAGES } from './abilities';
import { emberStatus } from './story';

/**
 * The Spellbook (#37 follow-up): instead of a single equipped Special, the hero
 * learns a growing set of spells and casts ANY of them in battle by answering
 * one *super-hard* question (`SPELL_LEVEL_BONUS` levels above the enemy). A
 * correct answer fires the spell; a miss fizzles harmlessly (effort is never
 * punished). Each spell spends charge (◆) — the battle "mana" gauge filled by
 * correct answers.
 *
 * Spells are derived from the save (Sages met, crystals restored, Ember's
 * growth) — no new save field, so older saves light up automatically.
 */

export type SpellEffect =
  // A landed hit dealing `multiplier` × the hero's basic attack damage.
  | { kind: 'damage'; multiplier: number }
  // Restores `amount` HP (no enemy turn lost — the enemy still strikes after).
  | { kind: 'heal'; amount: number }
  // Fully blocks the enemy's next hit and restores `heal` HP.
  | { kind: 'shield'; heal: number };

export interface Spell {
  id: string;
  name: string;
  emoji: string;
  /** One-line, kid-friendly description for the cast menu / Spellbook. */
  description: string;
  /** Charge (◆) consumed to cast. */
  cost: number;
  effect: SpellEffect;
  /** Tailwind text color for the cast flash + labels. */
  color: string;
}

/** Every spell asks a question this many levels above the enemy — "super hard". */
export const SPELL_LEVEL_BONUS = 3;

// --- Universal spells (learned as the hero grows) ---------------------------

/** Always known — the first verse of the spellwright's song. */
export const MEND: Spell = {
  id: 'mend',
  name: 'Mend',
  emoji: '🌿',
  description: 'Heal 60 HP with a bright answer.',
  cost: 2,
  effect: { kind: 'heal', amount: 60 },
  color: 'text-emerald-300',
};

/** Unlocked once the first crystal is restored. */
export const AEGIS: Spell = {
  id: 'aegis',
  name: 'Aegis',
  emoji: '🛡️',
  description: 'Block the next hit completely and heal 25 HP.',
  cost: 2,
  effect: { kind: 'shield', heal: 25 },
  color: 'text-sky-300',
};

/** Unlocked when Ember reaches full-grown (all four crystals) — the capstone. */
export const EMBER_BREATH: Spell = {
  id: 'ember-breath',
  name: "Ember's Breath",
  emoji: '🔥',
  description: 'Ember unleashes dragonfire — enormous damage.',
  cost: 4,
  effect: { kind: 'damage', multiplier: 3.6 },
  color: 'text-orange-300',
};

/** A Sage's signature spell (the FF6-Esper homage), learned by meeting them. */
export function sageSpell(topic: CrystalTopic): Spell {
  const s = SAGES[topic];
  return {
    id: `sage-${topic}`,
    name: s.specialName,
    emoji: s.specialEmoji,
    description: `${s.name}'s signature strike — big damage.`,
    cost: 3,
    effect: { kind: 'damage', multiplier: 2.5 },
    color: s.flashColor,
  };
}

/**
 * The spells a save currently knows, in cast-menu order: the basic Mend, each
 * met Sage's signature, then the progression unlocks (Aegis, Ember's Breath).
 */
export function spellsKnown(save: SaveData): Spell[] {
  const spells: Spell[] = [MEND];
  for (const topic of save.sages) spells.push(sageSpell(topic));
  const { crystals, stage } = emberStatus(save.flags);
  if (crystals >= 1) spells.push(AEGIS);
  if (stage === 'dragon') spells.push(EMBER_BREATH);
  return spells;
}
