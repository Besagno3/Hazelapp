import { describe, it, expect } from 'vitest';
import { PAIR_ATTACKS, emberCanFight, pairAttacksKnown } from './companion';
import { EMBER_BREATH, sageSpell } from './spells';
import { pairDamage, spellDamage } from '../lib/battleMath';
import { CHARGE_MAX } from './abilities';

describe('Ember companion', () => {
  it('only fights once hatched', () => {
    expect(emberCanFight('egg')).toBe(false);
    expect(emberCanFight('hatchling')).toBe(true);
  });

  it('unlocks more Pair Attacks as Ember grows', () => {
    expect(pairAttacksKnown('egg')).toEqual([]);
    expect(pairAttacksKnown('hatchling').map((p) => p.id)).toEqual(['twin-strike']);
    expect(pairAttacksKnown('whelp').map((p) => p.id)).toEqual(['twin-strike', 'blazing-comet']);
    expect(pairAttacksKnown('dragon')).toHaveLength(PAIR_ATTACKS.length);
  });

  it('every Pair Attack is affordable within the charge gauge', () => {
    for (const p of PAIR_ATTACKS) expect(p.cost).toBeLessThanOrEqual(CHARGE_MAX);
  });

  it('a Pair Attack outdamages any solo damage spell of the same (or higher) cost', () => {
    const solo = [sageSpell('math'), EMBER_BREATH];
    for (const pair of PAIR_ATTACKS) {
      const pd = pairDamage('balanced', {}, pair.unlock, pair.multiplier);
      for (const spell of solo) {
        if (spell.effect.kind !== 'damage' || spell.cost > pair.cost) continue;
        expect(pd, `${pair.id} vs ${spell.id}`).toBeGreaterThan(
          spellDamage('balanced', {}, spell.effect.multiplier),
        );
      }
    }
  });
});
