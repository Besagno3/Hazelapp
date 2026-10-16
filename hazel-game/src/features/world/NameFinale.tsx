import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import QuestionCard from '../../components/QuestionCard';
import { Candles } from '../../components/Candles';
import { CharacterPortrait } from '../../components/CharacterPortrait';
import { candleLine, loadGauntlet, shuffle } from '../../lib/gauntlet';
import { errorMessage } from '../../lib/errors';
import { clampLevel, playerAge, skillLevelFor } from '../../lib/age';
import { XP_PER_CORRECT } from '../../lib/level';
import { xpBonusPerCorrect } from '../../lib/powerups';
import { pushLibrary, wakeAfterDefeat, wakeShelter } from '../../lib/save';
import { playMusic, sfx } from '../../lib/audio';
import {
  NAME_ANSWER,
  NAME_CHOICES,
  NAME_LEVEL_BONUS,
  NAME_LIVES,
  NAME_QUESTIONS,
  WRONG_NAME_LINES,
  finaleTopics,
  nameClearXp,
} from '../../content/finale';
import { NAME_LEARNED, UMBRA_NAMED } from '../../content/questFlags';
import { useSaveStore } from '../../store/saveStore';
import { useProfileStore } from '../../store/profileStore';
import { useSettingsStore } from '../../store/settingsStore';
import { sendFlow } from '../../machines/gameFlow';
import type { Question, Topic } from '../../types';

type Phase =
  | { kind: 'intro' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'question'; index: number }
  | { kind: 'message'; text: string; next: () => void }
  /** "What was my name?" — `wrong`: the names already tried. */
  | { kind: 'name'; wrong: string[] }
  /** The hero hasn't heard the five memories (`name-learned`): Umbra sends them gently back. */
  | { kind: 'unknown' }
  /** The last candle out: up to Glim's Nook, healed — try again any time. */
  | { kind: 'out' }
  | { kind: 'named'; xp: number };

/**
 * Umbra Remembered at the Root's Heart (#75 item 16e, STORY-4X §6). His
 * questions are a gauntlet — five topics Lumina forgot, a candle snuffed by
 * each wrong answer — and it ends, never at zero HP, at the only question he
 * has left: "What was my name?". Saying "Aster" sets `umbra-named`; the name
 * panels and the post-credits play as this closes (WorldScreen).
 */
