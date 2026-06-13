import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Fraction of a round's questions needed to pass — 0.8 = 4 of 5.
// (Was 0.82, which silently required a perfect 5/5; see ISSUES #2.)
export const PASS_THRESHOLD = 0.8;
export const ROUNDS_TO_UNLOCK = 3;
