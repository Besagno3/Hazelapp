import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { SpriteView } from '../../content/sprites';
import { bgPosX, frameAt } from '../../lib/spriteAnim';

interface SpriteSheetProps {
  /** The view to play, or null to render the emoji fallback. */
  view: SpriteView | null;
  /** Animation name; defaults to 'idle'. Missing names fall back to 'idle'. */
  anim?: string;
  /** Emoji rendered when `view` is null. */
  emoji: string;
  /** Display scale multiplier (1 = native pixel size). */
  scale?: number;
  className?: string;
}

/**
 * Animated pixel-sprite for the battle screen. Steps a horizontal strip via
 * requestAnimationFrame; renders the emoji when no sheet is available. Meant to
 * sit *inside* the existing Framer Motion lunge/bob wrappers in BattleArena.
 */
export function SpriteSheet({ view, anim = 'idle', emoji, scale = 1, className }: SpriteSheetProps) {
  const animDef = view ? (view.anims[anim] ?? view.anims.idle) : undefined;
  const [frame, setFrame] = useState(animDef ? animDef.from : 0);
  const startRef = useRef(0);

  useEffect(() => {
    if (!view || !animDef) return;
    if (typeof requestAnimationFrame !== 'function') {
      setFrame(animDef.from);
      return; // jsdom / SSR: hold the first frame
    }
    startRef.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      setFrame(frameAt(animDef, now - startRef.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [view, animDef]);

  if (!view || !animDef) {
    return <span className={className}>{emoji}</span>;
  }

  const style: CSSProperties = {
    width: `${view.frameW * scale}px`,
    height: `${view.frameH * scale}px`,
    backgroundImage: `url(${view.sheet})`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `${bgPosX(frame, view.frameW) * scale}px 0px`,
    backgroundSize: `${view.frames * view.frameW * scale}px ${view.frameH * scale}px`,
    imageRendering: 'pixelated',
  };
  return <div role="img" aria-label={emoji} className={className} style={style} />;
}
