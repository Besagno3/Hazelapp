import { motion } from 'framer-motion';
import { PASS_THRESHOLD, ROUNDS_TO_UNLOCK } from '../../lib/utils';
import { ALL_TOPIC_INFO } from '../../content/topics';
import { useSaveStore } from '../../store/saveStore';
import { sendFlow } from '../../machines/gameFlow';
import type { Topic } from '../../types';

/**
 * The Training Grounds (#37): pick a topic, run quiz rounds, unlock the
 * world of Lumina. Stays available from the world menu for pure practice.
 */
export default function TopicSelect() {
  const passedRounds = useSaveStore((s) => s.save?.passedRounds ?? 0);
  const worldUnlocked = useSaveStore((s) => s.save?.worldUnlocked ?? false);
  const update = useSaveStore((s) => s.update);

  function handlePick(topic: Topic) {
    sendFlow({ type: 'PICK_TOPIC', topic });
  }

  function devUnlockWorld() {
    update((s) => ({ ...s, worldUnlocked: true }));
    sendFlow({ type: 'ENTER_WORLD' });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-6">
      <motion.h1
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-4xl font-extrabold text-white mb-2 text-center"
      >
        Training Grounds
      </motion.h1>
      <p className="text-indigo-200 mb-8 text-center">
        {worldUnlocked ? (
          <>The world of Lumina awaits — or train a topic first!</>
        ) : (
          <>
            Rounds passed: <strong>{Math.min(passedRounds, ROUNDS_TO_UNLOCK)}/{ROUNDS_TO_UNLOCK}</strong>{' '}
            — pass {ROUNDS_TO_UNLOCK} at {Math.round(PASS_THRESHOLD * 100)}%+ to unlock the world!
          </>
        )}
      </p>

      {/* Above the topics, so ten cards never push it off a phone's screen (#130c). */}
      {worldUnlocked && (
        <motion.button
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          whileHover={{ scale: 1.04 }}
          onClick={() => sendFlow({ type: 'ENTER_WORLD' })}
          className="mb-6 bg-amber-400 hover:bg-amber-300 text-amber-950 font-extrabold rounded-2xl px-8 py-4 text-lg shadow-xl"
        >
          🗺️ Enter Lumina
        </motion.button>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 auto-rows-fr gap-3 sm:gap-4 w-full max-w-md sm:max-w-2xl lg:max-w-5xl">
        {/* Every topic stays open: a child can train the same topic as often as they like. */}
        {ALL_TOPIC_INFO.map((t, i) => (
          <motion.button
            key={t.id}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handlePick(t.id)}
            className={`${t.buttonColor} text-white rounded-2xl p-4 sm:p-6 text-center shadow-lg transition`}
          >
            <div className="text-5xl mb-2">{t.emoji}</div>
            <div className="font-bold text-base sm:text-lg">{t.label}</div>
          </motion.button>
        ))}
      </div>

      {/* Stripped from production by Vite's import.meta.env constant folding. */}
      {import.meta.env.DEV && !worldUnlocked && (
        <button
          onClick={devUnlockWorld}
          className="mt-10 text-xs text-white/60 hover:text-white border border-dashed border-white/30 hover:border-white/60 px-3 py-1.5 rounded-md transition"
          title="Dev-only shortcut — invisible in production builds"
        >
          🔧 DEV: skip to world
        </button>
      )}
    </div>
  );
}
