import type { Topic } from '../types';

/**
 * Sages and the Special Attacks they grant (#37, FF6 Esper homage).
 * Meeting a topic's Sage adds the topic to `save.sages`; equipping it makes
 * its Special available in battle. A Special asks a question two levels above
 * the enemy and deals SPECIAL_MULTIPLIER × damage — a miss fizzles harmlessly.
 */
export interface SageInfo {
  topic: Topic;
  name: string;
  sprite: string;
  specialName: string;
  specialEmoji: string;
  /** Tailwind text color for the special's flash/labels. */
  flashColor: string;
}

export const SAGES: Record<Topic, SageInfo> = {
  math: {
    topic: 'math',
    name: 'Sage Abacus',
    sprite: '🧙',
    specialName: 'Prime Burst',
    specialEmoji: '💠',
    flashColor: 'text-blue-300',
  },
  science: {
    topic: 'science',
    name: 'Sage Flora',
    sprite: '🧝',
    specialName: 'Photon Bloom',
    specialEmoji: '🌟',
    flashColor: 'text-emerald-300',
  },
  engineering: {
    topic: 'engineering',
    name: 'Sage Cog',
    sprite: '🧑‍🔧',
    specialName: 'Gear Storm',
    specialEmoji: '🌀',
    flashColor: 'text-amber-300',
  },
  creativity: {
    topic: 'creativity',
    name: 'Sage Muse',
    sprite: '🧚',
    specialName: 'Rainbow Riff',
    specialEmoji: '🌈',
    flashColor: 'text-pink-300',
  },
};

/** Damage multiplier for a landed Sage spell vs a basic attack. */
export const SPECIAL_MULTIPLIER = 2.5;
/**
 * The spell "mana" gauge: correct answers in battle fill it (◆), and casting a
 * spell spends its cost. Sized to the priciest spell (Ember's Breath, see
 * `src/content/spells.ts`).
 */
export const CHARGE_MAX = 4;
