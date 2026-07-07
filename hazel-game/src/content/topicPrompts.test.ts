import { describe, it, expect } from 'vitest';
import { TOPIC_PROMPTS, TOPIC_IDS, topicPromptBlock } from './topicPrompts';
import { ALL_TOPICS } from './topics';

describe('shared topic config (Wave 0.4 — edge function ↔ game lockstep)', () => {
  it('the edge-function whitelist exactly matches the game topic registry', () => {
    // If this fails you added a topic on one side only — see
    // supabase/functions/_shared/topics.ts for the add-a-topic checklist.
    expect([...TOPIC_IDS].sort()).toEqual([...ALL_TOPICS].sort());
  });

  it('every topic has a non-empty persona line for the question writer', () => {
    for (const id of TOPIC_IDS) {
      expect(TOPIC_PROMPTS[id].length, `${id} persona`).toBeGreaterThan(10);
    }
  });

  it('persona lines keep the tone rules — never school words', () => {
    // STORY.md §2: learning is heroic, never homework.
    for (const id of TOPIC_IDS) {
      expect(TOPIC_PROMPTS[id]).not.toMatch(/\b(test|grade|exam|homework)\b/i);
    }
  });

  it('the prompt block lists every topic as a "- id: …" line', () => {
    const block = topicPromptBlock();
    for (const id of TOPIC_IDS) {
      expect(block).toContain(`- ${id}: `);
    }
    expect(block.split('\n')).toHaveLength(TOPIC_IDS.length);
  });
});
