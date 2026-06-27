import type { WorldNpcDef } from '../content/npcs';

/**
 * Pure helpers for ambient overworld life (#wandering NPCs + idle chatter).
 * The KaPlay movement loop in `features/world/WorldCanvas.tsx` is hard to unit
 * test, so the decision math lives here (mirrors `battleMath`/`streak`): the
 * canvas closure only wires these to `k.dt()`, collision, and the actor sprites.
 */

export type Dir = { x: number; y: number };

/** The 8 compass directions a wanderer can step in. */
const DIRS: Dir[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

const INV_SQRT2 = 1 / Math.sqrt(2);

/**
 * Should this NPC roam? Only pure-flavor villagers do — every service role
 * (sage / merchant / innkeeper / librarian) and any villager explicitly marked
 * `stationary` (quest-givers, key story figures, warden signposts) stays put so
 * the player can always find them. Bosses are handled separately (`isBoss`).
 */
export function npcWanders(def: Pick<WorldNpcDef, 'role' | 'stationary'>): boolean {
  return def.role === 'villager' && !def.stationary;
}

/**
 * Pick the next wander direction given `rng()` in [0, 1). Idles roughly a third
 * of the time (returns the zero vector); otherwise one of the 8 directions,
 * with diagonals normalized so wanderers don't move faster on the diagonal.
 */
export function pickWanderDir(rng: () => number): Dir {
  const r = rng();
  if (r < 0.34) return { x: 0, y: 0 };
  const i = Math.min(DIRS.length - 1, Math.floor(((r - 0.34) / 0.66) * DIRS.length));
  const d = DIRS[i];
  if (d.x !== 0 && d.y !== 0) return { x: d.x * INV_SQRT2, y: d.y * INV_SQRT2 };
  return { x: d.x, y: d.y };
}

/** Is (x, y) within `leash` px of the wanderer's home (spawn) point? */
export function withinLeash(
  x: number,
  y: number,
  homeX: number,
  homeY: number,
  leash: number,
): boolean {
  const dx = x - homeX;
  const dy = y - homeY;
  return dx * dx + dy * dy <= leash * leash;
}

/**
 * Pull (x, y) back onto the edge of the leash circle around home if it strayed
 * outside, so a wanderer never drifts away from where the player expects it.
 */
export function clampToLeash(
  x: number,
  y: number,
  homeX: number,
  homeY: number,
  leash: number,
): { x: number; y: number } {
  const dx = x - homeX;
  const dy = y - homeY;
  const dist = Math.hypot(dx, dy);
  if (dist <= leash || dist === 0) return { x, y };
  const s = leash / dist;
  return { x: homeX + dx * s, y: homeY + dy * s };
}

/** Choose an idle one-liner to float above an NPC, or null when it has none. */
export function pickAmbientLine(lines: string[], rng: () => number): string | null {
  if (lines.length === 0) return null;
  const i = Math.floor(rng() * lines.length) % lines.length;
  return lines[i];
}
