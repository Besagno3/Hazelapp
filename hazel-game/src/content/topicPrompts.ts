/**
 * App-side view of the shared topic config (Wave 0.4, #67). The truth lives
 * in supabase/functions/_shared/topics.ts — shared with the generate-questions
 * edge function so the whitelist/persona prompt can't drift from the game.
 *
 * The `_topicSetsMatch` line below makes drift a COMPILE error (not only a
 * vitest failure): in a no-CI repo, a lint+build-only check would otherwise
 * ship a whitelist/game mismatch that 400s question generation (ISSUES #57).
 * topicPrompts.test.ts still asserts the same thing at runtime as a backstop.
 */
import type { Topic } from '../types';
import type { TopicId } from '../../supabase/functions/_shared/topics';

// Bidirectional proof that the edge-function whitelist (`TopicId`) and the
// game's `Topic` union are the exact same set of ids. If either side gains or
// loses a topic without the other, this stops compiling.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _topicSetsMatch: Exact<Topic, TopicId> = true;
void _topicSetsMatch;

export { TOPIC_PROMPTS, TOPIC_IDS, topicPromptBlock } from '../../supabase/functions/_shared/topics';
export type { TopicId } from '../../supabase/functions/_shared/topics';
