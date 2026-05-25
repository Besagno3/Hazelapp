import { describe, it, expect } from 'vitest';
import { isoOffset, nextStreak, todayIso } from './streak';

describe('todayIso', () => {
  it('formats a date as YYYY-MM-DD in local time', () => {
    // Local-time construction — never UTC drift.
    expect(todayIso(new Date(2026, 4, 17))).toBe('2026-05-17');
  });

  it('zero-pads single-digit months and days', () => {
    expect(todayIso(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

describe('isoOffset', () => {
  it('returns the prior day', () => {
    expect(isoOffset('2026-05-17', -1)).toBe('2026-05-16');
  });

  it('handles month rollovers', () => {
    expect(isoOffset('2026-05-01', -1)).toBe('2026-04-30');
  });

  it('handles year rollovers', () => {
    expect(isoOffset('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('nextStreak', () => {
  it('is unchanged on a same-day replay', () => {
    expect(nextStreak(4, '2026-05-17', '2026-05-17')).toBe(4);
  });

  it('increments when the player last played yesterday', () => {
    expect(nextStreak(4, '2026-05-16', '2026-05-17')).toBe(5);
  });

  it('resets to 1 after a gap', () => {
    expect(nextStreak(4, '2026-05-14', '2026-05-17')).toBe(1);
  });

  it('starts at 1 the very first time the player plays', () => {
    expect(nextStreak(0, null, '2026-05-17')).toBe(1);
  });
});
