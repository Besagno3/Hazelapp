import { resolveSprite } from '../content/sprites';
import { SpriteSheet } from '../features/battle/SpriteSheet';

interface CharacterPortraitProps {
  /** Sprite manifest key; unknown or missing ids fall back to the emoji. */
  spriteId: string | undefined;
  /** Emoji shown when the character has no sprite. */
  emoji: string;
  /** Display scale multiplier (1 = native sheet size). */
  scale?: number;
  /** Animation to play; defaults to the view's front-facing idle. */
  anim?: string;
  className?: string;
}

/**
 * A character's animated pixel portrait for UI panels (dialogue, HUD, menus).
 * Prefers the battle view; world-only characters (NPCs) use their world sheet,
 * facing the player. Falls back to the emoji when there's no art.
 */
export function CharacterPortrait({ spriteId, emoji, scale = 1, anim, className }: CharacterPortraitProps) {
  const { def, emoji: fallback } = resolveSprite(spriteId, emoji);
  const view = def?.battle ?? def?.world ?? null;
  // World sheets hold side/down/up views; 'idleDown' faces the player and
  // SpriteSheet drops back to 'idle' for sheets without a down view.
  const defaultAnim = def?.battle ? 'idle' : 'idleDown';
  return (
    <SpriteSheet view={view} anim={anim ?? defaultAnim} emoji={fallback} scale={scale} className={className} />
  );
}
