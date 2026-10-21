import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import QuestionCard from '../../components/QuestionCard';
import { fetchQuestions } from '../../lib/questions';
import { isStarterId } from '../../content/starterQuestions';
import { errorMessage, questionErrorMessage } from '../../lib/errors';
import { playerAge, skillLevelFor } from '../../lib/age';
import { XP_PER_CORRECT } from '../../lib/level';
import { xpBonusPerCorrect } from '../../lib/powerups';
import { riddleWords, chestRewardText, chestWantedLine, openChest, riddleSolvedLine, solveRiddle } from '../../content/quests';
import { gateFlag } from '../../content/zones';
import { sfx } from '../../lib/audio';
import { useProfileStore } from '../../store/profileStore';
import { useSaveStore } from '../../store/saveStore';
import { useKeyboardStore } from '../../store/keyboardStore';
import { LINE_HOLD_MS, PANGRAM_BONUS_COINS, pangramChest, pangramFor, scriptoriumOpen } from '../../content/typing';
import { LineRun } from '../typing/TypingLesson';
import { sendFlow } from '../../machines/gameFlow';
import type { PathTarget, Question } from '../../types';
import ModalLayer from '../../components/ModalLayer';

/** "Walk away" / "Later" — and Escape while either is offered. */
const walkAway = () => sendFlow({ type: 'CLOSE' });

