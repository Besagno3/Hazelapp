import type { PowerUpId, PowerUps } from '../types';

export interface PowerUpInfo {
  id: PowerUpId;
  name: string;
  icon: string;
  description: string;
}

/** The power-ups offered on every level-up. */
export const POWER_UPS: PowerUpInfo[] = [
  { id: 'attack', name: 'Power Strike', icon: '⚔️', description: 'Deal more damage in battle.' },
  { id: 'defense', name: 'Iron Guard', icon: '🛡️', description: 'Block more enemy damage.' },
  { id: 'vitality', name: 'Vitality', icon: '❤️', description: 'Start every battle with more HP.' },
  { id: 'scholar', name: 'Scholar', icon: '📖', description: 'Earn bonus XP for correct answers.' },
];

// Per-stack bonuses.
const ATTACK_PER = 6;
const DEFENSE_PER = 5;
const VITALITY_PER = 25;
const SCHOLAR_PER = 5;

/** Extra attack-damage base from the player's Power Strike stacks. */
export function attackBonus(p: PowerUps): number {
  return (p.attack ?? 0) * ATTACK_PER;
}

/** Extra damage blocked from the player's Iron Guard stacks. */
export function defenseBonus(p: PowerUps): number {
  return (p.defense ?? 0) * DEFENSE_PER;
}

/** Extra battle HP from the player's Vitality stacks. */
export function hpBonus(p: PowerUps): number {
  return (p.vitality ?? 0) * VITALITY_PER;
}

/** Extra XP per correct answer from the player's Scholar stacks. */
export function xpBonusPerCorrect(p: PowerUps): number {
  return (p.scholar ?? 0) * SCHOLAR_PER;
}

/** Total power-ups chosen — one per level-up acknowledged. */
export function totalPowerUps(p: PowerUps): number {
  return Object.values(p).reduce((sum: number, n) => sum + (n ?? 0), 0);
}
