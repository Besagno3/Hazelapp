import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useGameStore } from '../../store/gameStore';
import { useProfileStore } from '../../store/profileStore';
import { useGeneratedQuestions } from '../../hooks/useGeneratedQuestions';
import { PASS_THRESHOLD } from '../../lib/utils';
import { nextSkillLevel } from '../../lib/age';
import { XP_PER_CORRECT } from '../../lib/level';
import { xpBonusPerCorrect } from '../../lib/powerups';
import { prefetchQuestions, QUIZ_QUESTION_COUNT } from '../../lib/questions';
import { LoadingScreen, ErrorScreen } from '../../components/StatusScreens';
import FlagButton from '../../components/FlagButton';

export default function QuizRound() {
  const { progress, completeRound, setPhase } = useGameStore();
  const topic = progress.currentTopic!;
  const setSkillLevel = useProfileStore((s) => s.setSkillLevel);
  const addXp = useProfileStore((s) => s.addXp);
  const powerUps = useProfileStore((s) => s.profile?.powerUps) ?? {};
  const { questions, loading, error, age, skillLevel, reload } = useGeneratedQuestions(
    topic,
    QUIZ_QUESTION_COUNT,
  );

  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  /** The option index the player picked, per question — for the missed-questions recap (#25). */
  const [picks, setPicks] = useState<number[]>([]);
  const [done, setDone] = useState(false);

  if (loading) return <LoadingScreen label="Building your questions…" topic={topic} />;
  if (error) {
    return (
      <ErrorScreen message={error} onRetry={reload} onBack={() => setPhase('topic-select')} />
    );
  }

  const total = questions.length;
  const q = questions[current];
  const score = total > 0 ? answers.filter(Boolean).length / total : 0;
  const passed = score >= PASS_THRESHOLD;
  const isLastQuestion = current + 1 >= total;

  /** Reveal the result — the player then advances at their own pace via Next. */
  function handleAnswer(idx: number) {
    if (selected !== null) return;
    setSelected(idx);
    setAnswers((a) => [...a, idx === q.correctIndex]);
    setPicks((p) => [...p, idx]);
  }

  function finishRound() {
    const correctCount = answers.filter(Boolean).length;
    const finalScore = correctCount / total;
    const finalPassed = finalScore >= PASS_THRESHOLD;
    if (finalPassed) {
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    }
    setDone(true);
    completeRound({ topic, questions, score: finalScore, passed: finalPassed });
    // Persist the skill ramp for this topic and award XP for correct answers.
    const newLevel = nextSkillLevel(skillLevel, answers);
    void setSkillLevel(topic, newLevel);
    void addXp(correctCount * (XP_PER_CORRECT + xpBonusPerCorrect(powerUps)));
    // Warm the next same-topic round so a replay starts instantly.
    prefetchQuestions(topic, age, newLevel, QUIZ_QUESTION_COUNT);
  }

  function goNext() {
    if (isLastQuestion) {
      finishRound();
    } else {
      setCurrent((c) => c + 1);
      setSelected(null);
    }
  }

  if (done) {
    const missed = questions
      .map((question, i) => ({ question, picked: picks[i], correct: answers[i] }))
      .filter((m) => m.correct === false);

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-6">
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

          <div className="text-center">
            <button
              onClick={() => setPhase('topic-select')}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg px-6 py-2 transition"
            >
              Back to Topics
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-lg">
        <div className="flex justify-between text-sm text-gray-400 mb-4">
          <span className="capitalize font-medium text-purple-600">
            {topic} · Lvl {skillLevel}
          </span>
          <span>
            Question {current + 1}/{total}
          </span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={q.id}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -40, opacity: 0 }}
          >
            <h2 className="text-xl font-semibold mb-6">{q.text}</h2>
            <div className="space-y-3">
              {q.options.map((opt, idx) => {
                let cls = 'w-full text-left border-2 rounded-lg px-4 py-3 transition font-medium ';
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
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={goNext}
                className="mt-5 w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2.5 transition"
              >
                {isLastQuestion ? 'See Results' : 'Next Question'}
              </motion.button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
