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
  const [done, setDone] = useState(false);

  if (loading) return <LoadingScreen label="Building your questions…" />;
  if (error) {
    return (
      <ErrorScreen message={error} onRetry={reload} onBack={() => setPhase('topic-select')} />
    );
  }

  const total = questions.length;
  const q = questions[current];
  const score = total > 0 ? answers.filter(Boolean).length / total : 0;
  const passed = score >= PASS_THRESHOLD;

  function handleAnswer(idx: number) {
    if (selected !== null) return;
    setSelected(idx);
    const correct = idx === q.correctIndex;
    const newAnswers = [...answers, correct];

    setTimeout(() => {
      if (current + 1 < total) {
        setCurrent((c) => c + 1);
        setSelected(null);
        setAnswers(newAnswers);
      } else {
        setAnswers(newAnswers);
        const correctCount = newAnswers.filter(Boolean).length;
        const finalScore = correctCount / total;
        const finalPassed = finalScore >= PASS_THRESHOLD;
        if (finalPassed) {
          confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        }
        setDone(true);
        completeRound({ topic, questions, score: finalScore, passed: finalPassed });
        // Persist the skill ramp for this topic and award XP for correct answers.
        const newLevel = nextSkillLevel(skillLevel, newAnswers);
        void setSkillLevel(topic, newLevel);
        void addXp(correctCount * (XP_PER_CORRECT + xpBonusPerCorrect(powerUps)));
        // Warm the next same-topic round so a replay starts instantly.
        prefetchQuestions(topic, age, newLevel, QUIZ_QUESTION_COUNT);
      }
    }, 1400);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-2xl p-10 text-center shadow-2xl max-w-sm w-full"
        >
          <div className="text-6xl mb-4">{passed ? '🏆' : '😅'}</div>
          <h2 className="text-2xl font-bold mb-2">{passed ? 'Round Passed!' : 'Keep Trying!'}</h2>
          <p className="text-gray-500 mb-6">Score: {Math.round(score * 100)}%</p>
          <button
            onClick={() => setPhase('topic-select')}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg px-6 py-2 transition"
          >
            Back to Topics
          </button>
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
                  <button key={idx} onClick={() => handleAnswer(idx)} className={cls}>
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
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
