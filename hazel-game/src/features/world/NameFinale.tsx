import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import QuestionCard from '../../components/QuestionCard';
import { Candles } from '../../components/Candles';
import { CharacterPortrait } from '../../components/CharacterPortrait';
import { loadGauntlet, shuffle } from '../../lib/gauntlet';
import { errorMessage, questionErrorMessage } from '../../lib/errors';
import { clampLevel, playerAge, skillLevelFor } from '../../lib/age';
import { XP_PER_CORRECT } from '../../lib/level';
import { xpBonusPerCorrect } from '../../lib/powerups';
import { pushLibrary } from '../../lib/save';
import { playMusic, sfx } from '../../lib/audio';
import {
  NAME_ANSWER,
  NAME_CHOICES,
  NAME_LEVEL_BONUS,
  NAME_LIVES,
  NAME_QUESTIONS,
  WRONG_NAME_LINES,
  finaleCandleLine,
  finaleTopics,
  nameClearXp,
} from '../../content/finale';
import { NAME_LEARNED, UMBRA_NAMED } from '../../content/questFlags';
import { isStarterId } from '../../content/starterQuestions';
import { useSaveStore } from '../../store/saveStore';
import { useProfileStore } from '../../store/profileStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useFinaleStore } from '../../store/finaleStore';
import { sendFlow } from '../../machines/gameFlow';
import { LeaveButton } from './ServiceOverlay';
import type { Question, Topic } from '../../types';

type Phase =
  | { kind: 'intro' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'question'; index: number }
  | { kind: 'message'; text: string; next: () => void }
  /** "What was my name?" — `wrong`: the names already tried. */
  | { kind: 'name'; wrong: string[] }
  /** The hero hasn't heard the five memories (`name-learned`): the shadow sends them gently back. */
  | { kind: 'unknown' }
  /** The last candle out: the shadow lights them again (16e review round 1: no long walk back down). */
  | { kind: 'out' }
  | { kind: 'named'; xp: number };

/**
 * Umbra Remembered at the Root's Heart (#75 item 16e, STORY-4X §6). The
 * shadow's questions are a gauntlet — five topics Lumina forgot, a candle
 * snuffed by each wrong answer — and it ends, never at zero HP, at the only
 * question it has left: "What was my name?". Saying "Aster" sets
 * `umbra-named`; the name panels and the post-credits play as this closes
 * (WorldScreen), and the XP earned here is paid as they end (`finaleStore`),
 * so a level-up never covers the story.
 */
