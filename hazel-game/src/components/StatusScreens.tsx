import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FUN_FACTS, GENERIC_FACTS } from '../lib/funFacts';
import type { Topic } from '../types';

const FACT_ROTATION_MS = 4000;

/**
 * Full-screen loading state. When a `topic` is provided, rotates a kid-friendly
 * fact about that topic while the request is in flight — turns the AI-generation
 * wait (3-5s, sometimes longer) from dead air into a brand moment (#31).
 */
export function LoadingScreen({
  label = 'Loading…',
  topic,
}: {
  label?: string;
  topic?: Topic;
}) {
  const pool = useMemo(() => (topic ? FUN_FACTS[topic] : GENERIC_FACTS), [topic]);
  // Start at a random fact each mount so consecutive loads don't repeat the same one.
  const [start] = useState(() => Math.floor(Math.random() * pool.length));
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => s + 1), FACT_ROTATION_MS);
    return () => clearInterval(id);
  }, []);

  const fact = pool[(start + step) % pool.length];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-6">
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
    </div>
  );
}

/** Full-screen error state with optional retry / back actions. */
export function ErrorScreen({
  message,
  onRetry,
  onBack,
}: {
  message: string;
  onRetry?: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-6">
      <div className="bg-white text-gray-700 rounded-2xl p-8 max-w-sm w-full text-center shadow-xl">
        <div className="text-5xl mb-3">😕</div>
        <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <div className="flex gap-3 justify-center">
          {onRetry && (
            <button
              onClick={onRetry}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg px-5 py-2 transition"
            >
              Try again
            </button>
          )}
          {onBack && (
            <button
              onClick={onBack}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg px-5 py-2 transition"
            >
              Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
