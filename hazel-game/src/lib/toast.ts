/**
 * How long a world toast stays up (ms), from how much there is to read.
 * Young readers manage about two words a second, so a short "💎 Game saved!"
 * stays under 3 s while a full sentence (the fog's hint) gets ~6.5 s.
 * Pure — unit-tested.
 */
export const TOAST_MIN_MS = 2500;
export const TOAST_MAX_MS = 8000;
const BASE_MS = 1500;
const PER_WORD_MS = 450;

export function toastMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(TOAST_MAX_MS, Math.max(TOAST_MIN_MS, BASE_MS + words * PER_WORD_MS));
}
