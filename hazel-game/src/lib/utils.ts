import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PASS_THRESHOLD = 0.82;
export const ROUNDS_TO_UNLOCK = 3;

export function calcAttackDamage(correct: number, total: number, base = 30): number {
  return Math.round(base * (correct / total));
}
