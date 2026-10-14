/**
 * Question flavours (Act I launch review B8): the adventure moment a batch of
 * fresh questions is written for. The app sends only one of these keys and the
 * generate-questions function turns it into its own wording, so no caller can
 * put text of their own into the prompt — fresh questions are cached and
 * served to every child.
 *
 * Canonical copy for the app (`src/lib/questions.ts` imports `FlavorId`).
 * generate-questions/index.ts keeps an inline copy so it deploys as one file
 * (#67); `questionFlavors.test.ts` fails if the two ever drift.
 *
 * Adding a flavour: add it here AND to the function's inline copy, then
 * redeploy the function (`supabase functions deploy generate-questions`).
 *
 * Deliberately dependency-free: imported by Vite/vitest; Deno never imports it.
 */
export const QUESTION_FLAVORS = {
  battle: 'a quick-thinking hero battling a critter',
  spell: 'a hero casting a powerful spell in battle',
  gate: "a gatekeeper's challenge on a path through a fantasy world",
  chest: "a magical treasure chest's riddle",
  shrine: 'a riddle from a shrine keeper teaching a spell',
  spire: "the final climb up a dark wizard's tower",
} as const;

export type FlavorId = keyof typeof QUESTION_FLAVORS;

/** Every flavour key the function accepts. */
export const FLAVOR_IDS = Object.keys(QUESTION_FLAVORS) as FlavorId[];
