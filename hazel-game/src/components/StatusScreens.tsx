import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GENERIC_FACTS } from '../lib/funFacts';
import { OFFLINE_MESSAGE } from '../lib/errors';
import { useLazyRetry, type RetryableLazy } from '../lib/lazyRetry';
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
 * A screen whose file didn't load (#29 review round 1) — the world's, which
 * is lazy-loaded: kind words, a grown-up asked to check the internet when
 * that's the trouble, and "Try again", which loads the file afresh (or
 * reloads the page when a new version replaced it). Never the crash screen.
 */
export function LazyFailedScreen<P extends object>({ page, onLoaded, title }: { page: RetryableLazy<P>; onLoaded: () => void; title: string }) {
  const { busy, words, tryAgain } = useLazyRetry(page, onLoaded);
  const tap = 'tap "Try again"';
  const message =
    words === OFFLINE_MESSAGE
      ? `You're offline. Ask a grown-up to check the internet, then ${tap}.`
      : words
        ? `We couldn't reach Hazel Quest. Ask a grown-up to check the internet, then ${tap}.`
        : 'Tap "Try again" to go back in. Your adventure is saved as you play.';
  return (
    <ErrorScreen emoji="🗺️" title={title} message={message} retryLabel={busy ? 'Trying…' : 'Try again'} retryBusy={busy} onRetry={() => void tryAgain()} />
  );
}

/**
 * Full-screen error state with an optional retry. `title`, `emoji` and
 * `retryLabel` let a screen that isn't really an error (an update to refresh
 * for) say so in friendlier words. `retryBusy`: the retry is on its way — the
 * button waits with `aria-disabled`, so the keyboard keeps its place. Its
 * title takes the focus as it appears, so a screen reader hears it, and the
 * message is a live region, so new words (offline, after a Try again) are
 * read out too (#29 review round 2).
 */
export function ErrorScreen({
  message,
  onRetry,
  title = 'Something went wrong',
  emoji = '😕',
  retryLabel = 'Try again',
  retryBusy = false,
}: {
  message: string;
  onRetry?: () => void;
  title?: string;
  emoji?: string;
  retryLabel?: string;
  retryBusy?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <Backdrop>
      <div className="bg-white text-gray-700 rounded-2xl p-8 max-w-sm w-full text-center shadow-xl">
        <div className="text-5xl mb-3" aria-hidden="true">
          {emoji}
        </div>
        <h2 ref={heading} tabIndex={-1} className="text-xl font-bold mb-2 focus:outline-none">
          {title}
        </h2>
        <div role="status">
          <p className="text-sm text-gray-500 mb-6">{message}</p>
        </div>
        {onRetry && (
          <button
            onClick={retryBusy ? undefined : onRetry}
            aria-disabled={retryBusy || undefined}
            className="min-h-11 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg px-5 py-2 transition aria-disabled:cursor-default aria-disabled:opacity-60"
          >
            {retryLabel}
          </button>
        )}
      </div>
    </Backdrop>
  );
}
