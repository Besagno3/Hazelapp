import { clampLevel } from './age';
import type { SeatIndex } from './duel';

/**
 * 👥 Co-op battles (#178): Player 2 (`lib/playerTwo.ts`) fights beside the
 * kid playing as the companion. Each round: the hero's command (the kid
 * playing), then the companion's (Player 2 — its strike or a Pair Attack, a
 * question at Player 2's own level; with no companion able to fight, a
 * cheer), then the enemy's blow, blocked by the players in turn. A Pair
 * Attack takes both: Player 2's super-hard answer, then the kid playing's.
 * Only the kid playing's answers move their level, the speed trigger, the
 * Library and XP — nothing of Player 2's is saved. Pure rules here; the turn
 * flow is `BattleArena`'s.
 */

/** ◆ a right cheer adds — Player 2's move while the companion can't fight (Ember still an egg). */
export const CHEER_CHARGE = 1;

/** Who blocks the enemy's `n`th blow of the fight (from 0): the kid playing first, then Player 2, in turn. */
export function defenderFor(n: number): SeatIndex {
  return (n % 2) as SeatIndex;
}

/**
 * Player 2's `n`th draw (from 0) from their pool: round and round the ones the
 * hero's pool doesn't hold, so the same question never shows for both on one
 * screen — a guest at the kid's own level asks exactly the hero's request, and
 * offline both pools are the same starters. When every one of theirs is the
 * hero's too, half a round out of step with the hero's draws instead.
 */
export function partnerPick<T extends { id: string }>(pool: T[], heroIds: ReadonlySet<string>, n: number): T {
  const own = pool.filter((q) => !heroIds.has(q.id));
  if (own.length > 0) return own[n % own.length];
  return pool[(n + Math.floor(pool.length / 2)) % pool.length];
}

/** Player 2's question level in a fight: their seat's level, eased by the fight's mercy like the hero's. */
export function partnerLevel(seatLevel: number, mercyDrop: number): number {
  return clampLevel(seatLevel - mercyDrop);
}
