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

  it('keeps the original three exactly as they were (saves point at their ids)', () => {
    expect(AVATARS.slice(0, 3).map((a) => [a.id, a.name, a.fightStyle, a.maxHp])).toEqual([
      ['a1', 'Blaze', 'aggressive', 100],
      ['a2', 'Shield', 'defensive', 140],
      ['a3', 'Nova', 'balanced', 120],
    ]);
  });

  it('adds Skye (swift) and Nyx (mystic), each with her own type', () => {
    expect(avatarById('a4')).toMatchObject({ name: 'Skye', fightStyle: 'swift' });
    expect(avatarById('a5')).toMatchObject({ name: 'Nyx', fightStyle: 'mystic' });
  });

  it('every hero type is used, labelled and described; each heroine has two special abilities', () => {
    expect(new Set(AVATARS.map((a) => a.fightStyle))).toEqual(new Set(FIGHT_STYLES));
    for (const style of FIGHT_STYLES) {
      expect(STYLE_LABEL[style], style).toBeTruthy();
      expect(STYLE_DESC[style], style).toBeTruthy();
    }
    for (const style of ['swift', 'mystic'] as const) {
      expect(HERO_ABILITIES[style]).toHaveLength(2);
      for (const ab of HERO_ABILITIES[style]) expect(ab.emoji && ab.name && ab.text).toBeTruthy();
    }
  });
});
