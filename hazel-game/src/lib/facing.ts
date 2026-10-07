/**
 * 4-way facing for world sprites. Sheets carry three views: side (drawn facing
 * right; `flipX` mirrors it for left), down (toward the camera) and up (away).
 * Pure helpers — unit-tested in facing.test.ts; WorldCanvas wires them to
 * KaPlay's `play` / `flipX`.
 */
export type Facing = 'side' | 'down' | 'up';

/** Anim names per facing. Side keeps the original `idle` / `walk` names. */
export const FACING_ANIMS: Record<Facing, { idle: string; walk: string }> = {
  side: { idle: 'idle', walk: 'walk' },
  down: { idle: 'idleDown', walk: 'walkDown' },
  up: { idle: 'idleUp', walk: 'walkUp' },
};

/**
 * Facing for a movement vector. The dominant axis wins; exact diagonals
 * favour the side view (it reads best while strafing). No movement keeps
 * the previous facing so an idle character doesn't snap round.
 */
export function facingFor(dx: number, dy: number, prev: Facing): Facing {
  if (dx === 0 && dy === 0) return prev;
  if (Math.abs(dx) >= Math.abs(dy)) return 'side';
  return dy > 0 ? 'down' : 'up';
}

/**
 * The anim to play for a facing + moving state, falling back to the side
 * names (and then `idle`) for sheets without that view — e.g. hand-sourced
 * art that only ships a side strip.
 */
export function animFor(facing: Facing, moving: boolean, anims: Record<string, unknown>): string {
  const want = FACING_ANIMS[facing][moving ? 'walk' : 'idle'];
  if (want in anims) return want;
  const side = FACING_ANIMS.side[moving ? 'walk' : 'idle'];
  return side in anims ? side : 'idle';
}
