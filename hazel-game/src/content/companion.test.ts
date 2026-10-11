import { describe, it, expect } from 'vitest';
import {
  COMPANIONS,
  COMPANION_IDS,
  PAIR_ATTACKS,
  companionCanFight,
  companionPower,
  companionSprite,
  companionsInParty,
  emberCanFight,
  pairAttacksFor,
  pairAttacksKnown,
} from './companion';
import { EMBER_BREATH, sageSpell } from './spells';
import { pairDamage, spellDamage } from '../lib/battleMath';
import { CHARGE_MAX } from './abilities';
import { QUESTS, questDoneFlag } from './quests';
import { GENERATED_SPRITES } from './sprites.generated';
import { FIGHT_STYLES } from '../types';

describe('companions', () => {
  it('Ember only fights once hatched; the others always can', () => {
    expect(emberCanFight('egg')).toBe(false);
    expect(emberCanFight('hatchling')).toBe(true);
    expect(companionCanFight('pip', 'egg')).toBe(true);
  });

  it('Ember is always in the party; Pip and Wisp join when their quest is done', () => {
    expect(companionsInParty({ flags: {} })).toEqual(['ember']);
    const all = Object.fromEntries(COMPANION_IDS.map((id) => [COMPANIONS[id].joinFlag ?? 'x', true]));
    expect(companionsInParty({ flags: all })).toEqual([...COMPANION_IDS]);
  });

  it("every join flag is a real quest's done flag", () => {
    const doneFlags = QUESTS.map(questDoneFlag);
    for (const id of COMPANION_IDS) {
      const flag = COMPANIONS[id].joinFlag;
      if (flag) expect(doneFlags, id).toContain(flag);
    }
  });

  it('every companion has a battle sprite and at least one Pair Attack once able to fight', () => {
    for (const id of COMPANION_IDS) {
      const { spriteId } = companionSprite(id, 'dragon');
      expect(GENERATED_SPRITES[spriteId]?.battle, id).toBeDefined();
      expect(pairAttacksFor(id, 'dragon').length, id).toBeGreaterThan(0);
      expect(companionPower(id, 'dragon'), id).toBeGreaterThan(0);
    }
  });

  it("unlocks more of Ember's Pair Attacks as Ember grows", () => {
    expect(pairAttacksKnown('egg')).toEqual([]);
    expect(pairAttacksKnown('hatchling').map((p) => p.id)).toEqual(['twin-strike']);
    expect(pairAttacksKnown('whelp').map((p) => p.id)).toEqual(['twin-strike', 'blazing-comet']);
    expect(pairAttacksKnown('dragon')).toHaveLength(PAIR_ATTACKS.filter((p) => p.companion === 'ember').length);
  });

  it('every Pair Attack is affordable within the charge gauge, with a unique id', () => {
    for (const p of PAIR_ATTACKS) expect(p.cost).toBeLessThanOrEqual(CHARGE_MAX);
    expect(new Set(PAIR_ATTACKS.map((p) => p.id)).size).toBe(PAIR_ATTACKS.length);
  });

  it('a Pair Attack outdamages any solo damage spell of the same (or lower) cost — for every hero type', () => {
    const solo = [sageSpell('math'), EMBER_BREATH];
    for (const style of FIGHT_STYLES) {
      for (const pair of PAIR_ATTACKS) {
        const pd = pairDamage(style, {}, companionPower(pair.companion, pair.unlock ?? 'hatchling'), pair.multiplier);
        for (const spell of solo) {
          if (spell.effect.kind !== 'damage' || spell.cost > pair.cost) continue;
          expect(pd, `${style}: ${pair.id} vs ${spell.id}`).toBeGreaterThan(spellDamage(style, {}, spell.effect.multiplier));
        }
      }
    }
  });
});
