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
 * arrival, landing or climbing aboard, or with a neighbour's patch (#114e). A
 * resting enemy is drawn faded, like under Calm, and like under Calm it lets
 * the hero pass (`staysDown`).
 */
export function standDown<T extends Point>(foes: readonly T[], reachOf: (foe: NoInfer<T>) => number, hero: Point): Set<T> {
  return new Set(foes.filter((f) => touching(f, hero, reachOf(f))));
}

/**
 * The enemies a cooldown spares (a menu closed, a landing, a chest, Calm
 * wearing off…): the critters touching the hero as it's armed, so they've a
 * moment to step clear — never a boss, and never one they walk into after
 * (#114t: the cooldown used to let the hero walk through anything).
 */
export function graceOf<T extends Point & { enemy?: Pick<BattleEnemy, 'isBoss'> }>(actors: readonly T[], hero: Point): Set<T> {
  return standDown(
    actors.filter((a) => a.enemy && !a.enemy.isBoss),
    (a) => contactRadius(a.enemy!),
    hero,
  );
}

/**
 * One enemy, this frame, in the canvas's contact loop (#114e, #114t) — does
 * it fight, and is it `spared` after? Pure, so the rules are tested.
 * - Resting, or in the two frames after a cooldown is armed (`held`, while
 *   its menu or talk takes the world's pause): nothing changes.
 * - Out of the hero's touch: no fight, and no longer spared.
 * - Spared (touching the hero as a cooldown was armed, or come onto them
 *   while they stood still): passable while they stand or step away — but
 *   walking into it (`closing`) fights, like any foe.
 * - Coming onto a hero standing still while they're guarded (a cooldown, or
 *   reading "💎 Game saved!"): spared from now on. Never a boss.
 * - Otherwise a touch fights in its own element, and no critter under Calm
 *   (`startsBattle`).
 */
export function meetFoe(
  foe: Pick<BattleEnemy, 'isBoss' | 'habitat'>,
  s: {
    onHero: boolean;
    held: boolean;
    resting: boolean;
    spared: boolean;
    guarded: boolean;
    still: boolean;
    closing: boolean;
    mode: TravelMode;
    calm: boolean;
  },
): { fight: boolean; spared: boolean } {
  if (s.held || s.resting) return { fight: false, spared: s.spared };
  if (!s.onHero) return { fight: false, spared: false };
  if (s.spared && !s.closing) return { fight: false, spared: true };
  if (s.guarded && s.still && !foe.isBoss) return { fight: false, spared: true };
  return { fight: startsBattle(foe, s), spared: false };
}

/**
 * A resting enemy (`standDown`): its home, how near the hero can be and keep
 * it resting (`idleReach`), and — a boss — where the hero was when it began.
 */
export type Rest = Point & { reach: number; from?: Point };

export function restOf(foe: Pick<BattleEnemy, 'isBoss'>, home: Point, hero: Point, leash: number): Rest {
  const reach = idleReach(foe, leash);
  return foe.isBoss ? { x: home.x, y: home.y, reach, from: { x: hero.x, y: hero.y } } : { x: home.x, y: home.y, reach };
}

/**
 * Does a resting enemy stay resting? While the hero is still within its reach
 * of its home — inside its patch. It wakes once they've left, so it never
 * wakes beside them: by then it can't touch them without the hero steering
 * back. A boss holds its ground, often across a way on, so it wakes too the
 * moment the hero heads past it: measured along the line from the boss out
 * to where they began, they come any nearer than that (by half a pixel —
 * standing still never wakes it). Backing away or stepping across that line
 * is free; every way round to its far side crosses it. (Begun on top of it,
 * there's no "past": every way off is away.)
 */
export function staysDown(rest: Rest, hero: Point): boolean {
  if (rest.from) {
    const fx = rest.from.x - rest.x;
    const fy = rest.from.y - rest.y;
    const near = Math.hypot(fx, fy);
    if (near > 1 && ((hero.x - rest.x) * fx + (hero.y - rest.y) * fy) / near < near - 0.5) return false;
  }
  return touching(rest, hero, rest.reach);
}
