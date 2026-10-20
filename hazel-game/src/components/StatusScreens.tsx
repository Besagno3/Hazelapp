import { useEffect, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GENERIC_FACTS } from '../lib/funFacts';
import type { OutdatedReason } from '../store/saveStore';

const FACT_ROTATION_MS = 4000;

/** The full-screen backdrop. */
function Backdrop({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-6 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Full-screen loading state, rotating a kid-friendly fact while it lasts, so
 * a wait isn't dead air (#31). (The topic facts went to the quiz's results
 * card when its wait went, #163.)
 */
export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  // Start at a random fact each mount so consecutive loads don't repeat the same one.
  const [start] = useState(() => Math.floor(Math.random() * GENERIC_FACTS.length));
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => s + 1), FACT_ROTATION_MS);
    return () => clearInterval(id);
  }, []);

  const fact = GENERIC_FACTS[(start + step) % GENERIC_FACTS.length];

  return (
    <Backdrop className="text-white">
      <motion.div
        className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
      />
      <p className="mt-5 text-lg font-medium">{label}</p>

      <div className="mt-8 max-w-md min-h-[4.5rem] text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={fact}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35 }}
            className="text-sm text-white/80 leading-relaxed"
          >
            {fact}
          </motion.p>
        </AnimatePresence>
      </div>
    </Backdrop>
  );
}

/**
 * The save stopped because a newer one exists, and a refresh loads it: the
 * game was updated (#101i — a newer version saved it), or the player played
 * on in another tab or on another device (#151).
 */
export function OutdatedScreen({ reason, onRefresh }: { reason: OutdatedReason | null; onRefresh: () => void }) {
  return reason === 'elsewhere' ? (
    <ErrorScreen
      emoji="🧭"
      title="Your adventure moved on!"
      message="You played on in another tab or on another device. Refresh the page to carry on from your newest save."
      retryLabel="🔄 Refresh"
      onRetry={onRefresh}
    />
  ) : (
    <ErrorScreen
      emoji="✨"
      title="Hazel Quest has been updated!"
      message="Your adventure was saved by the new version. Refresh the page to keep playing — nothing is lost."
      retryLabel="🔄 Refresh"
      onRetry={onRefresh}
    />
  );
}

/**
 * Full-screen error state with an optional retry. `title`, `emoji` and
 * `retryLabel` let a screen that isn't really an error (an update to refresh
 * for) say so in friendlier words.
 */
export function ErrorScreen({
  message,
  onRetry,
  title = 'Something went wrong',
  emoji = '😕',
  retryLabel = 'Try again',
}: {
  message: string;
  onRetry?: () => void;
  title?: string;
  emoji?: string;
  retryLabel?: string;
}) {
  return (
    <Backdrop>
      <div className="bg-white text-gray-700 rounded-2xl p-8 max-w-sm w-full text-center shadow-xl">
        <div className="text-5xl mb-3" aria-hidden="true">
          {emoji}
        </div>
        <h2 className="text-xl font-bold mb-2">{title}</h2>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg px-5 py-2 transition"
          >
            {retryLabel}
          </button>
        )}
      </div>
    </Backdrop>
  );
}
