import { describe, it, expect } from 'vitest';
// ?raw imports the file's TEXT (vite/client-typed) without resolving the
// function's Deno `npm:` imports — lets us diff the inlined copy vs canonical.
import edgeFnSource from '../../supabase/functions/generate-questions/index.ts?raw';
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

  it("the edge function's inlined topic copy matches the canonical source (no drift)", () => {
    // generate-questions/index.ts inlines TOPIC_PROMPTS so it deploys as one
    // self-contained file (a sibling _shared import fails to bundle on non-CLI
    // deploys, #67). This asserts the inlined copy still equals the canonical
    // _shared/topics.ts — so adding/renaming a topic can't silently diverge.
    for (const id of TOPIC_IDS) {
      expect(edgeFnSource, `edge fn missing topic id "${id}"`).toContain(`${id}:`);
      expect(edgeFnSource, `edge fn missing persona for "${id}"`).toContain(TOPIC_PROMPTS[id]);
    }
  });
});
