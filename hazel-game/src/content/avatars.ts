import type { Avatar, FightStyle } from '../types';
import { SPARK_START_CHARGE } from '../lib/battleTurn';
import { KEEN_EYE_HEAL } from '../lib/battleMath';

/**
 * The playable hero roster (moved from AvatarSelect for reuse, #37). Ids
 * a1–a5 are what saves store, so a rename never loses anyone's hero.
 */
export const AVATARS: Avatar[] = [
  { id: 'a1', name: 'Valor', sprite: '🦁', spriteId: 'valor', fightStyle: 'aggressive', maxHp: 100 },
  { id: 'a2', name: 'Bastion', sprite: '🐢', spriteId: 'bastion', fightStyle: 'defensive', maxHp: 140 },
  { id: 'a3', name: 'Talon', sprite: '🦅', spriteId: 'talon', fightStyle: 'balanced', maxHp: 120 },
  { id: 'a4', name: 'Kira', sprite: '🦊', spriteId: 'kira', fightStyle: 'swift', maxHp: 100 },
  { id: 'a5', name: 'Selene', sprite: '🐈', spriteId: 'selene', fightStyle: 'mystic', maxHp: 110 },
];

/** A hero type's name, as the hero select and the menu show it. */
export const STYLE_LABEL: Record<FightStyle, string> = {
  aggressive: 'Warrior',
  defensive: 'Guardian',
  balanced: 'Ranger',
  swift: 'Duelist',
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
 * Every hero type's two signature abilities. The rules live in
 * `lib/battleMath.ts` (`STYLE_MAGIC`, `counterDamage`, `lionheartMultiplier`,
 * `defendReduction`'s Rock Steady, `keenEyeHeal`) and `lib/battleTurn.ts`
 * (`heroOpening`, Second Wind in `resolveEnemyTurn`).
 */
export const HERO_ABILITIES: Record<FightStyle, HeroAbility[]> = {
  aggressive: [
    { emoji: '💥', name: 'Battle Cry', text: 'The first Attack of every battle hits double.' },
    { emoji: '🦁', name: 'Lionheart', text: 'Attacks hit harder when HP drops below half.' },
  ],
  defensive: [
    { emoji: '🛡️', name: 'Shell Up', text: "The first enemy blow of every battle can't get through." },
    { emoji: '🪨', name: 'Rock Steady', text: 'Still blocks part of a blow after a wrong answer.' },
  ],
  balanced: [
    { emoji: '🌬️', name: 'Second Wind', text: 'Once a battle, survives a knockout with 1 HP.' },
    { emoji: '🎯', name: 'Keen Eye', text: `Every right answer mends ${KEEN_EYE_HEAL} HP.` },
  ],
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
