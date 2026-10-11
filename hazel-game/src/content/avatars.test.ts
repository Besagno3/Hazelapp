import { describe, it, expect } from 'vitest';
import { AVATARS, HERO_ABILITIES, STYLE_DESC, STYLE_LABEL, avatarById } from './avatars';
import { FIGHT_STYLES } from '../types';

describe('the hero roster', () => {
  it('has five heroes with unique ids, names and sprites', () => {
    expect(AVATARS).toHaveLength(5);
    for (const key of ['id', 'name', 'spriteId'] as const) {
      expect(new Set(AVATARS.map((a) => a[key])).size, key).toBe(AVATARS.length);
    }
  });

  it('keeps ids a1–a5 on the same types and HP (saves point at the ids), under the new names', () => {
    expect(AVATARS.map((a) => [a.id, a.name, a.fightStyle, a.maxHp])).toEqual([
      ['a1', 'Valor', 'aggressive', 100],
      ['a2', 'Bastion', 'defensive', 140],
      ['a3', 'Talon', 'balanced', 120],
      ['a4', 'Kira', 'swift', 100],
      ['a5', 'Selene', 'mystic', 110],
    ]);
    expect(avatarById('a1')?.name).toBe('Valor');
  });

  it('every hero type is used, labelled, described, and has two signature abilities of its own', () => {
    expect(new Set(AVATARS.map((a) => a.fightStyle))).toEqual(new Set(FIGHT_STYLES));
    const names = new Set<string>();
    for (const style of FIGHT_STYLES) {
      expect(STYLE_LABEL[style], style).toBeTruthy();
      expect(STYLE_DESC[style], style).toBeTruthy();
      expect(HERO_ABILITIES[style], style).toHaveLength(2);
      for (const ab of HERO_ABILITIES[style]) {
        expect(ab.emoji && ab.name && ab.text).toBeTruthy();
        names.add(ab.name);
      }
    }
    expect(names.size).toBe(FIGHT_STYLES.length * 2);
  });
});
