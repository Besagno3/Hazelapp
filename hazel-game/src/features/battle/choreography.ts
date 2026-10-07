/**
 * Battle choreography for the hero + their companion: which motion each actor plays for
 * a move, the Framer Motion keyframes for those motions, and when the blow
 * lands. Pure data so the timing rules are unit-tested and BattleArena only
 * has to play them back.
 *
 * Screen layout reminder: the enemy stands LEFT, the hero RIGHT with the
 * companion at the hero's side — so "toward the enemy" is negative x.
 */

export type HeroMove = 'lunge' | 'comet' | 'duet';
/** Companion motions; `breath` / `toss` / `duet` are Ember's big moves. */
export type CompanionMotion = 'lunge' | 'breath' | 'toss' | 'duet';

export interface Keyframes {
  x: number[];
  y?: number[];
  times?: number[];
  /** Seconds. */
  duration: number;
  /**
   * Travels all the way to the enemy: `fitReach` rescales x to the measured
   * on-screen gap (the authored values assume a ~900px-wide arena).
   */
  reach?: boolean;
}

export const HERO_MOTION: Record<HeroMove, Keyframes> = {
  lunge: { x: [0, -70, 0], duration: 0.5 },
  // Blazing Comet: Ember flings the hero up in an arc, they crash down on the enemy.
  comet: { x: [0, -40, -230, 0], y: [0, -170, 0, 0], times: [0, 0.35, 0.6, 1], duration: 0.95, reach: true },
  // Dragon Duet: rise together, then dive side by side.
  duet: { x: [0, 10, -210, 0], y: [0, -120, 0, 0], times: [0, 0.35, 0.6, 1], duration: 0.95, reach: true },
};

export const COMPANION_MOTION: Record<CompanionMotion, Keyframes> = {
  lunge: { x: [0, -110, 0], duration: 0.5 },
  // Breathing fire: brace back on the inhale, recoil forward on the blast.
  breath: { x: [0, 8, -12, 0], times: [0, 0.25, 0.5, 1], duration: 0.7 },
  // Tossing the hero skyward: a short upward heave.
  toss: { x: [0, -24, 0], y: [0, -14, 0], duration: 0.5 },
  duet: { x: [0, 10, -250, 0], y: [0, -140, -10, 0], times: [0, 0.35, 0.6, 1], duration: 0.95, reach: true },
};

/** Which sprite clip a companion motion plays (sheets without `breath` fall back to idle). */
export const COMPANION_CLIP: Record<CompanionMotion, 'attack' | 'breath'> = {
  lunge: 'attack',
  breath: 'breath',
  toss: 'attack',
  duet: 'breath',
};

/** How long a fireball takes to cross the arena (ms). */
export const FIREBALL_FLIGHT_MS = 300;
/** Gap between fireballs in a volley (ms). */
export const FIREBALL_STAGGER_MS = 70;

export interface Choreo {
  hero?: HeroMove;
  companion?: CompanionMotion;
  /** When the blow lands (damage number, impact SFX, enemy flinch), in ms. */
  hitMs: number;
  /** Delay before the move's wind-up sound, in ms. */
  soundMs: number;
  /** Fireballs Ember spits at the enemy (0 = none; Ember's moves only). */
  fireballs: number;
}

/** The default single-actor strike (Attack / spells: the hero; a companion's strike). */
export const HERO_STRIKE: Choreo = { hero: 'lunge', hitMs: 260, soundMs: 0, fireballs: 0 };
export const COMPANION_STRIKE: Choreo = { companion: 'lunge', hitMs: 260, soundMs: 0, fireballs: 0 };
/** Ember's Breath: Ember inhales, then a fireball volley crosses the arena. */
export const EMBER_BREATH: Choreo = { companion: 'breath', hitMs: 560, soundMs: 0, fireballs: 3 };

/**
 * Per-Pair-Attack choreography. The 'pair' SFX has its impacts ~450ms in, so
 * the slower combos start it late enough that the thud lands with the hit.
 */
export const PAIR_CHOREO: Record<string, Choreo> = {
  'twin-strike': { hero: 'lunge', companion: 'lunge', hitMs: 260, soundMs: 0, fireballs: 0 },
  'blazing-comet': { hero: 'comet', companion: 'toss', hitMs: 570, soundMs: 120, fireballs: 0 },
  'dragon-duet': { hero: 'duet', companion: 'duet', hitMs: 570, soundMs: 120, fireballs: 3 },
  'marble-volley': { hero: 'lunge', companion: 'lunge', hitMs: 260, soundMs: 0, fireballs: 0 },
  'starlight-chorus': { hero: 'lunge', companion: 'lunge', hitMs: 260, soundMs: 0, fireballs: 0 },
};

/** Choreography for a Pair Attack id (unknown ids fall back to Twin Strike's). */
export function pairChoreo(id: string): Choreo {
  return PAIR_CHOREO[id] ?? PAIR_CHOREO['twin-strike'];
}

/** When fireball `i` of a volley launches so the LAST one arrives at `hitMs`. */
export function fireballLaunchMs(c: Choreo, i: number): number {
  const lastLaunch = c.hitMs - FIREBALL_FLIGHT_MS;
  return Math.max(0, lastLaunch - (c.fireballs - 1 - i) * FIREBALL_STAGGER_MS);
}

/** How long an actor stays in its "acting" pose for a motion (ms). */
export function actingMs(k: Keyframes): number {
  return Math.round(k.duration * 1000) + 20;
}

/** The moment the moving actor reaches the enemy, as a fraction of its motion. */
export function contactFraction(k: Keyframes): number {
  const i = k.x.indexOf(Math.min(...k.x));
  return k.times ? k.times[i] : i / (k.x.length - 1);
}

/** Fraction of the hero↔enemy gap a reaching move covers (stops just short). */
export const REACH_FRACTION = 0.85;

/**
 * Rescale a reaching motion's x so its deepest point covers `REACH_FRACTION`
 * of the measured gap (px between the hero's left edge and the enemy's right
 * edge). Non-reaching motions, or an unknown gap, keep their authored values.
 */
export function fitReach(k: Keyframes, gapPx: number | null): Keyframes {
  if (!k.reach || gapPx == null || gapPx <= 0) return k;
  const deepest = -Math.min(...k.x);
  const factor = (gapPx * REACH_FRACTION) / deepest;
  return { ...k, x: k.x.map((x) => Math.round(x * factor)) };
}
