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
 * Set the first time the hero reaches the Marsh after Posy asks (#75 item 14g,
 * the owner's call): until then she waits on the Hill, rather than vanishing
 * the moment her offer closes — she "sailed over with Slosh" while you did.
 */
export const POSY_SAILED = 'posy:sailed';

/**
 * "Ferry the Fretful" (#75 item 15d): Skipper Juno's walk along Driftwood
 * Shallows to her old ferry, the Puffin. Its quest and its one walk.
 */
export const JUNO_QUEST = 'juno-ferry';
export const JUNO_WALK = 'juno-walk';
/**
 * Set the first time the hero reaches Driftwood Shallows after Juno asks
 * (#75 item 15d review, like Posy's `POSY_SAILED`): until then she waits on
 * Port Lantern's dock rather than vanishing as her offer closes.
 */
export const JUNO_CAME = 'juno:came';

/**
 * Yarn's Tallest Tale (#75 item 15e): the quest, and its three riddle steps
 * in the tale's order — each a tale-stone on the Story Reef, dim until its
 * riddle is answered (the reef places a glowing stone by `stepFlag`).
 */
export const YARN_QUEST = 'yarn-tale';
export const YARN_STONES = ['yarn-stone-1', 'yarn-stone-2', 'yarn-stone-3'] as const;

/**
 * Ring the Songstones (#75 item 15f): Reso's quest and its three song steps,
 * high to low — each a songstone on Songstone Cliffs, rung (`stepFlag`) in
 * order; a wrong note clears them all and the song starts again.
 */
export const RESO_QUEST = 'reso-songstones';
export const RESO_STONES = ['reso-high', 'reso-middle', 'reso-low'] as const;

/** The Pen-Pal Papers (#75 item 15f): Librarian Shush's letters to Librarian Sage. */
export const SHUSH_QUEST = 'shush-letters';

/** Coda's Lost Refrains (#75 item 15g): the island's three songs, found and sung back. */
export const CODA_QUEST = 'coda-refrains';

/** The Blank Chart (#75 item 15h): the Chartmaker's story quest on Chartmaker's Rest. */
export const BLANK_CHART_QUEST = 'blank-chart';
/**
 * Set as the Blank Chart is handed over (#75 item 15h, #106a): Act IV's key
 * item is held — the Chartmaker's panels play, and item 16 opens the way down.
 */
export const BLANK_CHART_HELD = 'blank-chart-held';

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
