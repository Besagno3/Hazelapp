import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Question } from '../types';

/**
 * One self-contained question card (#37) — used by battle turns, gate/chest
 * locks, and the Library. Reveals correct/wrong styling on pick, shows the
 * explanation, and supports spending a Hint Feather (hides two wrong options).
 * The parent advances via `onContinue` so reading is never rushed.
 */
export default function QuestionCard({
  question,
  hints = 0,
  onUseHint,
  onAnswered,
  continueLabel = 'Continue',
  onContinue,
}: {
  question: Question;
  /** Hint Feathers available (0 hides the hint button). */
  hints?: number;
  onUseHint?: () => void;
  /** Fires once, as soon as an option is picked. */
  onAnswered: (correct: boolean, picked: number) => void;
  continueLabel?: string;
  onContinue: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);

  function pick(idx: number) {
    if (selected !== null) return;
    setSelected(idx);
    onAnswered(idx === question.correctIndex, idx);
  }

  function useHint() {
    if (selected !== null || hidden.length > 0 || !onUseHint) return;
    const wrong = question.options
      .map((_, i) => i)
      .filter((i) => i !== question.correctIndex);
    // Hide two of the wrong options (random pair).
    const shuffled = [...wrong].sort(() => Math.random() - 0.5);
    setHidden(shuffled.slice(0, 2));
    onUseHint();
  }

  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-white text-gray-800 rounded-2xl p-5 w-full max-w-lg shadow-2xl"
    >
      <h2 className="font-semibold text-lg mb-4">{question.text}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {question.options.map((opt, idx) => {
          if (hidden.includes(idx)) {
            return (
              <div
                key={idx}
                className="border-2 border-dashed border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-300 text-center"
              >
                🪶
              </div>
            );
          }
          let cls = 'border-2 rounded-lg px-3 py-2 text-sm font-medium transition text-left ';
          if (selected === null) cls += 'border-gray-200 hover:border-purple-400';
          else if (idx === question.correctIndex) cls += 'border-green-500 bg-green-50 text-green-700';
          else if (idx === selected) cls += 'border-red-400 bg-red-50 text-red-600';
          else cls += 'border-gray-200 opacity-40';
          return (
            <button key={idx} onClick={() => pick(idx)} disabled={selected !== null} className={cls}>
              {opt}
            </button>
          );
        })}
      </div>

      {selected === null && hints > 0 && onUseHint && hidden.length === 0 && (
        <button
          onClick={useHint}
          className="mt-3 text-xs text-purple-600 hover:text-purple-800 font-semibold"
        >
          🪶 Use a Hint Feather ({hints} left)
        </button>
      )}

      {selected !== null && question.explanation && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 text-sm text-gray-500 bg-gray-50 rounded-lg p-3"
        >
          💡 {question.explanation}
        </motion.p>
      )}

      {selected !== null && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={onContinue}
          className="mt-4 w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2.5 transition"
        >
          {continueLabel}
        </motion.button>
      )}
    </motion.div>
  );
}
