import { describe, it, expect } from 'vitest';
import { spellsKnown, SPELL_LEVEL_BONUS, MEND, AEGIS, EMBER_BREATH } from './spells';
import { CHARGE_MAX } from './abilities';
import { crystalFlag, TOPICS } from './topics';
import { EMBER_HATCHED } from './story';
import { defaultSave } from '../lib/save';
import type { SaveData } from '../types';

function saveWith(patch: Partial<SaveData>): SaveData {
  return { ...defaultSave(), ...patch };
}

describe('spellsKnown', () => {
  it('a fresh hero knows only Mend', () => {
    const spells = spellsKnown(defaultSave());
    expect(spells).toHaveLength(1);
    expect(spells[0].id).toBe(MEND.id);
  });

  it('meeting a Sage adds that topic\'s signature spell', () => {
    const spells = spellsKnown(saveWith({ sages: ['math'] }));
    expect(spells.some((s) => s.id === 'sage-math')).toBe(true);
    // …and only that one Sage spell.
    expect(spells.filter((s) => s.id.startsWith('sage-'))).toHaveLength(1);
  });

  it('restoring the first crystal unlocks Aegis', () => {
    expect(spellsKnown(defaultSave()).some((s) => s.id === AEGIS.id)).toBe(false);
    const oneCrystal = saveWith({ flags: { [crystalFlag('math')]: true } });
    expect(spellsKnown(oneCrystal).some((s) => s.id === AEGIS.id)).toBe(true);
  });

  it("Ember's Breath unlocks only when Ember is full-grown (4 crystals, hatched)", () => {
    const flags: Record<string, boolean> = { [EMBER_HATCHED]: true };
    for (const t of TOPICS) flags[crystalFlag(t)] = true;
    expect(spellsKnown(saveWith({ flags })).some((s) => s.id === EMBER_BREATH.id)).toBe(true);
    // Not hatched yet (still an egg) → no dragonfire.
    const notHatched = { ...flags };
    delete notHatched[EMBER_HATCHED];
    expect(spellsKnown(saveWith({ flags: notHatched })).some((s) => s.id === EMBER_BREATH.id)).toBe(
      false,
    );
  });

  it('every spell is castable within the charge gauge and questions are super-hard', () => {
    const flags: Record<string, boolean> = { [EMBER_HATCHED]: true };
    for (const t of TOPICS) flags[crystalFlag(t)] = true;
    const all = spellsKnown(saveWith({ sages: [...TOPICS], flags }));
    for (const spell of all) {
      expect(spell.cost).toBeGreaterThan(0);
      expect(spell.cost).toBeLessThanOrEqual(CHARGE_MAX);
      expect(spell.name.length).toBeGreaterThan(0);
      expect(spell.description.length).toBeGreaterThan(10);
    }
    // "Super-hard" must be meaningfully above the enemy's level.
    expect(SPELL_LEVEL_BONUS).toBeGreaterThanOrEqual(2);
  });
});
