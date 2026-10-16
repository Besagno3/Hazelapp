import { describe, expect, it } from 'vitest';
import { ZONES, npcPresent } from './zones';
import { NPC_DEFS, isThing, lineText, saysAfterName, visibleLines } from './npcs';
import { EPILOGUE, EPILOGUE_PARTS } from './epilogue';
import { UMBRA_NAMED } from './questFlags';
import type { DialogueLine } from './npcs';
import { QUESTS, questConversation } from './quests';
import { DOG_QUEST, questDoneFlag } from './questFlags';
import { defaultSave } from '../lib/save';
import { fullJourney } from '../lib/journey';

/** The story flags once the whole story is played (#75 item 16f). */
const END = fullJourney().flags;
/** …with every quest done too (so no quest speaks first) and the dog named. */
const ALL_DONE = { ...END, ...Object.fromEntries(QUESTS.map((q) => [questDoneFlag(q), true])), 'dog-named-pickles': true };
const DOG_NAMES = QUESTS.find((q) => q.id === DOG_QUEST)!.choice!.map((c) => c.flag);

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

/**
 * A line that plays every time once her name is said: `ifFlag: UMBRA_NAMED` alone — or, for the dog
 * only, with the name the hero chose. Never one-shot, never waiting on a quest a player may skip.
 */
const afterName = (l: DialogueLine) =>
  saysAfterName(l) ||
  (typeof l !== 'string' &&
    !l.unlessFlag &&
    !l.setFlag &&
    [l.ifFlag].flat().includes(UMBRA_NAMED) &&
    [l.ifFlag].flat().every((f) => f === UMBRA_NAMED || DOG_NAMES.includes(f!)));

describe('the epilogue (#75 item 16f)', () => {
  it('every named person has a line once her name is said', () => {
    const silent = peopleAfterTheName().filter(
      (id) => !visibleLines(NPC_DEFS[id].lines, ALL_DONE).some(afterName),
    );
    expect(silent).toEqual([]);
  });

  it('…and none before it', () => {
    const before = { ...ALL_DONE, [UMBRA_NAMED]: false };
    for (const id of peopleAfterTheName()) {
      const said = visibleLines(NPC_DEFS[id].lines, before).map(lineText);
      for (const l of NPC_DEFS[id].lines.filter(afterName)) expect(said, id).not.toContain(lineText(l));
    }
  });

  it("the dog's closing line follows the name the hero chose", () => {
    for (const name of DOG_NAMES) {
      const last = visibleLines(NPC_DEFS['memory-dog'].lines, { ...ALL_DONE, 'dog-named-pickles': false, [name]: true }).at(-1)!;
      expect(typeof last !== 'string' && [last.ifFlag].flat(), name).toEqual([name, UMBRA_NAMED]);
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
      // Someone 16e gave a line keeps theirs — so an epilogue entry for them would be dropped: none is.
      expect(NPC_DEFS[id].lines.map(lineText), id).toContain(text);
      expect(lineText(visibleLines(NPC_DEFS[id].lines, ALL_DONE).at(-1)!), id).toBe(text);
    }
  });

  it('the dialogue box gets to it: once their quests are done, nobody speaks a quest instead', () => {
    // A quest's own talk speaks first (DialogueOverlay), so a giver says it once their quest is done.
    const save = { ...defaultSave(), flags: ALL_DONE };
    for (const id of peopleAfterTheName()) expect(questConversation(id, save), id).toBeNull();
  });
});
