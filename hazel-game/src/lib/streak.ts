// Daily-streak math. Pure functions — date strings in, numbers out — so the
// store can call them inside an optimistic update and tests don't need to
// mock the clock. ISO format is YYYY-MM-DD in the player's *local* timezone
// (a kid in Tokyo and a kid in NYC each get their own calendar day).

/** Local-date ISO string (YYYY-MM-DD) for the given Date. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Shifts an ISO date by `days` (negative = earlier), returning a new ISO string. */
export function isoOffset(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return todayIso(date);
}

/**
 * Streak after recording today's activity.
 *
 * - Already played today  → unchanged.
 * - Last played yesterday → +1 (the streak continues).
 * - Older or never        → 1 (a new streak starts today).
 */
export function nextStreak(prev: number, lastPlayed: string | null, today: string): number {
  if (lastPlayed === today) return prev;
  if (lastPlayed === isoOffset(today, -1)) return prev + 1;
  return 1;
}
