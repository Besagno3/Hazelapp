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
  floorWards,
} from '../../content/spire';
import { HUB_ZONE } from '../../content/zones';
import { useSaveStore } from '../../store/saveStore';
import { useProfileStore } from '../../store/profileStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSpireStore, type SpireBump } from '../../store/spireStore';
import { sendFlow } from '../../machines/gameFlow';
import type { LibraryEntry, Question } from '../../types';

/**
 * The Crystal Spire endgame climb (#55; walkable floors since #74). Sealed
 * until every crystal is restored; once open, the hero climbs `SPIRE_FLOORS`.
 * Each floor is a themed map drawn by the world canvas: the hero walks it,
 * bumps rune seals to face its questions, and takes the stairs once every
 * seal is broken. Wrong answers snuff candle-lights (`SPIRE_LIVES`) — and the
 * hero's circle of light shrinks with them; running out casts the hero back
 * to Lumina Field, healed. The top floor is Umbra's throne room: walking up to
 * him starts the final question gauntlet. Clearing it sets `SPIRE_CLEARED`.
 *
 * This overlay owns the rules and the panels; `spireStore` carries the live
 * climb state to the canvas (floor, broken seals, candles) and brings bumps
 * back. While the hero is exploring, only a small HUD shows.
 */

type Phase =
  | { kind: 'locked' }
  | { kind: 'message'; text: string; next: () => void }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'explore' }
  | { kind: 'question'; mode: 'ward'; wardId: string; index: number }
  | { kind: 'question'; mode: 'boss'; index: number }
  | { kind: 'win' }
  | { kind: 'lose' };

