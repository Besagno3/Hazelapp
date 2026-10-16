import { describe, it, expect } from 'vitest';
import { NAME_ANSWER, NAME_CHOICES, NAME_CLEAR_XP, NAME_QUESTIONS, WRONG_NAME_LINES, finaleTopics, nameClearXp } from './finale';
import { ALL_TOPICS } from './topics';
import { POST_CREDITS_PANELS, namePanels } from './story';
import { NPC_DEFS, ROLE_SERVICE, npcSpriteId, visibleLines, lineText } from './npcs';
import { ZONES, buildingInside } from './zones';
import { reach, touches } from '../lib/reach';
import { NAME_LEARNED, ROOT_HEART_REACHED, UMBRA_NAMED } from './questFlags';

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

describe('the Name (#75 item 16e)', () => {
  it("Umbra's questions come from five different topics of all Lumina forgot", () => {
    const topics = finaleTopics();
    expect(topics).toHaveLength(NAME_QUESTIONS);
    expect(new Set(topics).size).toBe(NAME_QUESTIONS);
    for (const t of topics) expect(ALL_TOPICS).toContain(t);
    // …picked at random: a different roll, a different set.
    expect(finaleTopics(NAME_QUESTIONS, () => 0)).not.toEqual(finaleTopics(NAME_QUESTIONS, () => 0.999));
  });

  it('the reward is paid the first time only', () => {
    expect(nameClearXp(5, 10, false)).toBe(50 + NAME_CLEAR_XP);
    expect(nameClearXp(5, 10, true)).toBe(50);
  });

  it('"Aster" is one of the names, and every other one gets its own gentle line', () => {
    expect(NAME_CHOICES).toContain(NAME_ANSWER);
    expect(new Set(NAME_CHOICES).size).toBe(NAME_CHOICES.length);
    for (const n of NAME_CHOICES.filter((n) => n !== NAME_ANSWER)) expect(WRONG_NAME_LINES[n], n).toMatch(/isn't/);
  });

  it("the name panels thank the hero by name; every panel is short enough to read aloud", () => {
    const panels = namePanels('Kira');
    expect(panels).toHaveLength(6);
    expect(panels.some((p) => p.text.includes('Kira'))).toBe(true);
    expect(POST_CREDITS_PANELS).toHaveLength(3);
    for (const p of [...panels, ...POST_CREDITS_PANELS]) expect(words(p.text), p.text).toBeLessThanOrEqual(30);
  });

  it("Umbra stands in front of the Heart, a step from the hero's way in, and opens the finale", () => {
    const z = ZONES['deep-root-7'];
    const umbra = z.npcs.find((n) => n.defId === 'umbra-remembered')!;
    expect(ROLE_SERVICE[NPC_DEFS[umbra.defId].role]).toBe('name');
    const heart = z.npcs.find((n) => n.defId === 'root-heart')!;
    // He doesn't wall the Heart off: it can still be walked up to with him standing there.
    const blocked = (x: number, y: number) => (x === umbra.x && y === umbra.y) || (x === heart.x && y === heart.y);
    const open = reach(z, { blocked });
    expect(touches(open, umbra.x, umbra.y)).toBe(true);
    expect(touches(open, heart.x, heart.y)).toBe(true);
  });

  it('the Heart says what happened, before and after her name', () => {
    const says = (flags: Record<string, boolean>) => visibleLines(NPC_DEFS['root-heart'].lines, flags).map(lineText).join(' ');
    expect(says({ [ROOT_HEART_REACHED]: true, [NAME_LEARNED]: true })).toMatch(/stands beside it, waiting for you/);
    expect(says({ [ROOT_HEART_REACHED]: true, [UMBRA_NAMED]: true })).toMatch(/glows gold/);
    // Its face: purple and empty once the shadow is out, gold after the name (16e review round 2).
    expect(npcSpriteId(NPC_DEFS['root-heart'], {})).toBe('root-heart');
    expect(npcSpriteId(NPC_DEFS['root-heart'], { [ROOT_HEART_REACHED]: true })).toBe('root-heart-empty');
    expect(npcSpriteId(NPC_DEFS['root-heart'], { [ROOT_HEART_REACHED]: true, [UMBRA_NAMED]: true })).toBe('root-heart-gold');
  });

  it('Sage Aster is home in the Hall of Names once her name is said', () => {
    const hill = ZONES['remembrance-hill'];
    const aster = hill.npcs.find((n) => n.defId === 'hall-aster')!;
    expect(aster.ifFlag).toBe(UMBRA_NAMED);
    expect(buildingInside(hill, aster.x, aster.y)?.id).toBe('hall-of-names');
    const mnem = visibleLines(NPC_DEFS['hill-keeper'].lines, { [NAME_LEARNED]: true, [UMBRA_NAMED]: true }).map(lineText).join(' ');
    expect(mnem).toMatch(/Not one plaque in this Hall is blank now/);
  });
});
