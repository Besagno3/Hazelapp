import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/** How long waking takes before `onDone` (ms): the dark, the morning fading in, a look round. */
export const WAKE_MS = 2600;
const WAKE_MS_STILL = 900;

/**
 * Waking up (#75 item 14): after the walk home the screen stays dark a
 * moment, then the morning fades in on the world — the hero in bed's room at
 * the inn, with a soft golden glow — and `onDone` follows once they've had a
 * look round. Under reduced motion it simply cuts in. Covers the screen, so
 * whatever the world is rebuilding underneath never shows.
 */
export default function WakeFade({ onDone }: { onDone: () => void }) {
  const still = useReducedMotion() ?? false;
  useEffect(() => {
    const t = setTimeout(onDone, still ? WAKE_MS_STILL : WAKE_MS);
    return () => clearTimeout(t);
  }, [onDone, still]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[80]">
      <motion.div
        className="absolute inset-0 bg-amber-200 mix-blend-soft-light"
        initial={{ opacity: 0 }}
        animate={{ opacity: still ? 0 : [0, 0.6, 0] }}
        transition={{ duration: 2.2, delay: 0.4 }}
      />
      <motion.div
        className="absolute inset-0 bg-black"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ delay: still ? 0.4 : 0.6, duration: still ? 0 : 1.4 }}
      />
    </div>
  );
}
