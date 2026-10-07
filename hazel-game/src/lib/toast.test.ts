import { describe, expect, it } from 'vitest';
import { TOAST_MAX_MS, TOAST_MIN_MS, toastMs } from './toast';

describe('toastMs', () => {
  it('a short toast stays brief, but never under the minimum', () => {
    const saved = toastMs('💎 Game saved!');
    expect(saved).toBeGreaterThanOrEqual(TOAST_MIN_MS);
    expect(saved).toBeLessThanOrEqual(3000);
    expect(toastMs('')).toBe(TOAST_MIN_MS);
  });
  it('the fog hint gets time for a young reader (~2 words a second)', () => {
    const ms = toastMs('🌫️ Too foggy to pass! Restore a crystal to clear it.');
    expect(ms).toBeGreaterThanOrEqual(5000);
    expect(ms).toBeLessThanOrEqual(TOAST_MAX_MS);
  });
  it('longer text never stays up forever', () => {
    expect(toastMs('word '.repeat(100))).toBe(TOAST_MAX_MS);
  });
});
