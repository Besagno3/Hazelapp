import { describe, it, expect, afterEach } from 'vitest';
import { actComplete, actCrystals, actRestored, crystalFlag, TOPIC_REGISTRY } from './topics';
import { ACT2_SEEN, crystalsInPlay, emberStatus } from './story';
import { ZONES } from './zones';
import { nextObjective, mentorTips, type Objective } from '../lib/wayfinding';
import { actOneJourney, advanceGoal } from '../lib/journey';
import { defaultSave } from '../lib/save';
import { addFakeActTwoCrystal, FAKE_ACT_TWO_CRYSTAL } from '../test/fakeCrystal';

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

describe('crystals belong to an act (#75 item 14c)', () => {
  let remove: (() => void) | null = null;
  afterEach(() => {
    remove?.();
    remove = null;
  });

  it("today's four are Act I's, in the 🚩's order", () => {
    expect(actCrystals(1).map((t) => t.id)).toEqual(['math', 'science', 'engineering', 'creativity']);
    expect(TOPIC_REGISTRY.every((t) => t.act === 1)).toBe(true);
    expect(actCrystals(2)).toEqual([]);
  });

  it('counts and completes one act at a time', () => {
    expect(actRestored({}, 1)).toBe(0);
    expect(actComplete({ [crystalFlag('math')]: true }, 1)).toBe(false);
    expect(actRestored(ACT_ONE, 1)).toBe(4);
    expect(actComplete(ACT_ONE, 1)).toBe(true);
    // An act with no crystals yet isn't complete (review fix): no "Act II done" before Act II exists.
    expect(actComplete(ACT_ONE, 2)).toBe(false);
    expect(actComplete({}, 3)).toBe(false);
  });

  describe('with an Act II crystal added, Act I is unchanged', () => {
    it('Act I is still complete with its four — the Spire stays open and the ending still plays', () => {
      remove = addFakeActTwoCrystal();
      expect(actCrystals(1)).toHaveLength(4);
      expect(actComplete(ACT_ONE, 1)).toBe(true);
      expect(actComplete(ACT_ONE, 2)).toBe(false);
    });

    it('the HUD counts Act I alone until Act II opens, then the new crystal too', () => {
      remove = addFakeActTwoCrystal();
      expect(crystalsInPlay(ACT_ONE)).toEqual({ restored: 4, total: 4 });
      expect(crystalsInPlay({ ...ACT_ONE, [ACT2_SEEN]: true })).toEqual({ restored: 4, total: 5 });
      expect(
        crystalsInPlay({ ...ACT_ONE, [ACT2_SEEN]: true, [crystalFlag(FAKE_ACT_TWO_CRYSTAL.id)]: true }),
      ).toEqual({ restored: 5, total: 5 });
    });

    it('Ember still grows with every crystal restored', () => {
      remove = addFakeActTwoCrystal();
      expect(emberStatus({ ...ACT_ONE, [crystalFlag(FAKE_ACT_TWO_CRYSTAL.id)]: true }).crystals).toBe(5);
    });

    it("the 🚩 and Elder Lumen's plans are the same, step for step, from a new save to the end", () => {
      const before = storyWalk();
      remove = addFakeActTwoCrystal();
      const after = storyWalk();
      expect(after.goals).toEqual(before.goals);
      expect(after.tips).toEqual(before.tips);
      expect(after.goals.some((g) => g.includes(FAKE_ACT_TWO_CRYSTAL.crystalName))).toBe(false);
    });

    it("Act I's journey still has its 8 legs, zone for zone", () => {
      const legs = (j: ReturnType<typeof actOneJourney>) => j.map((l) => `${l.goal.title}: ${l.hops.map((h) => h.zoneId).join(' → ')}`);
      const before = legs(actOneJourney());
      remove = addFakeActTwoCrystal();
      expect(legs(actOneJourney())).toEqual(before);
      expect(before).toHaveLength(8);
    });
  });
});
