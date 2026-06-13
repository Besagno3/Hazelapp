import type { Avatar, PowerUpId, PowerUps } from '../types';

export interface PowerUpInfo {
  id: PowerUpId;
  name: string;
  icon: string;
  description: string;
}

/** The full power-up catalogue — `LevelUpModal` picks 2 of these per level. */
export const POWER_UPS: PowerUpInfo[] = [
  { id: 'attack', name: 'Power Strike', icon: '⚔️', description: 'Deal more damage in battle.' },
  { id: 'defense', name: 'Iron Guard', icon: '🛡️', description: 'Block more enemy damage.' },
  { id: 'vitality', name: 'Vitality', icon: '❤️', description: 'Start every battle with more HP.' },
  { id: 'scholar', name: 'Scholar', icon: '📖', description: 'Earn bonus XP for correct answers.' },
];

// Per-stack bonuses at full credit (stacks 1-5).
const ATTACK_PER = 6;
const DEFENSE_PER = 5;
const VITALITY_PER = 25;
const SCHOLAR_PER = 5;

// Soft-cap tiers (#27): full credit for the first 5 stacks, half for 6-10,
// quarter for 11+. Prevents late-game power-ups from trivialising battles
// while still rewarding investment.
const FULL_RANGE = 5;
const HALF_RANGE = 5;

/** Effective stack count after diminishing returns. */
export function effectiveStacks(stacks: number): number {
  if (stacks <= FULL_RANGE) return stacks;
  if (stacks <= FULL_RANGE + HALF_RANGE) {
    return FULL_RANGE + (stacks - FULL_RANGE) * 0.5;
  }
  return FULL_RANGE + HALF_RANGE * 0.5 + (stacks - FULL_RANGE - HALF_RANGE) * 0.25;
}

/** Extra attack-damage base from the player's Power Strike stacks. */
export function attackBonus(p: PowerUps): number {
  return Math.round(effectiveStacks(p.attack ?? 0) * ATTACK_PER);
}

/** Extra damage blocked from the player's Iron Guard stacks. */
export function defenseBonus(p: PowerUps): number {
  return Math.round(effectiveStacks(p.defense ?? 0) * DEFENSE_PER);
}

/** Extra battle HP from the player's Vitality stacks. */
export function hpBonus(p: PowerUps): number {
  return Math.round(effectiveStacks(p.vitality ?? 0) * VITALITY_PER);
}

/** Extra XP per correct answer from the player's Scholar stacks. */
export function xpBonusPerCorrect(p: PowerUps): number {
  return Math.round(effectiveStacks(p.scholar ?? 0) * SCHOLAR_PER);
}

/** The hero's max battle HP: avatar base + Vitality stacks (#37). */
export function heroMaxHp(avatar: Avatar | null, p: PowerUps): number {
  return (avatar?.maxHp ?? 100) + hpBonus(p);
}

/** Total power-ups chosen — one per level-up acknowledged. */
export function totalPowerUps(p: PowerUps): number {
  return Object.values(p).reduce((sum: number, n) => sum + (n ?? 0), 0);
}

/**
 * Deterministic 2-of-4 (or N-of-4) random subset of POWER_UPS for a given
 * level. Same level always offers the same choices (refresh-proof), but
 * different levels rotate through the catalogue so kids can't just pick
 * attack forever — they have to choose what's offered. (#27)
 */
export function choicesForLevel(level: number, count = 2): PowerUpInfo[] {
  const out = [...POWER_UPS];
  // Tiny LCG seeded by level. Good enough for "shuffle a 4-element array".
  let seed = level * 9301 + 49297;
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280;
    const j = Math.floor((seed / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, count);
}