/**
 * "Questions along the path" (#37): a gatekeeper's challenge, a question-
 * locked treasure chest or a riddle step's tale-stone (#75 item 15e). One
 * question at the player's topic skill level; a correct answer opens the way /
 * pops the chest / finishes the step (and says where the next riddle is), a
 * miss closes gently (walk back up and try again — no penalty, a new question
 * each time) — except a tale-stone, which offers another question on the spot.
 * After an answer, focus goes to the button that carries on.
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
  // Scholar stacks add to every right answer, as in battles and quizzes (#102j).
  const perCorrect = XP_PER_CORRECT + xpBonusPerCorrect(profile?.powerUps ?? {});

  const [solved, setSolved] = useState(false);
  // A tale-stone's question answered wrong (15e review): it offers another, right here.
  const [missed, setMissed] = useState(false);
  // A scribe's lock (#165 item 8): a pangram chest, with a keyboard and the
  // capitals lesson, can be opened by typing its sentence instead — for a bonus.
  const keyboard = useKeyboardStore((s) => s.present);
  const [lockOpened, setLockOpened] = useState(false);
  // The lock unfolds only when asked (review round 1: open, it buried the riddle at 800×600).
  const [lockShown, setLockShown] = useState(false);
  // Gone once the riddle has opened the chest (review round 1: the lock stayed, and paid its bonus on an open chest).
  const scribeLock = target.kind === 'chest' && pangramChest(target.id) && keyboard && scriptoriumOpen(save?.flags ?? {}) && !solved;
  // The riddle answered wrong (review round 4): the lock stays the way in, and says so.
  const [answeredWrong, setAnsweredWrong] = useState(false);
  // The sentence is typed and the chest is on its way (round 5: the riddle stayed answerable in the beat).
  const [typed, setTyped] = useState(false);
  // Set as an attribute, as `useInertOutside` does (round 7: React 19 reads `inert` as a boolean, where "" is false).
  const riddleBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = riddleBox.current;
    if (!el) return;
    if (typed) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }, [typed]);
  const opening = useRef<number | null>(null);
  useEffect(() => () => window.clearTimeout(opening.current ?? undefined), []);
  function openByLock() {
    update((s) => {
      const opened = openChest(s, target.id);
      // The bonus rides a real opening only (an already-open chest returns the save unchanged).
      return opened === s ? s : { ...opened, coins: opened.coins + PANGRAM_BONUS_COINS };
    });
    // The chest springs after the line's beat (review round 4: a habitual Enter on the last key closed it unread).
    setTyped(true);
    opening.current = window.setTimeout(() => {
      sfx('chest');
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, disableForReducedMotion: true });
      setLockOpened(true);
    }, LINE_HOLD_MS);
  }
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
      .catch((e) => {
        if (!active) return;
        // Plain words for the kid; the whole error for whoever fixes it (#130 S6).
        console.warn('Path question failed:', errorMessage(e));
        setFetched({ key: requestKey, question: null, error: questionErrorMessage(e, { what: 'question' }) });
      });
    return () => {
      active = false;
    };
  }, [requestKey, target.topic, age, level, flavor]);

  const onAnswered = useCallback(
    (correct: boolean) => {
      // A riddle whose step is no longer due (finished elsewhere) gives nothing —
      // no glow, no XP, no "ask me another" (15e rounds 2 and 4).
      const now = useSaveStore.getState().save;
      if (target.kind === 'riddle' && (!now || solveRiddle(now, target.id) === now)) return;
      // The sentence already opened the chest (round 5): an answer in its beat changes nothing.
      if (opening.current !== null) return;
      if (!correct) {
        if (target.kind === 'riddle') setMissed(true);
        if (target.kind === 'chest') setAnsweredWrong(true);
        return;
      }
      setSolved(true);
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 }, disableForReducedMotion: true });
      // The way still opens on a starter question, but it pays no XP (#153).
      if (question && !isStarterId(question.id)) void addXp(perCorrect);
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
    [addXp, perCorrect, question, target, update],
  );

  const title =
    target.kind === 'gate'
      ? '🚧 The Gatekeeper blocks the path!'
      : target.kind === 'riddle'
        ? riddleWords(target.id).title
        : lockOpened
          ? '📜 The lock springs open!'
          : '🎁 The chest asks a riddle!';
  const successText =
    target.kind === 'gate'
      ? 'The gate swings open!'
      : target.kind === 'riddle'
        ? riddleWords(target.id).right
        : `The chest pops open — ${chestRewardText(target.id)}`;
  // Under the answer: who wants a key item (#75 item 13), or where the next riddle is (#75 item 15e).
  const wanted =
    target.kind === 'riddle' ? riddleSolvedLine(target.id) : target.kind === 'chest' && save ? chestWantedLine(save, target.id) : null;

  return (
    // Scrolls when a long riddle doesn't fit (a phone, landscape); the inner
    // column still centres when it does.
    <ModalLayer
      // A new question (after "Ask me another" or Try again) pulls focus back in (15e round 4).
      focusKey={requestKey}
      // Escape is "Walk away" or "Later" while one is offered (#159 r2) — never
      // over a question still to answer, which has nothing to cancel.
      onEscape={error || (question && missed) ? walkAway : undefined}
      label={target.kind === 'gate' ? 'Gate question' : target.kind === 'riddle' ? riddleWords(target.id).label : 'Riddle chest'} className="fixed inset-0 z-40 overflow-y-auto bg-black/60 p-4">
      {/* Padded top and bottom (review round 3): with the lock unfolded the column overflows, and the heading sat on the
          HUD band — under it, with the lock up (round 4). */}
      <div className={`min-h-full flex flex-col items-center justify-center pb-8 ${lockShown ? 'pt-24' : 'pt-8'}`}>
        {/* The lock's opening, read out (round 6: the card arrived as new text, and only its button was heard). */}
        <p className="sr-only" aria-live="polite">
          {lockOpened ? `The lock springs open! Inside: ${chestRewardText(target.id).replace(/\s*🪙\s*$/, '')} A scribe's bonus: ${PANGRAM_BONUS_COINS} coins more.` : ''}
        </p>
        <motion.h2
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-white text-xl font-extrabold mb-4 text-center"
        >
          {title}
        </motion.h2>

        {scribeLock && !lockOpened && (
          <div className="w-full max-w-xl bg-indigo-950/95 border-4 border-amber-300/80 rounded-xl p-3 text-white shadow-2xl mb-4" data-testid="scribe-lock">
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex-1 min-w-[12rem] text-sm">
                <span className="font-bold text-amber-300">📜 A scribe's lock!</span>{' '}
                <span className="text-white/80">
                  {answeredWrong
                    ? lockShown
                      ? `Type its sentence — every letter of the alphabet is in it — and the chest opens, 🪙 ${PANGRAM_BONUS_COINS} on top.`
                      : `The riddle got you — but a scribe can still open it: type its sentence for 🪙 ${PANGRAM_BONUS_COINS} on top.`
                    : lockShown
                      ? `Type its sentence — every letter of the alphabet is in it — for a bonus of 🪙 ${PANGRAM_BONUS_COINS}. The riddle below still works too.`
                      : `Type its sentence for a bonus of 🪙 ${PANGRAM_BONUS_COINS}, or answer the riddle as ever.`}
                </span>
              </p>
              {!lockShown && (
                <button
                  onClick={() => setLockShown(true)}
                  className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-lg px-4 py-2 text-sm min-h-11"
                >
                  ✍️ Type the sentence
                </button>
              )}
            </div>
            {lockShown && (
              <div className="mt-2">
                <LineRun text={pangramFor(target.id)} holdRule={save?.typingAnchor ?? true} onDone={openByLock} announce compact label="The lock's sentence" />
              </div>
            )}
          </div>
        )}

        {lockOpened && (
          <div className="w-full max-w-xl bg-white rounded-2xl p-5 text-center shadow-2xl" data-testid="scribe-lock-open">
            <p className="font-bold text-gray-800 mb-1">✨ Inside: {chestRewardText(target.id)}</p>
            <p className="text-sm text-amber-700 font-semibold mb-1">A scribe's bonus: 🪙 {PANGRAM_BONUS_COINS} more!</p>
            {wanted && <p className="text-sm text-gray-700 mb-2">{wanted}</p>}
            <button autoFocus onClick={() => sendFlow({ type: 'CLOSE' })} className="mt-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl px-6 py-3 min-h-11">
              Onward!
            </button>
          </div>
        )}

        {!lockOpened && !question && !error && (
          <div className="text-white/90 bg-white/10 rounded-xl px-6 py-4">
            Thinking of a good one… 🤔
          </div>
        )}

        {!lockOpened && error && (
          <div className="bg-white rounded-xl p-5 max-w-sm text-center">
            <p role="alert" className="text-sm text-gray-600 mb-4">{error}</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setAttempt((a) => a + 1)}
                className="bg-purple-600 text-white font-semibold rounded-lg px-4 py-2 text-sm"
              >
                Try again
              </button>
              <button
                onClick={walkAway}
                className="bg-gray-200 text-gray-700 font-semibold rounded-lg px-4 py-2 text-sm"
              >
                Walk away
              </button>
            </div>
          </div>
        )}

        {!lockOpened && question && (
          <div ref={riddleBox} className={typed ? 'opacity-60 transition-opacity' : undefined}>
          <QuestionCard
            key={question.id}
            question={question}
            hints={hints}
            onUseHint={spendHint}
            onAnswered={onAnswered}
            // Not while the lock is up (review round 2): a Space typed for the pangram would click the focused button and close
            // the chest. Once the riddle is solved the lock is gone, and the carry-on button takes focus as ever (round 3).
            focusContinue={!(scribeLock && lockShown)}
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
                    ? riddleWords(target.id).wrong
                    : ''
                : target.kind === 'chest'
                  ? solved && wanted
                    ? wanted
                    : ''
                  : undefined
            }
          />
          </div>
        )}
        {!lockOpened && question && missed && (
          <button
            onClick={walkAway}
            className="mt-3 bg-white/15 hover:bg-white/25 text-white font-semibold rounded-lg px-4 py-2 text-sm"
          >
            Later
          </button>
        )}
      </div>
    </ModalLayer>
  );
}
