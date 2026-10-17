import { useEffect } from 'react';
import { motion, useReducedMotionConfig } from 'framer-motion';
import { SpriteSheet } from './SpriteSheet';
import type { ResolvedSprite } from '../../content/sprites';
import { BARS, INTRO_MS, INTRO_STILL_MS, introLine } from './intro';


/**
 * The encounter flash, as a battle opens: two white flashes, dark bars sweep
 * in from alternate sides, then the foe pops up with its name. Plays while
 * the battle's first questions load, so it spends the wait rather than adding
 * to it.
 */
export function BattleIntro({
  name,
  sprite,
  isBoss,
  backdrop,
  onDone,
}: {
  name: string;
  sprite: ResolvedSprite;
  isBoss: boolean;
  /** The battle's backdrop: the bars sweep in over it (the world has gone by now). */
  backdrop?: string;
  onDone: () => void;
}) {
  // Follows the app's MotionConfig ("user": the device setting).
  const still = useReducedMotionConfig() ?? false;
  useEffect(() => {
    const id = setTimeout(onDone, still ? INTRO_STILL_MS : INTRO_MS);
    return () => clearTimeout(id);
  }, [onDone, still]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-sky-300"
      data-testid="battle-intro"
      style={
        backdrop
          ? { backgroundImage: `url(${backdrop})`, backgroundSize: 'cover', backgroundPosition: 'center bottom', imageRendering: 'pixelated' }
          : undefined
      }
    >
      {!still && (
        <motion.div
          className="absolute inset-0 bg-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0, 1, 0] }}
          transition={{ duration: 0.25 }}
        />
      )}
      {Array.from({ length: BARS }, (_, i) => (
        <motion.div
          key={i}
          className={`absolute left-0 w-full ${isBoss ? 'bg-red-950' : 'bg-slate-950'}`}
          style={{ top: `${(i * 100) / BARS}%`, height: `${100 / BARS + 0.5}%` }}
          initial={still ? { opacity: 0 } : { x: i % 2 ? '100%' : '-100%' }}
          animate={still ? { opacity: 1 } : { x: 0 }}
          transition={{ delay: still ? 0 : 0.25 + i * 0.03, duration: still ? 0.3 : 0.28, ease: 'easeOut' }}
        />
      ))}
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-4 text-white"
        initial={{ opacity: 0, scale: still ? 1 : 0.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: still ? 0.1 : 0.5, duration: 0.3, ease: 'backOut' }}
      >
        <SpriteSheet view={sprite.def?.battle ?? null} emoji={sprite.emoji} scale={isBoss ? 3 : 2.5} className="leading-none text-6xl" />
        <p role="status" className="text-center text-xl font-bold drop-shadow sm:text-2xl">
          {introLine(name, isBoss)}
        </p>
      </motion.div>
    </div>
  );
}
