/** One animation = a contiguous run of frames in a sprite's horizontal strip. */
export interface SpriteAnim {
  /** First frame index (0-based) within the strip. */
  from: number;
  /** Last frame index, inclusive. */
  to: number;
  /** Playback rate in frames per second. */
  fps: number;
  /** Loop forever (default) or play once and hold the last frame. */
  loop?: boolean;
}

/** Number of frames the animation spans. */
export function frameCount(anim: SpriteAnim): number {
  return anim.to - anim.from + 1;
}

/**
 * Absolute frame index showing at `tMs` milliseconds since the anim started.
 * Always a frame of the anim: a negative time (a first animation frame can
 * stamp a hair before the start) shows the first frame, and an anim with no
 * speed (`fps` 0 or less) holds it (sprite review A4).
 */
export function frameAt(anim: SpriteAnim, tMs: number): number {
  const count = frameCount(anim);
  const step = anim.fps > 0 ? Math.max(0, Math.floor((tMs / 1000) * anim.fps)) : 0;
  if (anim.loop === false) {
    return anim.from + Math.min(step, count - 1);
  }
  return anim.from + (step % count);
}

/** CSS `background-position-x` (px) for a frame in a horizontal strip. */
export function bgPosX(frameIndex: number, frameWidth: number): number {
  const result = -frameIndex * frameWidth;
  return result === 0 ? 0 : result;
}

/** Duration of one full cycle, in milliseconds — 0 for an anim with no speed (it never cycles, A4). */
export function cycleMs(anim: SpriteAnim): number {
  return anim.fps > 0 ? Math.round((frameCount(anim) / anim.fps) * 1000) : 0;
}
