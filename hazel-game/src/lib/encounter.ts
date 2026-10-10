import type { BattleEnemy } from '../types';
import type { TravelMode } from '../content/zones';
import { meetsHero } from './travel';

/**
 * Bumping into critters on the map: how close counts as touching, and whether
 * a touch starts a battle. `WorldCanvas`'s contact loop asks these every
 * frame; they're pure so the rules are tested (#75 item 14d).
 */

type Point = { x: number; y: number };

/** How close (px, centre to centre) the hero must come to touch an enemy — a boss is bigger. */
export const CONTACT_RADIUS = { critter: 28, boss: 34 } as const;

export function contactRadius(foe: Pick<BattleEnemy, 'isBoss'>): number {
  return foe.isBoss ? CONTACT_RADIUS.boss : CONTACT_RADIUS.critter;
}

/** Is the hero within `radius` of this enemy? */
export function touching(foe: Point, hero: Point, radius: number): boolean {
  return (hero.x - foe.x) ** 2 + (hero.y - foe.y) ** 2 < radius * radius;
}

/**
 * Does touching this enemy start a battle? Not a roaming critter while Calm
 * is on (bosses still fight, #75 item 9), and only an enemy in the hero's own
 * element: a sea critter fights a sailing hero, a land one a hero on foot —
 * bosses too (`meetsHero`, #75 item 14d, #108j).
 */
export function startsBattle(foe: Pick<BattleEnemy, 'isBoss' | 'habitat'>, hero: { mode: TravelMode; calm: boolean }): boolean {
  if (hero.calm && !foe.isBoss) return false;
  return meetsHero(foe.habitat, hero.mode);
}

/**
 * The enemies a hero is already touching as a scene starts — back from a
 * Flee, a reload, an arrival — which stand down until the hero has stepped
 * clear of them. A critter respawns at its home, so a hero saved where it
 * touched them (still, a step back is no step at all) would otherwise be
 * pulled straight back into the same fight, again after every Flee (#112e).
 */
export function standDown<T extends Point>(foes: readonly T[], radiusOf: (foe: T) => number, hero: Point): Set<T> {
  return new Set(foes.filter((f) => touching(f, hero, radiusOf(f))));
}
