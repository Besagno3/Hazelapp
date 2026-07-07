import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import QuestionCard from '../../components/QuestionCard';
import { fetchQuestions } from '../../lib/questions';
import { errorMessage } from '../../lib/errors';
import { playerAge, ageToStartLevel, clampLevel } from '../../lib/age';
import { XP_PER_CORRECT } from '../../lib/level';
import { xpBonusPerCorrect } from '../../lib/powerups';
import { pushLibrary } from '../../lib/save';
import { playMusic } from '../../lib/audio';
import { emberStatus, SPIRE_CLEARED } from '../../content/story';
import { TOPIC_REGISTRY } from '../../content/topics';
import {
  SPIRE_FLOORS,
  SPIRE_INTRO,
  SPIRE_LIVES,
  SPIRE_CLEAR_XP,
  SPIRE_BOSS_DEFEAT,
} from '../../content/spire';
import { HUB_ZONE } from '../../content/zones';
import { useSaveStore } from '../../store/saveStore';
import { useProfileStore } from '../../store/profileStore';
import { useSettingsStore } from '../../store/settingsStore';
import { sendFlow } from '../../machines/gameFlow';
import type { LibraryEntry, Question } from '../../types';

/**
 * The Crystal Spire endgame climb (#55). Sealed until every crystal is
 * restored; once open, the hero ascends `SPIRE_FLOORS` — each floor a set of
 * escalating, topic-varied questions — toward the final boss, Umbra. Wrong
 * answers snuff candle-lights (`SPIRE_LIVES`); running out casts the hero back
 * to Lumina Field, healed. Clearing the top floor sets `SPIRE_CLEARED`, which
 * triggers the true-finale cutscene back in the world.
 */

type Phase =
  | { kind: 'locked' }
  | { kind: 'message'; text: string; next: () => void }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'question' }
  | { kind: 'win' }
  | { kind: 'lose' };

