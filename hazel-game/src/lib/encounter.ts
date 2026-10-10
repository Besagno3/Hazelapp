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
 * The enemies that rest as a scene starts (all at home then): every one that
 * could reach a hero standing where they start (`reachOf`, e.g. `idleReach`).
 * Back from a Flee the critter respawns at home, anywhere up to its leash plus
 * a touch from a hero saved where it swam into them (a step back is no step at
 * all when they stood still) — so it would otherwise wander straight back into
 * the same fight, again after every Flee; and the same after a reload, an
 * arrival, landing or climbing aboard, or with a neighbour's patch (#112e). A
 * resting enemy is drawn faded, like under Calm, and like under Calm it lets
 * the hero pass (`staysDown`).
 */
export function standDown<T extends Point>(foes: readonly T[], reachOf: (foe: NoInfer<T>) => number, hero: Point): Set<T> {
  return new Set(foes.filter((f) => touching(f, hero, reachOf(f))));
}

/**
 * A resting enemy (`standDown`): its home, how near the hero can be and keep
 * it resting (`idleReach`), and — a boss — how near they were when it began.
 */
export type Rest = Point & { reach: number; near?: number };

export function restOf(foe: Pick<BattleEnemy, 'isBoss'>, home: Point, hero: Point, leash: number): Rest {
  const reach = idleReach(foe, leash);
  return foe.isBoss ? { x: home.x, y: home.y, reach, near: Math.hypot(hero.x - home.x, hero.y - home.y) } : { x: home.x, y: home.y, reach };
}

/**
 * Does a resting enemy stay resting? While the hero is still within its reach
 * of its home — inside its patch. It wakes once they've left, so it never
 * wakes beside them: by then it can't touch them without the hero steering
 * back. A boss holds its ground, often across a way on, so it wakes too the
 * moment the hero steps nearer than they began (by half a pixel — standing
 * still never wakes it): they can back away from it, not walk through it.
 */
export function staysDown(rest: Rest, hero: Point): boolean {
  if (rest.near !== undefined && touching(rest, hero, Math.max(0, rest.near - 0.5))) return false;
  return touching(rest, hero, rest.reach);
}
