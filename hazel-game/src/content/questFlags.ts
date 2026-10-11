/**
 * Quest save-flag names (#75 item 14g), in a module with no imports so the
 * maps (`zones.ts`) can place people by a quest's progress — Posy waiting at
 * Foglight Marsh's landing — without importing `quests.ts`, which imports the
 * maps. `quests.ts` re-exports them.
 */

export function questOfferedFlag(q: { id: string }): string {
  return `quest:${q.id}:offered`;
}

export function questDoneFlag(q: { id: string }): string {
  return `quest:${q.id}:done`;
}

export function stepFlag(stepId: string): string {
  return `quest-step:${stepId}`;
}

/**
 * "The Flower for No Name" (#75 item 14g): Posy's escort through Foglight
 * Marsh. Its quest and its one walk.
 */
export const POSY_QUEST = 'flower-noname';
export const POSY_WALK = 'posy-walk';

/**
 * Set while an escort's walk is under way. Never kept: leaving the place,
 * a lost battle or a reload clears it, and the one being walked waits at the
 * start again (`normalizeSave` → `escortsBack`, `withoutEscorts`).
 */
export function escortWalkingFlag(stepId: string): string {
  return `escort:${stepId}:walking`;
}

/** Flags with every escort's walk ended (`escortWalkingFlag`) — they've arrived, or wait at the start again. */
export function withoutEscorts(flags: Record<string, boolean>): Record<string, boolean> {
  if (!Object.keys(flags).some(isWalkingFlag)) return flags;
  return Object.fromEntries(Object.entries(flags).filter(([f]) => !isWalkingFlag(f)));
}

/**
 * Set when a walk ended short (#75 item 14g review: a lost battle, a reload,
 * leaving the place) — the world says once that they've gone back to wait,
 * then clears it.
 */
export function escortBackFlag(stepId: string): string {
  return `escort:${stepId}:back`;
}

/** Every walk under way ended short: each one walking goes back to wait (`escortBackFlag`). */
export function escortsBack(flags: Record<string, boolean>): Record<string, boolean> {
  const walking = Object.keys(flags).filter((f) => isWalkingFlag(f) && flags[f]);
  if (!walking.length) return withoutEscorts(flags);
  const back = Object.fromEntries(walking.map((f) => [escortBackFlag(f.slice('escort:'.length, -':walking'.length)), true]));
  return { ...withoutEscorts(flags), ...back };
}

function isWalkingFlag(f: string): boolean {
  return f.startsWith('escort:') && f.endsWith(':walking');
}