export default function SpireOverlay() {
  const save = useSaveStore((s) => s.save);
  const updateSave = useSaveStore((s) => s.update);
  const setFlag = useSaveStore((s) => s.setFlag);
  const profile = useProfileStore((s) => s.profile);
  const addXp = useProfileStore((s) => s.addXp);
  const recordActivity = useProfileStore((s) => s.recordActivity);

  const age = playerAge(profile);
  const powerUps = profile?.powerUps ?? {};
  const crystals = save ? emberStatus(save.flags).crystals : 0;
  const unlocked = crystals >= TOPIC_REGISTRY.length;

  const [phase, setPhase] = useState<Phase>(unlocked ? { kind: 'loading' } : { kind: 'locked' });
  const [floorIndex, setFloorIndex] = useState(0);
  const [qIdx, setQIdx] = useState(0);
  const [lives, setLives] = useState(SPIRE_LIVES);
  const [questions, setQuestions] = useState<Question[]>([]);
  const correctCount = useRef(0);
  const misses = useRef<LibraryEntry[]>([]);
  const started = useRef(false);

  const floor = SPIRE_FLOORS[floorIndex];

  // Spire music: the climb plays the Spire theme; the Final Battle track kicks
  // in only once the Umbra fight is actually underway (the boss floor's
  // question phase), not merely on arrival. App.useScreenMusic steps aside
  // while the Spire is open, so this is the sole controller here.
  const music = useSettingsStore((s) => s.music);
  const musicVolume = useSettingsStore((s) => s.musicVolume);
  const fightingUmbra = phase.kind === 'question' && floor?.isBoss === true;
  useEffect(() => {
    playMusic(fightingUmbra ? 'finalBoss' : 'spire');
  }, [fightingUmbra, music, musicVolume]);

  // Kick off the climb (intro → floor 1) once, when unlocked.
  useEffect(() => {
    if (!unlocked || started.current) return;
    started.current = true;
    const chain = SPIRE_INTRO.reduceRight<() => void>(
      (next, line) => () => setPhase({ kind: 'message', text: line, next }),
      () => beginFloor(0),
    );
    chain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  function beginFloor(i: number) {
    setFloorIndex(i);
    setQIdx(0);
    const f = SPIRE_FLOORS[i];
    setPhase({ kind: 'message', text: `${f.name}\n\n${f.taunt}`, next: () => loadFloor(i) });
  }

  function loadFloor(i: number) {
    const f = SPIRE_FLOORS[i];
    setPhase({ kind: 'loading' });
    const level = clampLevel(ageToStartLevel(age) + f.levelBonus + 1);
    const perTopic = Math.ceil(f.questions / f.topics.length);
    Promise.all(
      f.topics.map((t) =>
        fetchQuestions(t, age, level, perTopic, `the final ascent of a dark wizard's tower`),
      ),
    )
      .then((batches) => {
        const pool = shuffle(batches.flat());
        if (pool.length === 0) throw new Error('No questions came back for the Spire.');
        setQuestions(pool.slice(0, f.questions));
        setPhase({ kind: 'question' });
      })
      .catch((err) => setPhase({ kind: 'error', message: errorMessage(err) }));
  }

  function recordAnswer(correct: boolean, q: Question, picked: number) {
    if (correct) correctCount.current += 1;
    else misses.current.push({ question: q, picked });
  }

  function resolveQuestion(correct: boolean) {
    const proceed = () => {
      if (qIdx + 1 < floor.questions) {
        setQIdx((i) => i + 1);
        setPhase({ kind: 'question' });
      } else {
        floorComplete();
      }
    };
    if (correct) {
      proceed();
      return;
    }
    const remaining = lives - 1;
    setLives(remaining);
    if (remaining <= 0) {
      setPhase({
        kind: 'message',
        text: 'Your last candle gutters out. The dark gently sweeps you back down the stairs…',
        next: lose,
      });
    } else {
      setPhase({
        kind: 'message',
        text: `A candle snuffs out. ${remaining} light${remaining === 1 ? '' : 's'} left — keep climbing!`,
        next: proceed,
      });
    }
  }

  function floorComplete() {
    if (floor.isBoss) {
      setPhase({ kind: 'message', text: SPIRE_BOSS_DEFEAT, next: win });
    } else {
      setPhase({
        kind: 'message',
        text: 'The floor brightens — a stair of light spirals upward. You climb on!',
        next: () => beginFloor(floorIndex + 1),
      });
    }
  }

  function win() {
    confetti({ particleCount: 260, spread: 110, origin: { y: 0.4 } });
    const xp = correctCount.current * (XP_PER_CORRECT + xpBonusPerCorrect(powerUps)) + SPIRE_CLEAR_XP;
    void addXp(xp);
    void recordActivity();
    updateSave((s) => ({ ...s, library: pushLibrary(s.library, misses.current) }));
    setFlag(SPIRE_CLEARED);
    void useSaveStore.getState().flush();
    setPhase({ kind: 'win' });
  }

  function lose() {
    // Cast out, gently: wake at Lumina Field, fully healed. Keep XP earned.
    void addXp(correctCount.current * (XP_PER_CORRECT + xpBonusPerCorrect(powerUps)));
    updateSave((s) => ({
      ...s,
      hp: null,
      zoneId: HUB_ZONE,
      pos: null,
      library: pushLibrary(s.library, misses.current),
    }));
    void useSaveStore.getState().flush();
    setPhase({ kind: 'lose' });
  }

  function close() {
    void useSaveStore.getState().flush();
    sendFlow({ type: 'CLOSE' });
  }

  if (!save) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-gradient-to-b from-indigo-950 to-slate-950 border-4 border-violet-400/70 rounded-2xl p-6 w-full max-w-xl text-white shadow-2xl max-h-[88vh] overflow-y-auto"
      >
        {/* Header: floor + candle-lights (hidden on locked / end panels) */}
        {phase.kind !== 'locked' && phase.kind !== 'win' && phase.kind !== 'lose' && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-extrabold text-violet-200">🗼 The Crystal Spire</h2>
            <span title="Candle-lights" className="text-sm">
              {Array.from({ length: SPIRE_LIVES }).map((_, i) => (
                <span key={i} className={i < lives ? '' : 'opacity-25 grayscale'}>
                  🕯️
                </span>
              ))}
            </span>
          </div>
        )}

        {phase.kind === 'locked' && (
          <div className="text-center">
            <div className="text-6xl mb-3">🔒</div>
            <h2 className="text-xl font-extrabold text-violet-200 mb-2">The Spire is sealed</h2>
            <p className="text-sm text-white/80 mb-5">
              The Spire door will only open to a hero who has restored all four Crystals of
              Knowing. You have <strong>{crystals}/{TOPIC_REGISTRY.length}</strong>. Bring them all,
              then return — the one at the top is waiting.
            </p>
            <button
              onClick={close}
              className="bg-white/15 hover:bg-white/25 font-semibold rounded-lg px-6 py-2.5 text-sm"
            >
              Step back
            </button>
          </div>
        )}

        {phase.kind === 'loading' && (
          <p className="text-center text-violet-200 py-10 animate-pulse">
            The stairs rearrange themselves in the dark…
          </p>
        )}

        {phase.kind === 'error' && (
          <div className="text-center">
            <p className="text-sm text-orange-300 mb-4">The Spire shudders: {phase.message}</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => loadFloor(floorIndex)}
                className="bg-violet-500 hover:bg-violet-400 font-semibold rounded-lg px-5 py-2 text-sm"
              >
                Try the stair again
              </button>
              <button
                onClick={close}
                className="bg-white/15 hover:bg-white/25 font-semibold rounded-lg px-5 py-2 text-sm"
              >
                Leave the Spire
              </button>
            </div>
          </div>
        )}

        {phase.kind === 'message' && (
          <motion.button
            key={phase.text}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            onClick={phase.next}
            className="w-full text-left"
          >
            <p className="font-semibold whitespace-pre-line">{phase.text}</p>
            <p className="text-xs text-white/50 mt-3">▼ tap to continue</p>
          </motion.button>
        )}

        {phase.kind === 'question' && questions[qIdx] && (
          <div>
            <p className="text-center text-violet-200 font-bold mb-2 text-xs uppercase tracking-widest">
              {floor.name} · Question {qIdx + 1}/{floor.questions}
            </p>
            <QuestionCard
              key={`${floorIndex}:${qIdx}:${questions[qIdx].id}`}
              question={questions[qIdx]}
              hints={save.items.hint}
              onUseHint={useSaveStore.getState().spendHint}
              onAnswered={(correct, picked) => recordAnswer(correct, questions[qIdx], picked)}
              continueLabel="▲ Climb"
              onContinue={resolveQuestion}
            />
          </div>
        )}

        {phase.kind === 'win' && (
          <div className="text-center">
            <div className="text-6xl mb-2">🌅</div>
            <h2 className="text-2xl font-extrabold text-amber-300 mb-2">The Spire is yours!</h2>
            <p className="text-sm text-white/85 mb-5">
              You climbed every floor and out-remembered the Forgotten One. Lumina is truly bright
              again — and your brilliant answers earned a hero's reward.
            </p>
            <button
              onClick={close}
              className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-6 py-2.5"
            >
              🌟 See how it ends
            </button>
          </div>
        )}

        {phase.kind === 'lose' && (
          <div className="text-center">
            <div className="text-6xl mb-2">🕯️</div>
            <h2 className="text-xl font-extrabold mb-2">Down, but never out</h2>
            <p className="text-sm text-white/85 mb-5">
              The Spire sets you gently back in Lumina Field, rested and healed. The door stays
              open — rest up, and climb again whenever you're ready.
            </p>
            <button
              onClick={close}
              className="bg-white/15 hover:bg-white/25 font-semibold rounded-lg px-6 py-2.5 text-sm"
            >
              Back to the field
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/** Fisher-Yates — fair shuffle of the floor's combined question pool. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
