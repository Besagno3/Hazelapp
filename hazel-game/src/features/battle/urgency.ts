/**
 * Seconds left at which a countdown turns red and starts ticking: the last
 * 5 s, as the defend question has always had — but on a short clock (a name
 * race) at most a third of it, else it's red from its first second (#159
 * review rounds 2–3). Clocks of 10 s and over keep the 5 s.
 */
const URGENT_SECONDS = 5;
const TICK_SECONDS = 3;
const SHORT_CLOCK_MS = 10_000;

export function urgentAt(durationMs: number): number {
  return durationMs >= SHORT_CLOCK_MS ? URGENT_SECONDS : Math.max(1, Math.floor(durationMs / 3000));
}

export function tickAt(durationMs: number): number {
  return Math.min(TICK_SECONDS, urgentAt(durationMs));
}
