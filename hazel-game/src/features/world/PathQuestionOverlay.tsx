import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import QuestionCard from '../../components/QuestionCard';
import { fetchQuestions } from '../../lib/questions';
import { errorMessage } from '../../lib/errors';
import { playerAge, skillLevelFor } from '../../lib/age';
import { XP_PER_CORRECT } from '../../lib/level';
import { chestRewardText, chestWantedLine, openChest, riddleSolvedLine, solveRiddle } from '../../content/quests';
import { gateFlag } from '../../content/zones';
import { sfx } from '../../lib/audio';
import { useProfileStore } from '../../store/profileStore';
import { useSaveStore } from '../../store/saveStore';
import { sendFlow } from '../../machines/gameFlow';
import type { PathTarget, Question } from '../../types';
import ModalLayer from '../../components/ModalLayer';

/**
 * "Questions along the path" (#37): a gatekeeper's challenge, a question-
 * locked treasure chest or a riddle step's tale-stone (#75 item 15e). One
 * question at the player's topic skill level; a correct answer opens the way /
 * pops the chest / finishes the step (and says where the next riddle is), a
 * miss closes gently (walk back up and try again — no penalty, a new question
 * each time).
 */
export default function PathQuestionOverlay({ target }: { target: PathTarget }) {
  const profile = useProfileStore((s) => s.profile);
  const addXp = useProfileStore((s) => s.addXp);
  const update = useSaveStore((s) => s.update);
  const spendHint = useSaveStore((s) => s.spendHint);
  const hints = useSaveStore((s) => s.save?.items.hint ?? 0);
  const save = useSaveStore((s) => s.save);

  const age = playerAge(profile);
  const level = skillLevelFor(profile?.skillLevels ?? {}, target.topic, age);

  const [solved, setSolved] = useState(false);
  // A tale-stone's question answered wrong (15e review): it offers another, right here.
  const [missed, setMissed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // A tale-stone's riddle reads as a challenge on the path, not a treasure chest's (15e review).
  const flavor = target.kind === 'chest' ? 'chest' : 'gate';

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
      if (!correct) {
        if (target.kind === 'riddle') setMissed(true);
        return;
      }
      // A riddle whose step is no longer due (finished elsewhere) gives nothing — no glow, no XP (15e round 2).
      const now = useSaveStore.getState().save;
      if (target.kind === 'riddle' && (!now || solveRiddle(now, target.id) === now)) return;
      setSolved(true);
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
      void addXp(XP_PER_CORRECT);
      if (target.kind === 'gate') {
        sfx('gate');
        update((s) => ({ ...s, flags: { ...s.flags, [gateFlag(target.id)]: true } }));
      } else if (target.kind === 'riddle') {
        sfx('gate');
        update((s) => solveRiddle(s, target.id));
      } else {
        sfx('chest');
        // Coins, plus the quest item in a key-item chest (#75 item 13).
        update((s) => openChest(s, target.id));
      }
    },
    [addXp, target, update],
  );

  const title =
    target.kind === 'gate'
      ? '🚧 The Gatekeeper blocks the path!'
      : target.kind === 'riddle'
        ? '📜 The tale-stone asks a word question!'
        : '🎁 The chest asks a riddle!';
  const successText =
    target.kind === 'gate'
      ? 'The gate swings open!'
      : target.kind === 'riddle'
        ? 'The stone glows!'
        : `The chest pops open — ${chestRewardText(target.id)}`;
  // Under the answer: who wants a key item (#75 item 13), or where the next riddle is (#75 item 15e).
  const wanted =
    target.kind === 'riddle' ? riddleSolvedLine(target.id) : target.kind === 'chest' && save ? chestWantedLine(save, target.id) : null;

  return (
    // Scrolls when a long riddle doesn't fit (a phone, landscape); the inner
    // column still centres when it does.
    <ModalLayer label={target.kind === 'gate' ? 'Gate question' : target.kind === 'riddle' ? 'Tale-stone riddle' : 'Riddle chest'} className="fixed inset-0 z-40 overflow-y-auto bg-black/60 p-4">
      <div className="min-h-full flex flex-col items-center justify-center">
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
            continueLabel={solved ? `✨ ${successText}` : missed ? '🔄 Ask me another!' : 'Hmm… I’ll come back!'}
            // A tale-stone asks again on the spot (15e round 3) — no walking back up to it.
            onContinue={() => {
              if (!missed) return sendFlow({ type: 'CLOSE' });
              setMissed(false);
              setAttempt((a) => a + 1);
            }}
            // A key item found before its quest (#75 item 13): say who wants it,
            // above the button, so it's read before the overlay closes.
            note={
              target.kind === 'riddle'
                ? solved
                  ? (wanted ?? '')
                  : missed
                    ? 'The stone stays dim. Want another question?'
                    : ''
                : target.kind === 'chest'
                  ? solved && wanted
                    ? wanted
                    : ''
                  : undefined
            }
          />
        )}
        {question && missed && (
          <button
            onClick={() => sendFlow({ type: 'CLOSE' })}
            className="mt-3 bg-white/15 hover:bg-white/25 text-white font-semibold rounded-lg px-4 py-2 text-sm"
          >
            Later
          </button>
        )}
      </div>
    </ModalLayer>
  );
}