export default function NameFinale() {
  const flags = useSaveStore((s) => s.save?.flags);
  const hints = useSaveStore((s) => s.save?.items.hint ?? 0);
  const spendHint = useSaveStore((s) => s.spendHint);
  const update = useSaveStore((s) => s.update);
  const setFlag = useSaveStore((s) => s.setFlag);
  const profile = useProfileStore((s) => s.profile);
  const recordActivity = useProfileStore((s) => s.recordActivity);

  const age = playerAge(profile);
  const perCorrect = XP_PER_CORRECT + xpBonusPerCorrect(profile?.powerUps ?? {});
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });
  // Answered already this session (left at the name question): only the name is left.
  const passedBefore = useFinaleStore.getState().passed;
  const [questions, setQuestions] = useState<Question[]>([]);
  const [lives, setLives] = useState(NAME_LIVES);
  const [choices] = useState(() => shuffle([...NAME_CHOICES]));
  const correct = useRef(0);
  const named = useRef(false);
  const perCorrectRef = useRef(perCorrect);
  useEffect(() => {
    perCorrectRef.current = perCorrect;
  }, [perCorrect]);

  // Right answers are paid when the finale closes — at once if it's left
  // before the name; as the name panels end if it's said (WorldScreen).
  useEffect(
    () => () => {
      if (named.current || correct.current === 0) return;
      void useProfileStore.getState().addXp(correct.current * perCorrectRef.current);
      correct.current = 0;
    },
    [],
  );

  // A double-tap on "Stand firm" mustn't skip the line it opens (the Spire's guard, 16e code review).
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = performance.now();
  }, [phase]);
  // The name question focuses its heading, never a name: a stray Enter mustn't say one (16b's rule);
  // after a wrong name, focus moves to what the shadow says (the button it was on is disabled).
  const nameHeading = useRef<HTMLParagraphElement>(null);
  // Focus follows the panel (16e code review round 2): the question's label, the "don't know" card.
  const questionLabel = useRef<HTMLParagraphElement>(null);
  const unknownText = useRef<HTMLParagraphElement>(null);
  const questionIndex = phase.kind === 'question' ? phase.index : -1;
  useEffect(() => {
    if (questionIndex >= 0) questionLabel.current?.focus();
  }, [questionIndex]);
  useEffect(() => {
    if (phase.kind === 'unknown') unknownText.current?.focus();
  }, [phase.kind]);
  const said = useRef<HTMLParagraphElement>(null);
  const wrongCount = phase.kind === 'name' ? phase.wrong.length : -1;
  useEffect(() => {
    if (wrongCount === 0) nameHeading.current?.focus();
    else if (wrongCount > 0) said.current?.focus();
  }, [wrongCount]);

  // The final-battle music while the questions come; once only the name is
  // left, something gentler (16e review round 1: it's tender, not a fight).
  const gentle = phase.kind === 'name' || phase.kind === 'unknown' || phase.kind === 'named';
  const music = useSettingsStore((s) => s.music);
  const musicVolume = useSettingsStore((s) => s.musicVolume);
  useEffect(() => {
    playMusic(gentle ? 'shrine' : 'finalBoss');
  }, [gentle, music, musicVolume]);

  if (!flags) return null;

  const theLastQuestion = () => setPhase(flags[NAME_LEARNED] ? { kind: 'name', wrong: [] } : { kind: 'unknown' });

  function begin() {
    setLives(NAME_LIVES);
    setPhase({ kind: 'loading' });
    const levelFor = (t: Topic) => clampLevel(skillLevelFor(profile?.skillLevels ?? {}, t, age) + NAME_LEVEL_BONUS);
    loadGauntlet({ topics: finaleTopics(), count: NAME_QUESTIONS, age, levelFor, flavor: 'spire' })
      .then((pool) => {
        setQuestions(pool);
        setPhase({ kind: 'question', index: 0 });
      })
      .catch((err) => {
        // Plain words for the kid; the whole error for whoever fixes it (#130 S6).
        console.warn('Name finale questions failed:', errorMessage(err));
        setPhase({ kind: 'error', message: questionErrorMessage(err) });
      });
  }

  function onAnswered(ok: boolean, q: Question, picked: number) {
    // Only bank questions pay XP: starter ones pay none (#153).
    if (ok) {
      if (!isStarterId(q.id)) correct.current += 1;
    } else update((s) => ({ ...s, library: pushLibrary(s.library, [{ question: q, picked }]) }));
  }

  function onContinue(ok: boolean, index: number) {
    const next = () => {
      if (index + 1 < questions.length) return setPhase({ kind: 'question', index: index + 1 });
      useFinaleStore.getState().pass();
      setPhase({
        kind: 'message',
        text: 'The shadow lowers its hooded head. "You answered. Nobody has answered me in so long." It leans closer. "Then answer the only question I have left…"',
        next: theLastQuestion,
      });
    };
    if (ok) return next();
    const remaining = lives - 1;
    setLives(remaining);
    if (remaining <= 0) return setPhase({ kind: 'out' });
    setPhase({ kind: 'message', text: finaleCandleLine(remaining), next });
  }

  function pickName(name: string) {
    if (phase.kind !== 'name') return;
    if (name !== NAME_ANSWER) {
      sfx('select');
      setPhase({ kind: 'name', wrong: [...phase.wrong, name] });
      return;
    }
    // Read at the moment it's said: the reward is for the first naming only.
    const namedBefore = !!useSaveStore.getState().save?.flags[UMBRA_NAMED];
    const total = nameClearXp(correct.current, perCorrect, namedBefore);
    named.current = true;
    // The gauntlet is done for good; what it earned is paid as the name panels end.
    useFinaleStore.getState().reset();
    useFinaleStore.getState().owe(total);
    void recordActivity();
    setFlag(UMBRA_NAMED);
    void useSaveStore.getState().flush();
    sfx('levelup');
    confetti({ particleCount: 220, spread: 110, origin: { y: 0.4 }, colors: ['#ffe066', '#ffffff', '#ffd1f0'], disableForReducedMotion: true });
    setPhase({ kind: 'named', xp: total });
  }

  const portrait = (
    <motion.div
      initial={{ y: -12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="flex justify-center mb-1"
      style={{ filter: 'drop-shadow(0 0 12px rgba(216,200,255,0.45))' }}
    >
      <CharacterPortrait spriteId="umbra-remembered" emoji="🌑" scale={1.2} className="text-6xl" />
    </motion.div>
  );
  // On a phone the questions need the room (16e review round 1): no portrait while asking.
  const showPortrait = !['question', 'loading', 'error', 'named'].includes(phase.kind);
  const showCandles = ['intro', 'question', 'message', 'loading', 'error', 'out'].includes(phase.kind) && !(phase.kind === 'intro' && passedBefore);
  const q = phase.kind === 'question' ? questions[phase.index] : undefined;
  const tap = (next: () => void) => performance.now() - shownAt.current >= 250 && next();

  return (
    <div>
      {showPortrait && portrait}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-3">
        <h2 className="text-lg font-extrabold text-violet-200">{phase.kind === 'named' ? '🌼 Aster' : '🌑 Umbra'}</h2>
        {/* On the "they flicker back" card, all three are lit again. */}
        {showCandles && <Candles lit={phase.kind === 'out' ? NAME_LIVES : lives} total={NAME_LIVES} />}
      </div>

      {phase.kind === 'intro' && !passedBefore && (
        <div className="text-center">
          <p className="text-sm text-white/85 mb-2">
            "Everyone stopped asking me things, so I asked them instead. Nobody answered." The shadow sighs.
          </p>
          <p className="text-sm text-white/85 mb-5">
            Answer its {NAME_QUESTIONS} questions. A wrong answer snuffs one of your {NAME_LIVES} candles — if they all
            go out, it lights them again. Then it asks its last one.
          </p>
          <button
            autoFocus
            onClick={begin}
            className="min-h-11 bg-violet-500 hover:bg-violet-400 font-bold rounded-xl px-6 py-3"
          >
            🕯️ Answer it
          </button>
        </div>
      )}

      {phase.kind === 'intro' && passedBefore && (
        <div className="text-center">
          <p className="text-sm text-white/85 mb-5">
            "You answered all my questions," the shadow says. "Only one is left. Are you ready?"
          </p>
          <button
            autoFocus
            onClick={theLastQuestion}
            className="min-h-11 bg-violet-500 hover:bg-violet-400 font-bold rounded-xl px-6 py-3"
          >
            🌼 I'm ready
          </button>
        </div>
      )}

      {phase.kind === 'loading' && (
        <p className="text-center text-violet-200 py-8 animate-pulse">The roots whisper, thinking of questions…</p>
      )}

      {phase.kind === 'error' && (
        <div className="text-center">
          <p role="alert" className="text-sm text-orange-300 mb-4">The Root shivers! {phase.message}</p>
          <button onClick={begin} className="min-h-11 bg-violet-500 hover:bg-violet-400 font-semibold rounded-lg px-5 py-2 text-sm">
            Try again
          </button>
        </div>
      )}

      {phase.kind === 'question' && q && (
        <div>
          <p
            ref={questionLabel}
            tabIndex={-1}
            className="text-center text-violet-200 font-bold mb-2 text-xs uppercase tracking-widest outline-none"
          >
            The shadow's question {phase.index + 1}/{questions.length}
          </p>
          <QuestionCard
            key={`${phase.index}:${q.id}`}
            question={q}
            hints={hints}
            onUseHint={spendHint}
            onAnswered={(ok, picked) => onAnswered(ok, q, picked)}
            continueLabel="🕯️ Stand firm"
            focusContinue
            onContinue={(ok) => onContinue(ok, phase.index)}
          />
        </div>
      )}

      {phase.kind === 'message' && (
        <button key={phase.text} autoFocus onClick={() => tap(phase.next)} className="w-full text-left">
          <p className="font-semibold">{phase.text}</p>
          <p className="text-xs text-white/50 mt-3">▼ tap to continue</p>
        </button>
      )}

      {phase.kind === 'name' && (
        <div className="text-center">
          <p ref={nameHeading} tabIndex={-1} className="text-xl font-extrabold text-amber-200 mb-1 outline-none">
            "What was my name?"
          </p>
          <p className="text-sm text-white/75 mb-4">The five memories told you. Say it!</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Names">
            {choices.map((name) => (
              <button
                key={name}
                disabled={phase.wrong.includes(name)}
                onClick={() => pickName(name)}
                className="min-h-11 rounded-xl px-4 py-3 font-bold bg-white/10 hover:bg-white/20 border border-white/30 disabled:opacity-40 disabled:line-through"
              >
                {name}
              </button>
            ))}
          </div>
          {/* Room kept for the shadow's reply, so the names never jump under a finger (16e review round 4). */}
          <div className="min-h-[4.5rem] mt-4">
            {phase.wrong.length > 0 && (
              <p ref={said} tabIndex={-1} role="status" className="text-sm text-violet-100 outline-none">
                {WRONG_NAME_LINES[phase.wrong[phase.wrong.length - 1]]}
              </p>
            )}
          </div>
        </div>
      )}

      {phase.kind === 'unknown' && (
        <div className="text-center">
          <p ref={unknownText} tabIndex={-1} role="status" className="text-xl font-extrabold text-amber-200 mb-2 outline-none">
            "What was my name?"
          </p>
          <p className="text-sm text-white/85 mb-2">You open your mouth — but you don't know it. Nobody does.</p>
          <p className="text-sm text-white/85">
            "Then go and ask the ones who remember," the shadow whispers. "Wisp might help. I'll wait. I'm good at waiting."
          </p>
        </div>
      )}

      {phase.kind === 'out' && (
        <div className="text-center">
          <p className="text-sm text-white/85 mb-4">
            Your last candle goes out — but the shadow cups its hands round them, and one by one they flicker back.
            "Again?" it asks softly.
          </p>
          <button
            autoFocus
            onClick={() => tap(begin)}
            className="min-h-11 bg-violet-500 hover:bg-violet-400 font-bold rounded-xl px-6 py-2.5"
          >
            🕯️ Try again
          </button>
        </div>
      )}

      {phase.kind === 'named' && (
        <div className="text-center">
          <div className="text-6xl mb-2" aria-hidden>
            🌼
          </div>
          <p className="text-xl font-extrabold text-amber-200 mb-2">"{NAME_ANSWER}…"</p>
          <p className="text-sm text-white/85 mb-2">The shadow's lavender eyes open wide.</p>
          <p className="text-amber-200 font-bold mb-4">⭐ {phase.xp} XP</p>
          <button
            autoFocus
            onClick={() => tap(() => sendFlow({ type: 'CLOSE' }))}
            className="min-h-11 bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-6 py-2.5"
          >
            🌼 See what happens
          </button>
        </div>
      )}
      {phase.kind !== 'named' && <LeaveButton />}
    </div>
  );
}
