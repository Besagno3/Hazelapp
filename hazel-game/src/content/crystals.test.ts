import { describe, it, expect, afterEach } from 'vitest';
import { actComplete, actCrystals, actRestored, crystalFlag, TOPIC_REGISTRY } from './topics';
import { ACT2_SEEN, EMBER_HATCHED, crystalsInPlay, emberStatus } from './story';
import { ZONES } from './zones';
import { nextObjective, mentorTips, type Objective } from '../lib/wayfinding';
import { actOneJourney, advanceGoal } from '../lib/journey';
import { defaultSave } from '../lib/save';
import { addFakeLaterCrystal, FAKE_LATER_CRYSTAL } from '../test/fakeCrystal';

/** Act I's four, by flag. */
const ACT_ONE = Object.fromEntries(actCrystals(1).map((t) => [crystalFlag(t.id), true]));

/** The 🚩 from a brand-new save to "Explore", and Elder Lumen's plan at each step. */
function storyWalk(): { goals: string[]; tips: string[] } {
  let flags: Record<string, boolean> = { ...defaultSave().flags };
  const goals: string[] = [];
  const tips: string[] = [];
  for (let i = 0; i < 40; i++) {
    const g: Objective = nextObjective(flags);
    goals.push(`${g.kind}: ${g.title} @ ${g.zoneId ?? '-'}`);
    tips.push(mentorTips(ZONES, flags).join(' | '));
    if (g.kind === 'explore') break;
    flags = advanceGoal(g, flags);
  }
  return { goals, tips };
}

describe('crystals belong to an act (#75 items 14c, 14h)', () => {
  let remove: (() => void) | null = null;
  afterEach(() => {
    remove?.();
    remove = null;
  });

  it("Act I's four, in the 🚩's order; Act II's one, the Crystal of Memory (#75 item 14h); Act III's, Voices (15g)", () => {
    expect(actCrystals(1).map((t) => t.id)).toEqual(['math', 'science', 'engineering', 'creativity']);
    expect(actCrystals(2).map((t) => t.id)).toEqual(['history']);
    expect(actCrystals(2)[0]).toMatchObject({ crystalName: 'Crystal of Memory', fiendName: 'The Hollow Fiend', zoneId: 'sunken-archive' });
    expect(actCrystals(3).map((t) => t.id)).toEqual(['words']);
    expect(actCrystals(3)[0]).toMatchObject({ crystalName: 'Crystal of Voices', fiendName: 'The Hush Fiend', zoneId: 'chorus-isle' });
    expect(TOPIC_REGISTRY.every((t) => t.act <= 3)).toBe(true);
    expect(actCrystals(4)).toEqual([]);
  });

  it('counts and completes one act at a time', () => {
    expect(actRestored({}, 1)).toBe(0);
    expect(actComplete({ [crystalFlag('math')]: true }, 1)).toBe(false);
    expect(actRestored(ACT_ONE, 1)).toBe(4);
    expect(actComplete(ACT_ONE, 1)).toBe(true);
    expect(actComplete(ACT_ONE, 2)).toBe(false);
    expect(actComplete({ ...ACT_ONE, [crystalFlag('history')]: true }, 2)).toBe(true);
    // Memory alone completes Act II, not Act I — one act at a time.
    expect(actComplete({ [crystalFlag('history')]: true }, 1)).toBe(false);
    // An act with no crystals yet isn't complete (review fix): no "Act IV done" before Act IV exists.
    expect(actComplete({}, 4)).toBe(false);
    expect(actComplete({ [crystalFlag('words')]: true }, 3)).toBe(true);
  });

  it('the HUD counts Act I alone until Act II opens, then Memory too', () => {
    expect(crystalsInPlay(ACT_ONE)).toEqual({ restored: 4, total: 4 });
    expect(crystalsInPlay({ ...ACT_ONE, [ACT2_SEEN]: true })).toEqual({ restored: 4, total: 5 });
    expect(crystalsInPlay({ ...ACT_ONE, [ACT2_SEEN]: true, [crystalFlag('history')]: true })).toEqual({ restored: 5, total: 5 });
  });

  it('Ember still grows with every crystal restored — a full-grown dragon stays one at five', () => {
    const five = emberStatus({ ...ACT_ONE, [EMBER_HATCHED]: true, [crystalFlag('history')]: true });
    expect(five).toEqual({ crystals: 5, stage: 'dragon' });
  });

  it("the 🚩 walks Act I's four in order, then the Spire, then Act II — Memory after its key", () => {
    const { goals } = storyWalk();
    const crystals = goals.filter((g) => g.startsWith('crystal:'));
    expect(crystals).toEqual([
      'crystal: Free the Crystal of Numbers @ numbria',
      'crystal: Free the Crystal of Nature @ verdara',
      'crystal: Free the Crystal of Gears @ gearfall',
      'crystal: Free the Crystal of Wonder @ chromaria',
      'crystal: Free the Crystal of Memory @ sunken-archive',
      'crystal: Free the Crystal of Voices @ chorus-isle',
    ]);
    const at = (title: string) => goals.findIndex((g) => g.includes(title));
    expect(at('Climb the Crystal Spire')).toBeGreaterThan(at('Crystal of Wonder'));
    expect(at('Crystal of Memory')).toBeGreaterThan(at('Win the Memoria Key'));
    // Voices waits for BOTH Chorus Keys (#75 item 15g).
    expect(at('Crystal of Voices')).toBeGreaterThan(at('Win the First Chorus Key'));
    expect(at('Crystal of Voices')).toBeGreaterThan(at('Win the Second Chorus Key'));
    expect(goals.at(-1)).toMatch(/^explore:/);
  });

  describe("with a later act's crystal added, Acts I–III are unchanged", () => {
    it('Act I is still complete with its four — the Spire stays open and the ending still plays', () => {
      remove = addFakeLaterCrystal();
      expect(actCrystals(1)).toHaveLength(4);
      expect(actComplete(ACT_ONE, 1)).toBe(true);
      expect(actCrystals(2)).toHaveLength(1);
    });

    it('the HUD counts only the acts that have opened', () => {
      remove = addFakeLaterCrystal();
      expect(crystalsInPlay(ACT_ONE)).toEqual({ restored: 4, total: 4 });
      expect(crystalsInPlay({ ...ACT_ONE, [ACT2_SEEN]: true })).toEqual({ restored: 4, total: 5 });
    });

    it('Ember still grows with every crystal restored', () => {
      remove = addFakeLaterCrystal();
      expect(emberStatus({ ...ACT_ONE, [crystalFlag('history')]: true, [crystalFlag(FAKE_LATER_CRYSTAL.id)]: true }).crystals).toBe(6);
    });

    it("the 🚩 and Elder Lumen's plans are the same, step for step, from a new save to the end", () => {
      const before = storyWalk();
      remove = addFakeLaterCrystal();
      const after = storyWalk();
      expect(after.goals).toEqual(before.goals);
      expect(after.tips).toEqual(before.tips);
      expect(after.goals.some((g) => g.includes(FAKE_LATER_CRYSTAL.crystalName))).toBe(false);
    });

    it("Act I's journey still has its 8 legs, zone for zone", () => {
      const legs = (j: ReturnType<typeof actOneJourney>) => j.map((l) => `${l.goal.title}: ${l.hops.map((h) => h.zoneId).join(' → ')}`);
      const before = legs(actOneJourney());
      remove = addFakeLaterCrystal();
      expect(legs(actOneJourney())).toEqual(before);
      expect(before).toHaveLength(8);
    });
  });
});
