import { describe, expect, it } from 'vitest';
import { ZONES } from './zones';
import { NPC_DEFS, isThing, lineText, visibleLines } from './npcs';
import { EPILOGUE, EPILOGUE_PARTS } from './epilogue';
import { UMBRA_NAMED } from './questFlags';
import type { DialogueLine } from './npcs';

/** Placed people (not props or signposts) who still stand somewhere once her name is said. */
function peopleAfterTheName(): string[] {
  const ids = new Set<string>();
  for (const z of Object.values(ZONES)) {
    for (const p of z.npcs ?? []) {
      const def = NPC_DEFS[p.defId];
      // Present once `umbra-named` is set, whatever their other flag (a hand-over between two spots).
      if (def && !isThing(def) && p.unlessFlag !== UMBRA_NAMED) ids.add(p.defId);
    }
  }
  return [...ids].sort();
}

const afterName = (l: DialogueLine) =>
  typeof l !== 'string' && (Array.isArray(l.ifFlag) ? l.ifFlag : [l.ifFlag]).includes(UMBRA_NAMED);

describe('the epilogue (#75 item 16f)', () => {
  it('every named person has a line once her name is said', () => {
    const silent = peopleAfterTheName().filter(
      (id) => !visibleLines(NPC_DEFS[id].lines, { [UMBRA_NAMED]: true }).some(afterName),
    );
    expect(silent).toEqual([]);
  });

  it('…and none before it', () => {
    for (const id of peopleAfterTheName()) {
      expect(visibleLines(NPC_DEFS[id].lines, {}).filter(afterName), id).toEqual([]);
    }
  });

  it('every epilogue line belongs to one person who is there after the name', () => {
    const people = new Set(peopleAfterTheName());
    const seen = new Set<string>();
    for (const part of EPILOGUE_PARTS) {
      for (const id of Object.keys(part)) {
        expect(seen.has(id), `${id} twice`).toBe(false);
        seen.add(id);
        expect(people.has(id), `${id} isn't a person standing after the name`).toBe(true);
      }
    }
  });

  it('lines are short and never call the shadow "he"', () => {
    for (const [id, text] of Object.entries(EPILOGUE)) {
      expect(text.split(/\s+/).length, id).toBeLessThanOrEqual(30);
      expect(/\b(he|him|his)\b[^.!?]*\b(shadow|Umbra)\b|\b(shadow|Umbra)\b[^.!?]*\b(he|him|his)\b/i.test(text), id).toBe(false);
    }
  });

  it('it comes first, before their usual lines (someone 16e already gave a line keeps theirs)', () => {
    for (const [id, text] of Object.entries(EPILOGUE)) {
      const lines = NPC_DEFS[id].lines;
      if (lines.some((l) => lineText(l) === text)) {
        expect(lineText(visibleLines(lines, { [UMBRA_NAMED]: true })[0]), id).toBe(text);
      } else {
        expect(visibleLines(lines, { [UMBRA_NAMED]: true }).some(afterName), id).toBe(true);
      }
    }
  });
});
