import { describe, expect, it } from 'vitest';
import { ZONES, npcPresent } from './zones';
import { NPC_DEFS, isThing, lineText, visibleLines } from './npcs';
import { EPILOGUE, EPILOGUE_PARTS } from './epilogue';
import { UMBRA_NAMED } from './questFlags';
import type { DialogueLine } from './npcs';
import { QUESTS, questConversation } from './quests';
import { questDoneFlag } from './questFlags';
import { defaultSave } from '../lib/save';
import { fullJourney } from '../lib/journey';

/** The story flags once the whole story is played (#75 item 16f). */
const END = fullJourney().flags;

/** Placed people (not props or signposts) who still stand somewhere once the whole story is played. */
function peopleAfterTheName(): string[] {
  const ids = new Set<string>();
  for (const z of Object.values(ZONES)) {
    for (const p of z.npcs ?? []) {
      const def = NPC_DEFS[p.defId];
      if (def && !isThing(def) && npcPresent(p, END)) ids.add(p.defId);
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

  it('it comes last, after their usual lines (someone 16e already gave a line keeps theirs)', () => {
    for (const [id, text] of Object.entries(EPILOGUE)) {
      const lines = visibleLines(NPC_DEFS[id].lines, END);
      expect(lines.some(afterName), id).toBe(true);
      if (NPC_DEFS[id].lines.some((l) => lineText(l) === text)) expect(lineText(lines.at(-1)!), id).toBe(text);
    }
  });

  it('the dialogue box gets to it: once their quests are done, nobody speaks a quest instead', () => {
    // A quest's own talk speaks first (DialogueOverlay), so a giver says it once their quest is done.
    const allDone = Object.fromEntries(QUESTS.map((q) => [questDoneFlag(q), true]));
    const save = { ...defaultSave(), flags: { ...END, ...allDone } };
    for (const id of peopleAfterTheName()) expect(questConversation(id, save), id).toBeNull();
  });
});
