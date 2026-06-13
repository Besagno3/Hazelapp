import type { SpriteAnim } from '../lib/spriteAnim';

/**
 * One rendered view of a character. Convention: a single PNG whose frames are
 * laid out left-to-right in one horizontal strip; `frames` is the total count,
 * and each anim indexes a contiguous range into that strip.
 */
export interface SpriteView {
  /** Public asset path, e.g. '/sprites/spore-puff/battle.png'. */
  sheet: string;
  frameW: number;
  frameH: number;
  /** Total frames in the strip (sheet pixel width === frames * frameW). */
  frames: number;
  /** Named animations. Must include 'idle'. */
  anims: Record<string, SpriteAnim>;
}

export interface SpriteDef {
  /** Top-down view for the KaPlay world (omit to fall back to emoji there). */
  world?: SpriteView;
  /** Side-view for the battle screen (omit to fall back to emoji there). */
  battle?: SpriteView;
  /** Emoji shown wherever a view is missing or its sheet fails to load. */
  emoji: string;
}

/**
 * Sprite manifest — the single source of truth for character art.
 * Empty until the asset-production task populates the Verdara slice.
 */
export const SPRITES: Record<string, SpriteDef> = {};

/** Look up a character's sprite def, with an emoji fallback. */
export function resolveSprite(
  spriteId: string | undefined,
  fallbackEmoji: string,
): { def: SpriteDef | null; emoji: string } {
  if (spriteId && SPRITES[spriteId]) {
    const def = SPRITES[spriteId];
    return { def, emoji: def.emoji || fallbackEmoji };
  }
  return { def: null, emoji: fallbackEmoji };
}
