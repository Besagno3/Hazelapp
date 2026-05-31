import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { PASS_THRESHOLD, ROUNDS_TO_UNLOCK } from '../../lib/utils';
import type { Topic } from '../../types';

const TOPICS: { id: Topic; label: string; emoji: string; color: string }[] = [
  { id: 'math', label: 'Math', emoji: '🔢', color: 'bg-blue-500 hover:bg-blue-600' },
  { id: 'science', label: 'Science', emoji: '🔬', color: 'bg-green-500 hover:bg-green-600' },
  { id: 'engineering', label: 'Engineering', emoji: '⚙️', color: 'bg-orange-500 hover:bg-orange-600' },
  { id: 'creativity', label: 'Creativity', emoji: '🎨', color: 'bg-pink-500 hover:bg-pink-600' },
];

export default function TopicSelect() {
  const { setTopic, setPhase, progress, devUnlockWorld } = useGameStore();
  const passedCount = progress.completedRounds.filter((r) => r.passed).length;

  function handlePick(topic: Topic) {
    setTopic(topic);
    setPhase('quiz');
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-6">
      <motion.h1
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-4xl font-extrabold text-white mb-2"
      >
        Choose Your Topic
      </motion.h1>
      <p className="text-indigo-200 mb-8">
        Rounds passed: <strong>{passedCount}/{ROUNDS_TO_UNLOCK}</strong> — pass{' '}
        {ROUNDS_TO_UNLOCK} at {Math.round(PASS_THRESHOLD * 100)}%+ to unlock the world!
      </p>

      <div className="grid grid-cols-2 gap-4 w-full max-w-md">
        {TOPICS.map((t, i) => (
          <motion.button
            key={t.id}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handlePick(t.id)}
            className={`${t.color} text-white rounded-2xl p-6 text-center shadow-lg transition`}
          >
            <div className="text-5xl mb-2">{t.emoji}</div>
            <div className="font-bold text-lg">{t.label}</div>
          </motion.button>
        ))}
      </div>

      {/* Stripped from production by Vite's import.meta.env constant folding. */}
      {import.meta.env.DEV && (
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
