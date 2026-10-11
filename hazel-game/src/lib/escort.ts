/**
 * An escort's walk (#75 item 14g — Posy through Foglight Marsh): pure follow
 * logic, wired to the canvas by `WorldCanvas`.
 *
 * The one being walked follows the hero's own footsteps (a trail of crumbs
 * dropped as the hero moves), so they only ever tread where the hero did —
 * never through a reed bed or across a pool — and keep a little way behind.
 * While a critter is near them they wait, and walk on once it's gone; a long
 * way behind, they hurry to catch up.
 */

export interface Pt {
  x: number;
  y: number;
}

/** How far behind the hero they keep, along the hero's path (px). */
export const ESCORT_GAP = 44;
/** Walking pace (px/s) — a little slower than the hero's 170… */
export const ESCORT_SPEED = 150;
/** …but quicker when they've fallen this far behind (px along the path). */
export const ESCORT_CATCH_UP_AT = 160;
export const ESCORT_CATCH_UP_SPEED = 230;
/** A critter this near them (px) and they stop and wait. */
export const ESCORT_WAIT_PX = 80;
/** This near the goal's centre (px) and they've arrived — with the hero at the goal, they're a gap behind. */
export const ESCORT_ARRIVE_PX = 56;
/** A crumb every this many px the hero moves. */
const CRUMB_PX = 8;
/** At most this many crumbs (a long wait): the oldest go — they walk straight to the next. */
const MAX_CRUMBS = 2000;

export interface EscortState {
  /** Where they stand. */
  at: Pt;
  /** The hero's footsteps they still have to walk, oldest first. */
  crumbs: Pt[];
  /** Waiting for a critter to go away. */
  waiting: boolean;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** A walk starting from `at` (where they wait, or where a battle left them). */
export function startEscort(at: Pt): EscortState {
  return { at: { ...at }, crumbs: [], waiting: false };
}

/** The hero moved: drop a crumb once they're far enough past the last one. */
export function dropCrumb(s: EscortState, hero: Pt): EscortState {
  const last = s.crumbs.at(-1) ?? s.at;
  if (dist(last, hero) < CRUMB_PX) return s;
  const crumbs = [...s.crumbs, { x: hero.x, y: hero.y }];
  return { ...s, crumbs: crumbs.length > MAX_CRUMBS ? crumbs.slice(crumbs.length - MAX_CRUMBS) : crumbs };
}

/** Is a critter near enough to make them wait? `threats`: where the awake critters are. */
export function waitsFor(at: Pt, threats: Pt[]): boolean {
  return threats.some((t) => dist(at, t) < ESCORT_WAIT_PX);
}

/** How far they'd walk to reach the hero along the crumbs (px). */
export function trailLength(s: EscortState, hero: Pt): number {
  let len = 0;
  let from = s.at;
  for (const c of s.crumbs) {
    len += dist(from, c);
    from = c;
  }
  return len + dist(from, hero);
}

/**
 * One frame of the walk: wait while a critter is near; otherwise walk the
 * crumbs, keeping `ESCORT_GAP` of the path between them and the hero.
 */
export function stepEscort(s: EscortState, hero: Pt, threats: Pt[], dt: number): EscortState {
  if (waitsFor(s.at, threats)) return s.waiting ? s : { ...s, waiting: true };
  let left = trailLength(s, hero);
  let budget = (left > ESCORT_CATCH_UP_AT ? ESCORT_CATCH_UP_SPEED : ESCORT_SPEED) * dt;
  let at = s.at;
  let n = 0;
  while (budget > 0 && n < s.crumbs.length && left > ESCORT_GAP) {
    const c = s.crumbs[n];
    const d = dist(at, c);
    // Never closer to the hero than the gap.
    const step = Math.min(budget, d, left - ESCORT_GAP);
    if (step >= d) {
      at = c;
      n += 1;
    } else {
      at = { x: at.x + ((c.x - at.x) * step) / d, y: at.y + ((c.y - at.y) * step) / d };
    }
    budget -= step;
    left -= step;
    if (step < d) break;
  }
  return { at, crumbs: n ? s.crumbs.slice(n) : s.crumbs, waiting: false };
}

/**
 * Have they reached the goal cell (`TILE`-px cells)? Within reach of it — or,
 * with the hero beside the goal (`hero`), walking on behind them and not held
 * up: the hero came at it another way (over the grass, from the side), and
 * the gap would keep them a step short for ever (#75 item 14g UX review).
 */
export function arrived(at: Pt, goal: Pt, tile: number, hero?: Pt, waiting = false): boolean {
  const g = { x: goal.x * tile + tile / 2, y: goal.y * tile + tile / 2 };
  if (dist(at, g) < ESCORT_ARRIVE_PX) return true;
  return !!hero && !waiting && dist(hero, g) < tile * 2.5 && dist(at, hero) < tile * 3 && dist(at, g) < tile * 5;
}

/**
 * Should the hero be told they've left them behind? With the hero at the goal
 * and them far off — but only while a critter holds them up: one just walking
 * a little behind (a slower pace, so the gap grows on a long walk) catches up
 * on their own (#75 item 14g review).
 */
export function stuckBehind(s: EscortState, hero: Pt, goal: Pt, tile: number): boolean {
  const g = { x: goal.x * tile + tile / 2, y: goal.y * tile + tile / 2 };
  return s.waiting && dist(hero, g) < tile * 1.5 && dist(s.at, g) > tile * 3;
}
