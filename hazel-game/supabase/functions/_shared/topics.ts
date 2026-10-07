/**
 * The ONE topic registry shared by the game client and the generate-questions
 * edge function (Wave 0.4, ROADMAP-4X, ISSUES #67). Both sides import this
 * file, so the function's whitelist and persona prompt can never drift from
 * the game's topics again.
 *
 * Adding a topic:
 *   1. add its entry here (id + persona line for the question writer),
 *   2. add the id to `CRYSTAL_TOPIC_IDS` or `EXTRA_TOPIC_IDS` (src/types)
 *      and its registry entry in src/content/topics.ts — a test locks the
 *      two lists together,
 *   3. redeploy: `supabase functions deploy generate-questions`.
 *
 * Deliberately dependency-free: imported by Deno (edge function, via a
 * relative `.ts` path) and by Vite/vitest (through src/content/topicPrompts).
 */
export const TOPIC_PROMPTS = {
  math: 'arithmetic, geometry, fractions, word problems.',
  science: 'nature, biology, physics, space, chemistry basics.',
  engineering: 'how things work, computers, materials, structures, simple logic.',
  creativity: 'art, music, colour, writing, design, imagination.',
  nature: 'animals, plants, habitats, weather, the human body, the living world.',
  space: 'planets, stars, moons, the solar system, astronauts, rockets, the night sky.',
  history:
    'world history, ancient civilizations, famous inventions, important people, the measurement of time.',
} as const;

export type TopicId = keyof typeof TOPIC_PROMPTS;

/** Every topic id the edge function accepts. */
export const TOPIC_IDS = Object.keys(TOPIC_PROMPTS) as TopicId[];

/** The "Topics:" section of the question-writer system prompt. */
export function topicPromptBlock(): string {
  return TOPIC_IDS.map((id) => `- ${id}: ${TOPIC_PROMPTS[id]}`).join('\n');
}
