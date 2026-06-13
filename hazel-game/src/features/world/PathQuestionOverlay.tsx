import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import QuestionCard from '../../components/QuestionCard';
import { fetchQuestions } from '../../lib/questions';
import { errorMessage } from '../../lib/errors';
import { playerAge, skillLevelFor } from '../../lib/age';
import { XP_PER_CORRECT } from '../../lib/level';
import { CHEST_COINS } from '../../content/items';
import { gateFlag } from '../../content/zones';
import { topicInfo } from '../../content/topics';
import { useProfileStore } from '../../store/profileStore';
import { useSaveStore } from '../../store/saveStore';
import { sendFlow } from '../../machines/gameFlow';
import type { PathTarget, Question } from '../../types';

/**
 * "Questions along the path" (#37): a gatekeeper's challenge or a question-
 * locked treasure chest. One question at the player's topic skill level; a
 * correct answer opens the way / pops the chest, a miss closes gently
 * (walk back up and try again — no penalty, a new question each time).
 */
export default function PathQuestionOverlay({ target }: { target: PathTarget }) {
  const profile = useProfileStore((s) => s.profile);
  const addXp = useProfileStore((s) => s.addXp);
  const update = useSaveStore((s) => s.update);
  const spendHint = useSaveStore((s) => s.spendHint);
  const hints = useSaveStore((s) => s.save?.items.hint ?? 0);

  const age = playerAge(profile);
  const level = skillLevelFor(profile?.skillLevels ?? {}, target.topic, age);

  const [solved, setSolved] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const zoneName = topicInfo(target.topic).label;
  const flavor =
    target.kind === 'gate'
      ? `a gatekeeper's challenge on the ${zoneName} path of a fantasy world`
      : `a magical treasure chest's riddle in the ${zoneName} lands`;

  // Loading derives from a request/fetched key mismatch (no setState-in-effect).
  const requestKey = `${target.id}|${level}|${attempt}`;
  const [fetched, setFetched] = useState<{
    key: string;
    question: Question | null;
    error: string | null;
  }>({ key: '', question: null, error: null });
  const loading = fetched.key !== requestKey;
  const question = loading ? null : fetched.question;
  const error = loading ? null : fetched.error;

  useEffect(() => {
    let active = true;
    fetchQuestions(target.topic, age, level, 1, flavor)
      .then((qs) => {
        if (!active) return;
        setFetched({
          key: requestKey,
          question: qs[0] ?? null,
          error: qs.length === 0 ? 'No question arrived — try again.' : null,
        });
      })
      .catch((e) => active && setFetched({ key: requestKey, question: null, error: errorMessage(e) }));
    return () => {
      active = false;
    };
  }, [requestKey, target.topic, age, level, flavor]);

  const onAnswered = useCallback(
    (correct: boolean) => {
      if (!correct) return;
      setSolved(true);
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
      void addXp(XP_PER_CORRECT);
      if (target.kind === 'gate') {
        update((s) => ({ ...s, flags: { ...s.flags, [gateFlag(target.id)]: true } }));
      } else {
        update((s) => ({
          ...s,
          openedChests: [...s.openedChests, target.id],
          coins: s.coins + CHEST_COINS,
        }));
      }
    },
    [addXp, target, update],
  );

  const title =
    target.kind === 'gate' ? '🚧 The Gatekeeper blocks the path!' : '🎁 The chest asks a riddle!';
  const successText =
    target.kind === 'gate'
      ? 'The gate swings open!'
      : `The chest pops open — ${CHEST_COINS} coins! 🪙`;

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/60 p-4">
      <motion.h2
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-white text-xl font-extrabold mb-4 text-center"
      >
        {title}
      </motion.h2>

      {!question && !error && (
        <div className="text-white/90 bg-white/10 rounded-xl px-6 py-4">
          Thinking of a good one… 🤔
        </div>
      )}

      {error && (
        <div className="bg-white rounded-xl p-5 max-w-sm text-center">
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="bg-purple-600 text-white font-semibold rounded-lg px-4 py-2 text-sm"
            >
              Try again
            </button>
            <button
              onClick={() => sendFlow({ type: 'CLOSE' })}
              className="bg-gray-200 text-gray-700 font-semibold rounded-lg px-4 py-2 text-sm"
            >
              Walk away
            </button>
          </div>
        </div>
      )}

      {question && (
        <QuestionCard
          key={question.id}
          question={question}
          hints={hints}
          onUseHint={spendHint}
          onAnswered={onAnswered}
          continueLabel={solved ? `✨ ${successText}` : 'Hmm… I’ll come back!'}
          onContinue={() => sendFlow({ type: 'CLOSE' })}
        />
      )}
    </div>
  );
}
