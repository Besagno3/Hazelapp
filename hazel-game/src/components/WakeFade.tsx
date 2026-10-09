import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useInertOutside } from '../hooks/useInertOutside';

/** When the dark has cleared off the morning (ms). */
const CLEAR_MS = 2200;
/** How long the morning stays on screen before Act II begins (ms). */
export const MORNING_MS = 1800;
/** How long waking takes before `onDone` (ms): the dark, the morning fading in, a look round. */
export const WAKE_MS = CLEAR_MS + MORNING_MS;
const CLEAR_MS_STILL = 1200;
export const WAKE_MS_STILL = CLEAR_MS_STILL + MORNING_MS;

/** The storybook's line on the dark, read out too. */
export const NEXT_MORNING = 'The next morning…';

/**
 * Waking up (#75 item 14): after the walk home the screen stays dark with "The
 * next morning…", then the morning fades in on the world — the hero inside
 * the inn, with a soft golden glow — and stays a moment before `onDone`
 * (Act II). Under reduced motion it cuts instead of fading. Covers the screen
 * and makes everything behind it inert, so a tap or Tab can't reach the HUD
 * while the world is still asleep.
 */
export default function WakeFade({ onDone }: { onDone: () => void }) {
  const still = useReducedMotion() ?? false;
  const self = useRef<HTMLDivElement>(null);
  useInertOutside(self);
  // Filled in after mount, so screen readers hear the live region change.
  const [said, setSaid] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSaid(NEXT_MORNING), 50);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const t = setTimeout(onDone, still ? WAKE_MS_STILL : WAKE_MS);
    return () => clearTimeout(t);
  }, [onDone, still]);
  const clear = (still ? CLEAR_MS_STILL : CLEAR_MS) / 1000;
  return (
    <div ref={self} data-testid="wake-fade" className="fixed inset-0 z-[80]">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-amber-200 mix-blend-soft-light pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: still ? 0 : [0, 0.6, 0] }}
        transition={{ duration: 2.6, delay: 1.2 }}
      />
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-black"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ delay: still ? clear : 0.9, duration: still ? 0 : clear - 0.9 }}
      />
      <motion.p
        role="status"
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-2xl font-bold text-white/90"
        initial={{ opacity: still ? 1 : 0 }}
        animate={{ opacity: still ? [1, 1, 0] : [0, 1, 1, 0] }}
        transition={{ duration: clear, times: still ? [0, 0.99, 1] : [0, 0.15, 0.45, 0.7] }}
      >
        {said}
      </motion.p>
    </div>
  );
}
