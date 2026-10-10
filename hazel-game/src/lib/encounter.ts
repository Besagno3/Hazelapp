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
 * How close (px) a hero standing still can be to an enemy's spot as a scene
 * starts and still be reached by it: a roaming critter wanders up to `leash`
 * from home and touches from `contactRadius` beyond that; a boss holds its
 * ground.
 */
export function idleReach(foe: Pick<BattleEnemy, 'isBoss'>, leash: number): number {
  return contactRadius(foe) + (foe.isBoss ? 0 : leash);
}

/**
 * The enemies that stand down as a scene starts (all at home then), until the
 * hero has stepped clear of them (`staysDown`): every one that could reach a
 * hero standing where they start (`reachOf`, e.g. `idleReach`). Back from a
 * Flee the critter respawns at home, anywhere up to its leash plus a touch
 * from a hero saved where it swam into them (a step back is no step at all
 * when they stood still) — so it would otherwise wander straight back into
 * the same fight, again after every Flee; and the same after a reload, or
 * with a neighbouring critter (#112e). A critter standing down is drawn faded,
 * like under Calm, so a child can see it won't fight yet.
 */
export function standDown<T extends Point>(foes: readonly T[], reachOf: (foe: NoInfer<T>) => number, hero: Point): Set<T> {
  return new Set(foes.filter((f) => touching(f, hero, reachOf(f))));
}

/**
 * Does an enemy that stood down as the scene started (`standDown`) stay down?
 * Until the hero has moved off where they started (by its reach) and is clear
 * of it. A critter that wanders off and back into a hero still standing there
 * — say, a child reading after a Flee — doesn't count as the hero stepping
 * clear.
 */
export function staysDown(foe: Point, hero: Point, start: Point, radius: number): boolean {
  return touching(foe, hero, radius) || touching(start, hero, radius);
}