export default function SpireOverlay() {
  const save = useSaveStore((s) => s.save);
  const updateSave = useSaveStore((s) => s.update);
  const setFlag = useSaveStore((s) => s.setFlag);
  const profile = useProfileStore((s) => s.profile);
  const addXp = useProfileStore((s) => s.addXp);
  const recordActivity = useProfileStore((s) => s.recordActivity);

  const floorIndex = useSpireStore((s) => s.floor);
  const lives = useSpireStore((s) => s.lives);
  const broken = useSpireStore((s) => s.broken);
  const spire = useSpireStore.getState;

  const age = playerAge(profile);
  const powerUps = profile?.powerUps ?? {};
  const crystals = save ? emberStatus(save.flags).crystals : 0;
  const unlocked = crystals >= TOPIC_REGISTRY.length;

  const [phase, setPhase] = useState<Phase>(unlocked ? { kind: 'loading' } : { kind: 'locked' });
  const [questions, setQuestions] = useState<Question[]>([]);
  const correctCount = useRef(0);
  const misses = useRef<LibraryEntry[]>([]);
  const started = useRef(false);

  const floor = floorIndex !== null ? SPIRE_FLOORS[floorIndex] : null;
  const wardTotal = floor ? floorWards(floor.theme).length : 0;

  // A fresh climb every time the Spire opens; tidy up when it closes.
  useEffect(() => {
    spire().reset();
    return () => spire().reset();
  }, [spire]);

  // The hero may walk only while no panel is open. Keyed on the phase object
  // (not just its kind): a bump pauses exploring, and a bump that resolves
  // straight back to 'explore' must still re-enable it.
  const msgShownAt = useRef(0);
  useEffect(() => {
    spire().setExploring(phase.kind === 'explore');
    msgShownAt.current = performance.now();
  }, [phase, spire]);

  /** Ignore the tail of a double-tap that would skip the panel that just opened. */
  function advance(next: () => void) {
    if (performance.now() - msgShownAt.current < 250) return;
    next();
  }

  // Spooky music (#74): each floor has its own loop; the Final Battle track
  // takes over only once the Umbra fight is actually underway. App's screen
  // music steps aside while the Spire is open, so this is the sole controller.
  const music = useSettingsStore((s) => s.music);
  const musicVolume = useSettingsStore((s) => s.musicVolume);
  const fightingUmbra = phase.kind === 'question' && phase.mode === 'boss';
  const track = fightingUmbra ? 'finalBoss' : (floor?.music ?? 'spire');
  useEffect(() => {
    playMusic(track);
  }, [track, music, musicVolume]);

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

  // Resolve bumps reported by the floor map. The canvas pushes them into the
  // store; we react in a store subscription (the latest handler via a ref).
  const onBump = useRef<(b: SpireBump) => void>(() => {});
  useEffect(() => {
    onBump.current = (b) => {
      spire().clearPending();
      if (!floor || floorIndex === null) return;
      if (b.kind === 'ward' && !floor.isBoss) {
        const index = spire().broken.length;
        if (questions[index]) setPhase({ kind: 'question', mode: 'ward', wardId: b.id, index });
        else setPhase({ kind: 'explore' });
      } else if (b.kind === 'stairs') {
        const left = wardTotal - spire().broken.length;
        if (left <= 0) {
          setPhase({
            kind: 'message',
            text: 'The stairs are free. You climb higher into the dark…',
            next: () => beginFloor(floorIndex + 1),
          });
        } else {
          setPhase({
            kind: 'message',
            text: `The stairs are sealed tight. ${left} rune${left === 1 ? '' : 's'} still glow${left === 1 ? 's' : ''} somewhere on this floor…`,
            next: () => setPhase({ kind: 'explore' }),
          });
        }
      } else if (b.kind === 'umbra' && floor.isBoss) {
        setPhase({
          kind: 'message',
          text: '"So. The little spark reaches the top." Umbra rises from the throne, and the candles lean away from him…',
          next: () => setPhase({ kind: 'question', mode: 'boss', index: 0 }),
        });
      } else {
        setPhase({ kind: 'explore' });
      }
    };
  });
  useEffect(
    () =>
      useSpireStore.subscribe((s, prev) => {
        if (s.pending && s.pending !== prev.pending) onBump.current(s.pending);
      }),
    [],
  );

  function beginFloor(i: number) {
    spire().enterFloor(i); // the floor map appears behind the taunt
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
        // Every seal (and every step of Umbra's challenge) needs a question —
        // a short batch would leave a seal that can never break.
        if (pool.length < f.questions) {
          throw new Error(`only ${pool.length} of ${f.questions} riddles came back for this floor.`);
        }
        setQuestions(pool.slice(0, f.questions));
        setPhase(
          f.isBoss
            ? {
                kind: 'message',
                text: 'At the far end of the hall, on a throne of shadow, something waits. Walk up to it — if you dare.',
                next: () => setPhase({ kind: 'explore' }),
              }
            : {
                kind: 'message',
                text: `${f.questions} rune seals glow somewhere on this floor. Break them all to free the stairs!`,
                next: () => setPhase({ kind: 'explore' }),
              },
        );
      })
      .catch((err) => setPhase({ kind: 'error', message: errorMessage(err) }));
  }

  function recordAnswer(correct: boolean, q: Question, picked: number) {
    if (correct) correctCount.current += 1;
    else misses.current.push({ question: q, picked });
  }

  /** A wrong answer snuffs a candle; the last one ends the climb. */
  function loseCandle(then: () => void) {
    const remaining = spire().lives - 1;
    spire().setLives(remaining);
    if (remaining <= 0) {
      setPhase({
        kind: 'message',
        text: 'Your last candle gutters out. The dark gently sweeps you back down the stairs…',
        next: lose,
      });
      return;
    }
    setPhase({
      kind: 'message',
      text: `A candle snuffs out — the dark creeps closer. ${remaining} light${remaining === 1 ? '' : 's'} left!`,
      next: then,
    });
  }

  function resolveWard(correct: boolean, wardId: string) {
    // The seal breaks either way — a wrong answer just costs a candle.
    spire().breakWard(wardId);
    const allBroken = spire().broken.length >= wardTotal;
    const after = () =>
      allBroken
        ? setPhase({
            kind: 'message',
            text: 'The last seal shatters! Somewhere, stone grinds — the stairs up are free.',
            next: () => setPhase({ kind: 'explore' }),
          })
        : setPhase({ kind: 'explore' });
    if (correct) after();
    else loseCandle(after);
  }

  function resolveBoss(correct: boolean, index: number) {
    const proceed = () => {
      if (floor && index + 1 < floor.questions) setPhase({ kind: 'question', mode: 'boss', index: index + 1 });
      else setPhase({ kind: 'message', text: SPIRE_BOSS_DEFEAT, next: win });
    };
    if (correct) proceed();
    else loseCandle(proceed);
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

  /** Stop climbing: back to the Spire door, keeping the XP earned so far. */
  function leave() {
    void addXp(correctCount.current * (XP_PER_CORRECT + xpBonusPerCorrect(powerUps)));
    updateSave((s) => ({ ...s, library: pushLibrary(s.library, misses.current) }));
    correctCount.current = 0;
    misses.current = [];
    setPhase({
      kind: 'message',
      text: 'You slip back down the winding stairs to the Spire door. The climb will wait — come back whenever you are ready.',
      next: close,
    });
  }

  function close() {
    void useSaveStore.getState().flush();
    spire().reset();
    sendFlow({ type: 'CLOSE' });
  }

  if (!save) return null;

  const candles = (
    <span title="Candle-lights" className="text-sm">
      {Array.from({ length: SPIRE_LIVES }).map((_, i) => (
        <span key={i} className={i < lives ? '' : 'opacity-25 grayscale'}>
          🕯️
        </span>
      ))}
    </span>
  );

  // Exploring: just a slim HUD over the map — the world stays playable.
  if (phase.kind === 'explore' && floor) {
    return (
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 pointer-events-none flex items-center gap-2">
        <div className="bg-slate-950/85 border-2 border-violet-400/60 rounded-xl px-4 py-2 text-white shadow-xl flex items-center gap-4 whitespace-nowrap">
          <span className="text-xs font-bold text-violet-200">{floor.name}</span>
          <span className="text-xs text-white/80">
            {floor.isBoss
              ? '👑 Walk up to Umbra'
              : broken.length >= wardTotal
                ? '🪜 The stairs are free!'
                : `🔮 Seals ${broken.length}/${wardTotal}`}
          </span>
          {candles}
        </div>
        <button
          onClick={leave}
          className="pointer-events-auto bg-slate-950/85 hover:bg-slate-800 border-2 border-white/30 rounded-xl px-3 py-2 text-xs font-semibold text-white shadow-xl whitespace-nowrap"
        >
          🚪 Leave the Spire
        </button>
      </div>
    );
  }

  const q = phase.kind === 'question' ? questions[phase.index] : undefined;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-gradient-to-b from-indigo-950 to-slate-950 border-4 border-violet-400/70 rounded-2xl p-6 w-full max-w-xl text-white shadow-2xl max-h-[88vh] overflow-y-auto"
      >
        {/* Header: floor + candle-lights (hidden on locked / end panels) */}
        {phase.kind !== 'locked' && phase.kind !== 'win' && phase.kind !== 'lose' && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-extrabold text-violet-200">🗼 The Crystal Spire</h2>
            {candles}
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

        {phase.kind === 'error' && floorIndex !== null && (
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
            onClick={() => advance(phase.next)}
            className="w-full text-left"
          >
            <p className="font-semibold whitespace-pre-line">{phase.text}</p>
            <p className="text-xs text-white/50 mt-3">▼ tap to continue</p>
          </motion.button>
        )}

        {phase.kind === 'question' && floor && q && (
          <div>
            <p className="text-center text-violet-200 font-bold mb-2 text-xs uppercase tracking-widest">
              {phase.mode === 'ward'
                ? `${floor.name} · Rune seal ${phase.index + 1}/${wardTotal}`
                : `${floor.name} · Umbra's challenge ${phase.index + 1}/${floor.questions}`}
            </p>
            <QuestionCard
              key={`${floorIndex}:${phase.mode}:${phase.index}:${q.id}`}
              question={q}
              hints={save.items.hint}
              onUseHint={useSaveStore.getState().spendHint}
              onAnswered={(correct, picked) => recordAnswer(correct, q, picked)}
              continueLabel={phase.mode === 'ward' ? '🔮 Break the seal' : '⚔️ Stand firm'}
              onContinue={(correct) =>
                phase.mode === 'ward' ? resolveWard(correct, phase.wardId) : resolveBoss(correct, phase.index)
              }
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
