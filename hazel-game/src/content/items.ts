/**
 * The shop catalog + coin economy (#37, decided 2026-06-12: simple shop).
 * Deliberately tiny: two consumables and collectible badges. All tuning
 * numbers live here.
 */

export type ConsumableId = 'potion' | 'hint';

export interface ShopItem {
  id: ConsumableId | `badge:${string}`;
  name: string;
  emoji: string;
  description: string;
  price: number;
}

/** HP restored by one potion (usable as a battle command). */
export const POTION_HEAL = 50;

export const SHOP_CATALOG: ShopItem[] = [
  {
    id: 'potion',
    name: 'Berry Potion',
    emoji: '🧪',
    description: `Restores ${POTION_HEAL} HP in battle.`,
    price: 30,
  },
  {
    id: 'hint',
    name: 'Hint Feather',
    emoji: '🪶',
    description: 'Removes two wrong answers from one question.',
    price: 25,
  },
  {
    id: 'badge:star',
    name: 'Star Badge',
    emoji: '⭐',
    description: 'A shiny badge for your collection.',
    price: 100,
  },
  {
    id: 'badge:moon',
    name: 'Moon Badge',
    emoji: '🌙',
    description: 'A mysterious badge for your collection.',
    price: 150,
  },
];

/** Coins dropped by a regular enemy of a given level. */
export function enemyCoinDrop(level: number): number {
  return 10 + level * 3;
}

/** Coins dropped by a Fiend (boss). */
export function bossCoinDrop(level: number): number {
  return 60 + level * 10;
}

/** Coins inside a question-locked treasure chest. */
export const CHEST_COINS = 25;

/** Bonus XP for re-answering a missed question correctly at the Library. */
export const LIBRARY_XP = 15;

/** Cap on the Library queue — oldest misses fall off first. */
export const LIBRARY_MAX = 20;