export default function NameFinale() {
  const flags = useSaveStore((s) => s.save?.flags);
  const hints = useSaveStore((s) => s.save?.items.hint ?? 0);
  const spendHint = useSaveStore((s) => s.spendHint);
  const update = useSaveStore((s) => s.update);
  const setFlag = useSaveStore((s) => s.setFlag);
  const profile = useProfileStore((s) => s.profile);
  const addXp = useProfileStore((s) => s.addXp);
  const recordActivity = useProfileStore((s) => s.recordActivity);

  const age = playerAge(profile);
  const perCorrect = XP_PER_CORRECT + xpBonusPerCorrect(profile?.powerUps ?? {});
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [lives, setLives] = useState(NAME_LIVES);
  const [choices] = useState(() => shuffle([...NAME_CHOICES]));
  const correct = useRef(0);

  // The finale's own music (App's screen music steps aside while it's open).
  const music = useSettingsStore((s) => s.music);
  const musicVolume = useSettingsStore((s) => s.musicVolume);
  useEffect(() => {
    playMusic('finalBoss');
  }, [music, musicVolume]);

  if (!flags) return null;

  function begin() {
    setPhase({ kind: 'loading' });
    const levelFor = (t: Topic) => clampLevel(skillLevelFor(profile?.skillLevels ?? {}, t, age) + NAME_LEVEL_BONUS);
    loadGauntlet({ topics: finaleTopics(), count: NAME_QUESTIONS, age, levelFor, flavor: 'spire' })
      .then((pool) => {
        setQuestions(pool);
        setPhase({ kind: 'question', index: 0 });
      })
      .catch((err) => setPhase({ kind: 'error', message: errorMessage(err) }));
  }

  function onAnswered(ok: boolean, q: Question, picked: number) {
    if (ok) {
      correct.current += 1;
      void addXp(perCorrect);
    } else {
      update((s) => ({ ...s, library: pushLibrary(s.library, [{ question: q, picked }]) }));
    }
  }

  function onContinue(ok: boolean, index: number) {
    const next = () =>
      index + 1 < questions.length
        ? setPhase({ kind: 'question', index: index + 1 })
        : setPhase({
            kind: 'message',
            text: 'Umbra lowers his great dark head. "You answered. Nobody has answered me in so long." He leans closer. "Then answer the only question I have left…"',
            next: () => setPhase(flags![NAME_LEARNED] ? { kind: 'name', wrong: [] } : { kind: 'unknown' }),
          });
    if (ok) return next();
    const remaining = lives - 1;
    setLives(remaining);
    if (remaining <= 0) return setPhase({ kind: 'out' });
    setPhase({ kind: 'message', text: candleLine(remaining), next });
  }

  function pickName(name: string) {
    if (phase.kind !== 'name') return;
    if (name !== NAME_ANSWER) {
      sfx('wrong');
      setPhase({ kind: 'name', wrong: [...phase.wrong, name] });
      return;
    }
    // Read at the moment it's said: the reward is for the first naming only.
    const namedBefore = !!useSaveStore.getState().save?.flags[UMBRA_NAMED];
    const bonus = nameClearXp(0, perCorrect, namedBefore);
    if (bonus) void addXp(bonus);
    void recordActivity();
    setFlag(UMBRA_NAMED);
    void useSaveStore.getState().flush();
    sfx('levelup');
    confetti({ particleCount: 220, spread: 110, origin: { y: 0.4 }, colors: ['#ffe066', '#ffffff', '#ffd1f0'], disableForReducedMotion: true });
    setPhase({ kind: 'named', xp: correct.current * perCorrect + bonus });
  }

  /** Candles out: wake healed in Glim's Nook (the Root's Heart is sheltered there, #75 item 16d). */
  function wakeUp() {
    update((s) => ({ ...s, hp: null, ...wakeAfterDefeat(s) }));
    void useSaveStore.getState().flush();
    sendFlow({ type: 'CLOSE' });
  }

  const umbra = (
    <motion.div
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="flex justify-center mb-2"
      style={{ filter: 'drop-shadow(0 0 18px rgba(154,74,255,0.7))' }}
    >
      <CharacterPortrait spriteId="umbra" emoji="🌑" scale={1.5} className="text-7xl" />
    </motion.div>
  );
  const shelter = wakeShelter({ zoneId: 'deep-root-7' });
  const q = phase.kind === 'question' ? questions[phase.index] : undefined;

  return (
    <div>
      {phase.kind !== 'named' && umbra}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-3">
        <h2 className="text-lg font-extrabold text-violet-200">🌑 Umbra Remembered</h2>
        {phase.kind !== 'intro' && phase.kind !== 'named' && phase.kind !== 'name' && phase.kind !== 'unknown' && (
          <Candles lit={lives} total={NAME_LIVES} />
        )}
      </div>

      {phase.kind === 'intro' && (
        <div className="text-center">
          <p className="text-sm text-white/85 mb-2">
            "Everyone stopped asking me things, so I asked them instead. Nobody answered." The great shadow sighs.
          </p>
          <p className="text-sm text-white/85 mb-5">
            Answer {NAME_QUESTIONS} of his questions. A wrong answer snuffs one of your {NAME_LIVES} candles. Then he
            asks his last one.
          </p>
          <button
            autoFocus
            onClick={begin}
            className="bg-violet-500 hover:bg-violet-400 font-bold rounded-xl px-6 py-3"
          >
            🕯️ Answer his questions
          </button>
        </div>
      )}

      {phase.kind === 'loading' && (
        <p className="text-center text-violet-200 py-8 animate-pulse">The roots whisper, thinking of questions…</p>
      )}

      {phase.kind === 'error' && (
        <div className="text-center">
          <p className="text-sm text-orange-300 mb-4">The Root shivers: {phase.message}</p>
          <button onClick={begin} className="bg-violet-500 hover:bg-violet-400 font-semibold rounded-lg px-5 py-2 text-sm">
            Try again
          </button>
        </div>
      )}

      {phase.kind === 'question' && q && (
        <div>
          <p className="text-center text-violet-200 font-bold mb-2 text-xs uppercase tracking-widest">
            Umbra's question {phase.index + 1}/{questions.length}
          </p>
          <QuestionCard
            key={`${phase.index}:${q.id}`}
            question={q}
            hints={hints}
            onUseHint={spendHint}
            onAnswered={(ok, picked) => onAnswered(ok, q, picked)}
            continueLabel="🕯️ Stand firm"
            onContinue={(ok) => onContinue(ok, phase.index)}
          />
        </div>
      )}

      {phase.kind === 'message' && (
        <button key={phase.text} autoFocus onClick={phase.next} className="w-full text-left">
          <p className="font-semibold">{phase.text}</p>
          <p className="text-xs text-white/50 mt-3">▼ tap to continue</p>
        </button>
      )}

      {phase.kind === 'name' && (
        <div className="text-center">
          <p className="text-xl font-extrabold text-amber-200 mb-1">"What was my name?"</p>
          <p className="text-sm text-white/75 mb-4">The five memories told you. Say it!</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Names">
            {choices.map((name, i) => {
              const tried = phase.wrong.includes(name);
              return (
                <button
                  key={name}
                  autoFocus={i === 0}
                  disabled={tried}
                  onClick={() => pickName(name)}
                  className="min-h-11 rounded-xl px-4 py-3 font-bold bg-white/10 hover:bg-white/20 border border-white/30 disabled:opacity-40 disabled:line-through"
                >
                  {name}
                </button>
              );
            })}
          </div>
          {phase.wrong.length > 0 && (
            <p role="status" className="text-sm text-violet-100 mt-4">
              {WRONG_NAME_LINES[phase.wrong[phase.wrong.length - 1]]}
            </p>
          )}
        </div>
      )}

      {phase.kind === 'unknown' && (
        <div className="text-center">
          <p className="text-xl font-extrabold text-amber-200 mb-2">"What was my name?"</p>
          <p className="text-sm text-white/85 mb-2">You open your mouth — but you don't know it. Nobody does.</p>
          <p className="text-sm text-white/85">
            "Then go and ask the ones who remember," Umbra whispers. "Wisp might help. I'll wait. I'm good at waiting."
          </p>
        </div>
      )}

      {phase.kind === 'out' && (
        <div className="text-center">
          <p className="text-sm text-white/85 mb-4">
            Your last candle goes out. "Not yet, then," Umbra sighs — and the dark carries you gently up to{' '}
            {shelter?.place ?? 'safety'}, healed. Come back whenever you're ready.
          </p>
          <button
            autoFocus
            onClick={wakeUp}
            className="bg-white/15 hover:bg-white/25 font-semibold rounded-lg px-6 py-2.5 text-sm"
          >
            🐛 To the nook
          </button>
        </div>
      )}

      {phase.kind === 'named' && (
        <div className="text-center">
          <div className="text-6xl mb-2" aria-hidden>
            🌼
          </div>
          <p className="text-xl font-extrabold text-amber-200 mb-2">"{NAME_ANSWER}…"</p>
          <p className="text-sm text-white/85 mb-2">The shadow goes very, very still.</p>
          <p className="text-amber-200 font-bold mb-4">⭐ {phase.xp} XP</p>
          <button
            autoFocus
            onClick={() => sendFlow({ type: 'CLOSE' })}
            className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-6 py-2.5"
          >
            🌼 See what happens
          </button>
        </div>
      )}
    </div>
  );
}
