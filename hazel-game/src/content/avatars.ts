import type { Avatar, FightStyle } from '../types';
import { SPARK_START_CHARGE } from '../lib/battleTurn';

/** The playable hero roster (moved from AvatarSelect for reuse, #37). */
export const AVATARS: Avatar[] = [
  { id: 'a1', name: 'Blaze', sprite: '🦁', spriteId: 'blaze', fightStyle: 'aggressive', maxHp: 100 },
  { id: 'a2', name: 'Shield', sprite: '🐢', spriteId: 'shield', fightStyle: 'defensive', maxHp: 140 },
  { id: 'a3', name: 'Nova', sprite: '🦅', spriteId: 'nova', fightStyle: 'balanced', maxHp: 120 },
  // The heroines: an arctic-fox duelist and a starry black-cat spellcaster.
  { id: 'a4', name: 'Skye', sprite: '🦊', spriteId: 'skye', fightStyle: 'swift', maxHp: 100 },
  { id: 'a5', name: 'Nyx', sprite: '🐈‍⬛', spriteId: 'nyx', fightStyle: 'mystic', maxHp: 110 },
];

/** A hero type's name, as the hero select and the menu show it. */
export const STYLE_LABEL: Record<FightStyle, string> = {
  aggressive: 'Aggressive',
  defensive: 'Defensive',
  balanced: 'Balanced',
  swift: 'Swift',
  mystic: 'Mystic',
};

export const STYLE_DESC: Record<FightStyle, string> = {
  aggressive: 'High attack damage, lower HP',
  defensive: 'High HP, lower attack',
  balanced: 'Well-rounded stats',
  swift: 'Quick counters, lower HP',
  mystic: 'Mighty spells, softer swings',
};

export interface HeroAbility {
  emoji: string;
  name: string;
  /** One kid-friendly line: what it does in battle. */
  text: string;
}

/**
 * Special abilities by hero type. The rules live in `lib/battleMath.ts`
 * (`STYLE_MAGIC`, `counterDamage`) and `lib/battleTurn.ts` (`heroOpening`).
 */
export const HERO_ABILITIES: Record<FightStyle, HeroAbility[]> = {
  aggressive: [],
  defensive: [],
  balanced: [],
  swift: [
    { emoji: '⚡', name: 'Counter Strike', text: 'Block a blow with a right answer and strike right back!' },
    { emoji: '🦊', name: 'Fox Sense', text: 'A free Hint Feather in every battle.' },
  ],
  mystic: [
    { emoji: '✨', name: 'Spark Start', text: `Starts every battle with ${SPARK_START_CHARGE} ◆ spell charge.` },
    { emoji: '🔮', name: 'Spell Power', text: "Spells and Pair Attacks hit harder than any other hero's." },
  ],
};

export function avatarById(id: string | null): Avatar | null {
  return AVATARS.find((a) => a.id === id) ?? null;
}
