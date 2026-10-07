import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { sfx } from '../lib/audio';
import type { Question } from '../types';

/**
 * One self-contained question card (#37) — used by battle turns, gate/chest
 * locks, and the Library. Reveals correct/wrong styling on pick, shows the
 * explanation, and supports spending a Hint Feather (hides two wrong options).
 * `preHidden` crosses out wrong options before the player starts (Pip's peek).
 * The parent advances via `onContinue` so reading is never rushed.
 */
export default function QuestionCard({
  question,
  hints = 0,
  preHidden = 0,
  onUseHint,
  onAnswered,
  continueLabel = 'Continue',
  onContinue,
}: {
  question: Question;
  /** Hint Feathers available (0 hides the hint button). */
  hints?: number;
  /** Wrong options crossed out from the start (a companion's peek). */
  preHidden?: number;
  onUseHint?: () => void;
  /** Fires once, as soon as an option is picked. */
  onAnswered: (correct: boolean, picked: number) => void;
  continueLabel?: string;
  /** Fires once with whether the pick was correct — guarded against double-clicks. */
  onContinue: (correct: boolean) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hidden, setHidden] = useState<number[]>(() => pickWrong(question, [], preHidden));
  const [hintUsed, setHintUsed] = useState(false);
  const continueRef = useRef<HTMLButtonElement>(null);

  // On a phone the explanation can push Continue below the fold — bring it
  // into view once an answer is picked ('nearest' = no scroll if it fits).
  useEffect(() => {
    if (selected === null || typeof continueRef.current?.scrollIntoView !== 'function') return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Wait a frame so the explanation + button have laid out.
    const raf = requestAnimationFrame(() =>
      continueRef.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }),
    );
    return () => cancelAnimationFrame(raf);
  }, [selected]);
  const [continued, setContinued] = useState(false);

  function pick(idx: number) {
    if (selected !== null) return;
    setSelected(idx);
    const correct = idx === question.correctIndex;
    sfx(correct ? 'correct' : 'wrong');
    onAnswered(correct, idx);
  }

  function handleContinue() {
    // A fast double-tap must not resolve the turn twice (double damage!).
    if (continued || selected === null) return;
    setContinued(true);
    onContinue(selected === question.correctIndex);
  }

  function useHint() {
    if (selected !== null || hintUsed || !onUseHint) return;
    setHidden((h) => [...h, ...pickWrong(question, h, 2)]);
    setHintUsed(true);
    onUseHint();
  }

  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-white text-gray-800 rounded-2xl p-4 sm:p-5 w-full max-w-lg shadow-2xl"
    >
      <h2 className="font-semibold text-lg mb-4">{question.text}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {question.options.map((opt, idx) => {
          if (hidden.includes(idx)) {
            return (
              <div
                key={idx}
                className="min-h-[44px] flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-300"
              >
                🪶
              </div>
            );
          }
          let cls = 'min-h-[44px] border-2 rounded-lg px-3 py-2 text-sm font-medium transition text-left ';
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

      {selected === null && hints > 0 && onUseHint && !hintUsed && canHideMore(question, hidden) && (
        <button
          onClick={useHint}
          className="mt-2 -ml-2 min-h-[44px] px-2 inline-flex items-center rounded-lg text-sm text-purple-600 hover:text-purple-800 hover:bg-purple-50 font-semibold"
        >
          🪶 Use a Hint Feather ({hints} left)
        </button>
      )}

      {selected !== null && selected !== question.correctIndex && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 text-sm font-semibold text-green-700"
        >
          ✅ The answer is: {question.options[question.correctIndex]}
        </motion.p>
      )}

      {selected !== null && question.explanation && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={
            selected === question.correctIndex
              ? 'mt-4 text-sm text-gray-500 bg-gray-50 rounded-lg p-3'
              : 'mt-2 text-sm text-gray-700 bg-amber-50 border border-amber-200 rounded-lg p-3'
          }
        >
          💡 {selected === question.correctIndex ? '' : "Here's why: "}
          {question.explanation}
        </motion.p>
      )}

      {selected !== null && (
        <motion.button
          ref={continueRef}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleContinue}
          disabled={continued}
          className="mt-4 w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 transition"
        >
          {continueLabel}
        </motion.button>
      )}
    </motion.div>
  );
}

/** Wrong option indexes still showing (not yet crossed out). */
function wrongLeft(question: Question, hidden: number[]): number[] {
  return question.options.map((_, i) => i).filter((i) => i !== question.correctIndex && !hidden.includes(i));
}

/** Whether a hint could still cross something out — always leave one wrong option. */
function canHideMore(question: Question, hidden: number[]): boolean {
  return wrongLeft(question, hidden).length > 1;
}

/**
 * Up to `count` wrong options to cross out, picked uniformly (Fisher-Yates),
 * always leaving at least one wrong option so there's still a real choice.
 */
function pickWrong(question: Question, hidden: number[], count: number): number[] {
  const wrong = wrongLeft(question, hidden);
  for (let i = wrong.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
  }
  return wrong.slice(0, Math.max(0, Math.min(count, wrong.length - 1)));
}
