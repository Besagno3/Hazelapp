import type { Avatar, FightStyle } from '../types';

/** The playable hero roster (moved from AvatarSelect for reuse, #37). */
export const AVATARS: Avatar[] = [
  { id: 'a1', name: 'Blaze', sprite: '🦁', fightStyle: 'aggressive', maxHp: 100 },
  { id: 'a2', name: 'Shield', sprite: '🐢', fightStyle: 'defensive', maxHp: 140 },
  { id: 'a3', name: 'Nova', sprite: '🦅', fightStyle: 'balanced', maxHp: 120 },
];

export const STYLE_DESC: Record<FightStyle, string> = {
  aggressive: 'High attack damage, lower HP',
  defensive: 'High HP, lower attack',
  balanced: 'Well-rounded stats',
};

export function avatarById(id: string | null): Avatar | null {
  return AVATARS.find((a) => a.id === id) ?? null;
}
