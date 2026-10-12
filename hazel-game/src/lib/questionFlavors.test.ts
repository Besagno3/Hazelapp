import { describe, it, expect } from 'vitest';
// ?raw imports the function's TEXT without resolving its Deno `npm:` imports,
// so the inline copy can be checked against the canonical one.
import edgeFnSource from '../../supabase/functions/generate-questions/index.ts?raw';
import { FLAVOR_IDS, QUESTION_FLAVORS } from '../../supabase/functions/_shared/flavors';

describe('question flavours (Act I launch review B8)', () => {
  it("the edge function's inline copy matches the canonical one (no drift)", () => {
    const inline = edgeFnSource.match(/const QUESTION_FLAVORS: Record<string, string> = \{([\s\S]*?)\n\};/);
    expect(inline, 'QUESTION_FLAVORS not found in generate-questions/index.ts').not.toBeNull();
    const body = inline![1];
    for (const id of FLAVOR_IDS) {
      expect(body, `edge fn missing flavour "${id}"`).toContain(`${id}: `);
      expect(body, `edge fn has different words for "${id}"`).toContain(JSON.stringify(QUESTION_FLAVORS[id]).slice(1, -1));
    }
    // …and nothing extra: one line per flavour.
    expect(body.trim().split('\n')).toHaveLength(FLAVOR_IDS.length);
  });

  it('the edge function never puts caller text into the prompt', () => {
    // The old free-text `context` must not reach generateFresh.
    expect(edgeFnSource).not.toMatch(/generateFresh\([^)]*context/);
    expect(edgeFnSource).toMatch(/Object\.hasOwn\(QUESTION_FLAVORS, body\.flavor\)/);
  });

  it('flavour lines keep the tone rules — never school words', () => {
    for (const id of FLAVOR_IDS) {
      expect(QUESTION_FLAVORS[id]).not.toMatch(/\b(test|grade|exam|homework)\b/i);
      expect(QUESTION_FLAVORS[id].length).toBeLessThan(80);
    }
  });
});
