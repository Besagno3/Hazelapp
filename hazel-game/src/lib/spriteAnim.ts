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

/** Absolute frame index showing at `tMs` milliseconds since the anim started. */
export function frameAt(anim: SpriteAnim, tMs: number): number {
  const count = frameCount(anim);
  const step = Math.floor((tMs / 1000) * anim.fps);
  if (anim.loop === false) {
    return anim.from + Math.min(step, count - 1);
  }
  return anim.from + (((step % count) + count) % count);
}

/** CSS `background-position-x` (px) for a frame in a horizontal strip. */
export function bgPosX(frameIndex: number, frameWidth: number): number {
  const result = -frameIndex * frameWidth;
  return result === 0 ? 0 : result;
}

/** Duration of one full cycle, in milliseconds. */
export function cycleMs(anim: SpriteAnim): number {
  return Math.round((frameCount(anim) / anim.fps) * 1000);
}
