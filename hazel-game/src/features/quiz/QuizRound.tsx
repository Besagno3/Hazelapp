import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useSaveStore } from '../../store/saveStore';
import { useProfileStore } from '../../store/profileStore';
import { sendFlow, useFlow } from '../../machines/gameFlow';
import { useQuizRound } from './useQuizRound';
import { PASS_THRESHOLD } from '../../lib/utils';
import { bankRamp, nextSkillLevel } from '../../lib/age';
import { XP_PER_CORRECT } from '../../lib/level';
import { xpBonusPerCorrect } from '../../lib/powerups';
import { prefetchQuestions, QUIZ_QUESTION_COUNT } from '../../lib/questions';
import { markSeen } from '../../lib/seen';
import { isStarterId } from '../../content/starterQuestions';
import FlagButton from '../../components/FlagButton';
import ScreenTopBar from '../../components/ScreenTopBar';
import type { Question } from '../../types';

/** A round as it was played, kept for its results screen. */
interface FinishedRound {
  questions: Question[];
  answers: boolean[];
  picks: number[];
  /** The question level the round was played at. */
  level: number;
}

export default function QuizRound() {
  const topic = useFlow((s) => s.context.topic) ?? 'math';
  const worldUnlocked = useSaveStore((s) => s.save?.worldUnlocked ?? false);
  const recordQuizRound = useSaveStore((s) => s.recordQuizRound);
  const setSkillLevel = useProfileStore((s) => s.setSkillLevel);
  const addXp = useProfileStore((s) => s.addXp);
  const recordActivity = useProfileStore((s) => s.recordActivity);
  const powerUps = useProfileStore((s) => s.profile?.powerUps) ?? {};
  /** Held once the round ends (Act I review B3): the results show this
   *  round's questions, whatever the question hook does under them. */
  const [finished, setFinished] = useState<FinishedRound | null>(null);
  // Starts at once on saved questions (or starters) and takes the rest as
  // they come — no wait for the whole round (#163).
  const { question: q, number: current, asked, waiting, advance, age, skillLevel } = useQuizRound(
    topic,
    QUIZ_QUESTION_COUNT,
    // Once the round is over, keep asking at the level it was played at: the
    // new level would re-key the hook, which would fetch (and so use up) the
    // batch finishRound just prefetched for the next round.
    finished?.level,
  );

  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  /** The option index the player picked, per question — for the missed-questions recap (#25). */
  const [picks, setPicks] = useState<number[]>([]);

  // On screen = seen, so the next batches leave it out for this kid (#134).
  // Not on the results screen: the next round's batch may be loading under it.
  const shownId = finished || !q ? null : q.id;
  useEffect(() => {
    if (shownId) markSeen(shownId);
  }, [shownId]);

  // On a sideways phone (740×360) or a small one (320×568) the 💡 explanation
  // and Next fall below the fold once an answer is picked: bring Next into
  // view, as QuestionCard does ('nearest' = no scroll when it already fits).
  const nextButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected === null) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Wait a frame so the explanation + button have laid out.
    const raf = requestAnimationFrame(() => {
      const btn = nextButton.current;
      if (typeof btn?.scrollIntoView === 'function') btn.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [selected]);

  if (finished) return <RoundResults round={finished} worldUnlocked={worldUnlocked} />;

  const total = QUIZ_QUESTION_COUNT;
  const isLastQuestion = current + 1 >= total;

  /** Reveal the result — the player then advances at their own pace via Next. */
  function handleAnswer(idx: number) {
    if (selected !== null || !q) return;
    setSelected(idx);
    setAnswers((a) => [...a, idx === q.correctIndex]);
    setPicks((p) => [...p, idx]);
  }

  function finishRound() {
    // The questions as they were asked: saved, arrived later, or starters.
    const questions = asked;
    const correctCount = answers.filter(Boolean).length;
    const finalScore = correctCount / total;
    const finalPassed = finalScore >= PASS_THRESHOLD;
    if (finalPassed) {
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    }
    setFinished({ questions, answers, picks, level: skillLevel });
    // Misses feed the Library in town (#37) on top of the on-screen recap.
    const misses = questions
      .map((question, i) => ({ question, picked: picks[i] }))
      .filter((_, i) => answers[i] === false);
    recordQuizRound(finalPassed, misses);
    // Persist the skill ramp for this topic — bank questions only, and only
    // when they were most of the round (#153, `bankRamp`): the starter
    // questions repeat (six a band, one band for three levels), so knowing
    // them by heart isn't a new level. XP only once the world is open:
    // the opening rounds are the way in, not a way to level up (#122).
    // `worldUnlocked` is from before this round, so the round that opens the
    // world pays none either.
    // Starter questions pay no XP either (#153, the owner's call).
    const bankAnswers = answers.filter((_, i) => !isStarterId(questions[i].id));
    const newLevel = nextSkillLevel(skillLevel, bankRamp(bankAnswers, answers.length));
    void setSkillLevel(topic, newLevel);
    const bankCorrect = bankAnswers.filter(Boolean).length;
    if (worldUnlocked && bankCorrect > 0) void addXp(bankCorrect * (XP_PER_CORRECT + xpBonusPerCorrect(powerUps)));
    void recordActivity();
    // Warm the next same-topic round so a replay starts instantly — from
    // saved questions only, like a zone's critters (#153): it costs nothing
    // if the kid goes elsewhere, and the round asks for the rest as it plays.
    prefetchQuestions(topic, age, newLevel, QUIZ_QUESTION_COUNT, undefined, { cacheOnly: true });
  }

  function goNext() {
    if (isLastQuestion) {
      finishRound();
    } else {
      advance();
      setSelected(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-indigo-500 to-purple-600 px-4 pt-3 pb-6 sm:px-6 [@media(max-height:500px)]:pt-1">
      <ScreenTopBar />
      <div className="flex-1 w-full flex items-center justify-center">
        {/* A short landscape phone (740×360) tightens the card, so the answers
            stay on screen under the top bar. */}
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-lg [@media(max-height:500px)]:px-6 [@media(max-height:500px)]:py-4">
          <div className="flex justify-between text-sm text-gray-400 mb-4 [@media(max-height:500px)]:mb-2">
            <span className="capitalize font-medium text-purple-600">
              {topic} · Lvl {skillLevel}
            </span>
            <span>
              Question {current + 1}/{total}
            </span>
          </div>

          {/* Always in the page, so a screen reader hears the wait (#163). */}
          <p role="status" data-testid="quiz-status" className="sr-only">
            {waiting ? 'One moment… your question is on its way.' : ''}
          </p>

          <AnimatePresence mode="wait">
            {!q ? (
              // The question isn't here yet (the first one, or the rest of a
              // round still on its way): a short wait in the card, never the
              // full-screen loader (#163). It fades in a beat late and leaves
              // at once, so a quick question never flashes it, nor waits
              // behind it.
              <motion.div
                key="waiting"
                data-testid="quiz-waiting"
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.25, duration: 0.3 } }}
                exit={{ opacity: 0, transition: { duration: 0 } }}
                className="min-h-[14rem] flex flex-col items-center justify-center text-center [@media(max-height:500px)]:min-h-[8rem]"
              >
                <span className="w-9 h-9 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin motion-reduce:animate-none" />
                <p className="mt-4 text-lg font-semibold text-gray-700">One moment…</p>
                <p className="mt-1 text-sm text-gray-500">Your question is on its way!</p>
              </motion.div>
            ) : (
              <motion.div
                key={q.id}
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -40, opacity: 0 }}
              >
                <h2 className="text-xl font-semibold mb-6 [@media(max-height:500px)]:mb-3">{q.text}</h2>
                <div className="space-y-3 [@media(max-height:500px)]:space-y-2">
                  {q.options.map((opt, idx) => {
                    let cls = 'w-full text-left border-2 rounded-lg px-4 py-3 [@media(max-height:500px)]:py-2.5 transition font-medium ';
                    if (selected === null) cls += 'border-gray-200 hover:border-purple-400';
                    else if (idx === q.correctIndex) cls += 'border-green-500 bg-green-50 text-green-700';
                    else if (idx === selected) cls += 'border-red-400 bg-red-50 text-red-600';
                    else cls += 'border-gray-200 opacity-50';

                    return (
                      <button
                        key={idx}
                        onClick={() => handleAnswer(idx)}
                        disabled={selected !== null}
                        className={cls}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>

                {selected !== null && q.explanation && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 text-sm text-gray-500 bg-gray-50 rounded-lg p-3"
                  >
                    💡 {q.explanation}
                  </motion.p>
                )}

                {selected !== null && (
                  <div className="mt-3">
                    <FlagButton questionId={q.id} />
                  </div>
                )}

                {selected !== null && (
                  <motion.button
                    ref={nextButton}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={goNext}
                    className="mt-5 w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2.5 transition"
                  >
                    {isLastQuestion ? 'See Results' : 'Next Question'}
                  </motion.button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/** The results of a finished round: score, the questions missed, and the way on. */
function RoundResults({ round, worldUnlocked }: { round: FinishedRound; worldUnlocked: boolean }) {
  const { questions, answers, picks } = round;
  const score = questions.length > 0 ? answers.filter(Boolean).length / questions.length : 0;
  const passed = score >= PASS_THRESHOLD;
  const missed = questions
    .map((question, i) => ({ question, picked: picks[i], correct: answers[i] }))
    .filter((m) => m.correct === false);

  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-indigo-500 to-purple-600 px-4 pt-3 pb-6 sm:px-6 [@media(max-height:500px)]:pt-1">
      <ScreenTopBar />
      <div className="flex-1 w-full flex items-center justify-center">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-2xl p-8 shadow-2xl max-w-lg w-full"
        >
          <div className="text-center">
            <div className="text-6xl mb-4">{passed ? '🏆' : '😅'}</div>
            <h2 className="text-2xl font-bold mb-2">
              {passed ? 'Round Passed!' : 'Keep Trying!'}
            </h2>
            <p className="text-gray-500 mb-6">Score: {Math.round(score * 100)}%</p>
          </div>

          {missed.length > 0 && (
            <div className="mb-6 text-left">
              <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">
                What you missed
              </h3>
              <ul className="space-y-3">
                {missed.map(({ question, picked }) => (
                  <li
                    key={question.id}
                    className="border border-gray-200 rounded-lg p-3 text-sm"
                  >
                    <p className="font-medium text-gray-800 mb-2">{question.text}</p>
                    {picked !== undefined && (
                      <p className="text-red-600 mb-1">
                        Your answer: <span className="font-medium">{question.options[picked]}</span>
                      </p>
                    )}
                    <p className="text-green-700 mb-1">
                      Correct:{' '}
                      <span className="font-medium">
                        {question.options[question.correctIndex]}
                      </span>
                    </p>
                    {question.explanation && (
                      <p className="text-gray-500 mt-1">💡 {question.explanation}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2 items-center">
            {worldUnlocked && (
              <button
                onClick={() => sendFlow({ type: 'ENTER_WORLD' })}
                className="w-full bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-lg px-6 py-2.5 transition"
              >
                🗺️ Enter the world of Lumina
              </button>
            )}
            <button
              onClick={() => sendFlow({ type: 'EXIT_QUIZ' })}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg px-6 py-2 transition"
            >
              Back to Topics
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
