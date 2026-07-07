/**
 * App-side view of the shared topic config (Wave 0.4, #67). The truth lives
 * in supabase/functions/_shared/topics.ts — shared with the generate-questions
 * edge function so the whitelist/persona prompt can't drift from the game.
 * topicPrompts.test.ts locks TOPIC_IDS to the game's topic registry.
 */
export { TOPIC_PROMPTS, TOPIC_IDS, topicPromptBlock } from '../../supabase/functions/_shared/topics';
export type { TopicId } from '../../supabase/functions/_shared/topics';
