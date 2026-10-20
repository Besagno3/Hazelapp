import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { sfx } from '../lib/audio';
import { markSeen } from '../lib/seen';
import FlagButton from './FlagButton';
import type { Question } from '../types';

/**
 * One self-contained question card (#37) — used by battle turns, gate/chest
 * locks, and the Library. Reveals correct/wrong styling on pick, shows the
 * explanation, and supports spending a Hint Feather (hides two wrong options).
 * `preHidden` crosses out wrong options before the player starts (Pip's peek).
 * `secondChance` (a Forget-Me-Knot, #75 item 14e): the first wrong pick is
 * crossed out instead of answered, and the player picks again.
 * The parent advances via `onContinue` so reading is never rushed. Once
 * answered, any question can be reported (`FlagButton`, B10).
 */
export default function QuestionCard({
  question,
  hints = 0,
  hintLabel,
  hintNote,
  preHidden = 0,
  onUseHint,
  onAnswered,
  continueLabel = 'Continue',
  onContinue,
  note,
  secondChance = false,
  onSecondChance,
  focusContinue = false,
  focusContinueKey,
  afterAnswer,
}: {
  question: Question;
  /** Hint Feathers available (0 hides the hint button). */
  hints?: number;
  /** The hint button's words in place of "Use a Hint Feather (N left)" (Kira's Fox Sense). */
  hintLabel?: string;
  /** Said where the hint button would be while there are no hints to use (a trickster blocks them). */
  hintNote?: string;
  /** Wrong options crossed out from the start (a companion's peek). */
  preHidden?: number;
  onUseHint?: () => void;
  /** Fires once, as soon as an option is picked. */
  onAnswered: (correct: boolean, picked: number) => void;
  continueLabel?: string;
  /**
   * Move keyboard focus to Continue once an answer is picked (15e round 4: a
   * tale-stone's "🔄 Ask me another!" was five Tabs away). Off by default.
   */
  focusContinue?: boolean;
  /** Changes when the caller wants Continue focused later — a scribe burst settling (#165, review round 2). */
  focusContinueKey?: unknown;
  /** Fires once with whether the pick was correct — guarded against double-clicks. */
  onContinue: (correct: boolean) => void;
  /**
   * A line shown above Continue once an answer is picked (empty = none yet).
   * Passing it at all mounts a live region up front, so a screen reader reads
   * the line when it appears; the parent decides when it has text.
   */
  note?: string;
  /** A wrong pick is crossed out and the player picks again — once (a Forget-Me-Knot). */
  secondChance?: boolean;
  /** Fires when the second try is spent (the parent unties the knot). */
  onSecondChance?: () => void;
  /** Shown under the options once an answer is picked, before the explanation (a ✍️ scribe burst, #165). */
  afterAnswer?: ReactNode;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hidden, setHidden] = useState<number[]>(() => pickWrong(question, [], preHidden));
  const [hintUsed, setHintUsed] = useState(false);
  /** The wrong pick a Forget-Me-Knot crossed out, if it has been spent on this card. */
  const [retried, setRetried] = useState<number | null>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  // On screen = seen, so the next batches leave it out for this kid (#134).
  useEffect(() => markSeen(question.id), [question.id]);

  // On a phone the explanation can push Continue below the fold — bring it
  // into view once an answer is picked ('nearest' = no scroll if it fits).
  useEffect(() => {
    if (selected === null) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Wait a frame so the explanation + button have laid out.
    const raf = requestAnimationFrame(() => {
      const btn = continueRef.current;
      if (typeof btn?.scrollIntoView === 'function') btn.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [selected]);
  // Focus apart from the scroll (review round 4: `focusContinue` turning scrolled the card, under a scribe's lock being unfolded).
  useEffect(() => {
    if (selected === null || !focusContinue) return;
    const raf = requestAnimationFrame(() => continueRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(raf);
  }, [selected, focusContinue]);
  const [continued, setContinued] = useState(false);
  // Continue takes focus when `focusContinueKey` turns (never on its first value).
  const focusKeyWas = useRef(focusContinueKey);
  useEffect(() => {
    if (focusContinueKey === focusKeyWas.current) return;
    focusKeyWas.current = focusContinueKey;
    continueRef.current?.focus({ preventScroll: true });
  }, [focusContinueKey]);

  function pick(idx: number) {
    if (selected !== null || idx === retried) return;
    const correct = idx === question.correctIndex;
    // A Forget-Me-Knot: the first wrong pick doesn't count — cross it out and try
    // again. Only while that leaves a real choice: after a Hint Feather or a peek
    // has crossed out the rest, the pick is final and the knot stays tied.
    if (!correct && secondChance && retried === null && wrongLeft(question, hidden).length > 1) {
      setRetried(idx);
      sfx('select');
      onSecondChance?.();
      return;
    }
    setSelected(idx);
    sfx(correct ? 'correct' : 'wrong');
    onAnswered(correct, idx);
  }

  function handleContinue() {
    // A fast double-tap must not resolve the turn twice (double damage!).
    if (continued || selected === null) return;
    setContinued(true);
    onContinue(selected === question.correctIndex);
  }

  // Options already out of play: hidden by a hint or a peek, or crossed out by a Forget-Me-Knot.
  const out = retried === null ? hidden : [...hidden, retried];

  function useHint() {
    if (selected !== null || hintUsed || !onUseHint) return;
    // A hint never leaves only the right answer standing — the knot's cross-out counts.
    setHidden((h) => [...h, ...pickWrong(question, retried === null ? h : [...h, retried], 2)]);
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
      {/*
        The Forget-Me-Knot's line sits above the options, where a small phone
        still shows it. Mounted up front while a knot is tied, so a screen
        reader reads the line when it appears.
      */}
      {(secondChance || retried !== null) && (
        <p
          role="status"
          className={retried !== null && selected === null ? '-mt-2 mb-3 text-sm font-semibold text-violet-800' : 'sr-only'}
        >
          {retried !== null && selected === null ? '🎗️ Not that one — your Forget-Me-Knot gives you a second try. Take your time!' : ''}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {question.options.map((opt, idx) => {
          if (idx === retried && selected === null) {
            // aria-disabled, not disabled: focus stays here (a disabled button drops it to the page).
            return (
              <button
                key={idx}
                aria-disabled="true"
                aria-label={`${opt} — not this one`}
                className="min-h-[44px] border-2 border-red-200 bg-red-50 rounded-lg px-3 py-2 text-sm text-red-400 line-through text-left"
              >
                {opt}
              </button>
            );
          }
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


      {selected === null && hints > 0 && onUseHint && !hintUsed && canHideMore(question, out) && (
        <button
          onClick={useHint}
          className="mt-2 -ml-2 min-h-[44px] px-2 inline-flex items-center rounded-lg text-sm text-purple-600 hover:text-purple-800 hover:bg-purple-50 font-semibold"
        >
          {hintLabel ?? `🪶 Use a Hint Feather (${hints} left)`}
        </button>
      )}
      {selected === null && hints === 0 && hintNote && <p className="mt-2 text-sm font-semibold text-gray-600">{hintNote}</p>}

      {selected !== null && afterAnswer && <div className="mt-3">{afterAnswer}</div>}

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

      {/* Any question can be reported once it's answered (B10). */}
      {selected !== null && (
        <div className="mt-3">
          <FlagButton questionId={question.id} />
        </div>
      )}

      {note !== undefined && (
        <p
          role="status"
          className={
            selected !== null && note
              ? 'mt-4 text-sm font-semibold text-violet-900 bg-violet-50 border border-violet-200 rounded-lg p-3'
              : 'sr-only'
          }
        >
          {selected !== null ? note : ''}
        </p>
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
