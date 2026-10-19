import { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { TYPING_LESSONS, anchorsFor, typingUnlocked } from '../../content/typing';
import { LEAF_MILESTONES, LEAVES_TUNING, LEAVES_XP, leafPool, leavesAccuracy, leavesFlag, lowestLeaf, newMilestones, pressLeaf, startLeaves, stepLeaves, type LeavesState } from '../../lib/leaves';
import { fromPhysicalKeyboard, nudgeText } from '../../lib/typing';
import { sfx } from '../../lib/audio';
import { cn } from '../../lib/utils';
import { useKeyboardStore } from '../../store/keyboardStore';
import { useProfileStore } from '../../store/profileStore';
import { useSaveStore } from '../../store/saveStore';
import { KeyboardDiagram } from './KeyboardDiagram';
import { keyName } from './hints';
import { KeyboardGate } from './TypingLessons';
import { inField, onControl } from './useTypingRun';

/**
 * 🍂 Falling Leaves (#159, item 7), in the Library: letters drift down on
 * leaves; type one before its leaf touches the ground. Three on the ground
 * (or the clock) end the round. Only the keys the lessons have taught so far
 * fall, the home-row hold applies as set, and the keyboard under the field
 * points at the lowest leaf. Catching 10, 25 and 50 in one round each pay
 * `LEAVES_XP` once (`leaves:<n>` flags). The rules are `lib/leaves.ts`.
 */
export default function FallingLeaves({ onBack }: { onBack: () => void }) {
  const flags = useSaveStore((s) => s.save?.flags ?? {});
  const holdRule = useSaveStore((s) => s.save?.typingAnchor ?? true);
  const update = useSaveStore((s) => s.update);
  const addXp = useProfileStore((s) => s.addXp);
  const keyboard = useKeyboardStore((s) => s.present);
  const [phase, setPhase] = useState<'intro' | 'playing' | 'over'>('intro');
  const [state, setState] = useState<LeavesState>(startLeaves);
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set());
  const [nudge, setNudge] = useState<string | null>(null);
  const [reached, setReached] = useState<number[]>([]);
  const field = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase === 'playing') field.current?.focus({ preventScroll: true });
  }, [phase]);
  const stateRef = useRef(state);
  const heldRef = useRef<Set<string>>(new Set());
  // The letters that can fall (by the lessons cleared); the clock's effect reads them through a ref.
  const pool = useMemo(() => leafPool(flags), [flags]);
  const poolRef = useRef(pool);
  useEffect(() => {
    poolRef.current = pool;
  }, [pool]);

  // The clock: every tick the leaves fall (and one may start).
  useEffect(() => {
    if (phase !== 'playing') return;
    const id = window.setInterval(() => {
      const next = stepLeaves(stateRef.current, LEAVES_TUNING.tickMs, poolRef.current);
      if (next.missed > stateRef.current.missed) sfx('wrong');
      stateRef.current = next;
      setState(next);
      if (next.over) setPhase('over');
    }, LEAVES_TUNING.tickMs);
    return () => clearInterval(id);
  }, [phase]);

  // The keys: a catch, a nudge or a wrong key; the keys held for the hold.
  useEffect(() => {
    if (phase !== 'playing') return;
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !fromPhysicalKeyboard(e)) return;
      if (inField(e.target)) return;
      if (!e.repeat) {
        heldRef.current = new Set(heldRef.current).add(e.code);
        setHeld(heldRef.current);
      }
      // No leaf ever says "space": a focused button keeps its Space (review round 1).
      if (e.key === ' ') {
        if (onControl(e.target)) return;
        e.preventDefault();
      } else if ([...e.key].length === 1) e.preventDefault();
      if (e.repeat) return;
      const { next, event, leaf } = pressLeaf(stateRef.current, { code: e.code, key: e.key, held: heldRef.current, holdRule });
      if (event === 'none') return;
      stateRef.current = next;
      setState(next);
      if (event === 'caught') {
        sfx('select');
        setNudge(null);
      } else if (event === 'hold' && leaf) {
        setNudge(nudgeText('hold', anchorsFor(leaf.ch), leaf.ch));
      } else if (event === 'caps' && leaf) {
        // Caps Lock, or a Shift held from the capitals lesson (review round 2).
        setNudge(nudgeText('caps', anchorsFor(leaf.ch), leaf.ch, e.getModifierState?.('CapsLock') === true));
      } else if (event === 'wrong') {
        setNudge(`No leaf says "${e.key.toLowerCase()}" — look for the lowest one!`);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (!heldRef.current.has(e.code)) return;
      const s = new Set(heldRef.current);
      s.delete(e.code);
      heldRef.current = s;
      setHeld(s);
    };
    const release = () => {
      heldRef.current = new Set();
      setHeld(heldRef.current);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
      // A key still down as the round ends would stay "held" into the next (review round 1).
      release();
    };
  }, [phase, holdRule]);

  // The round over: its milestones, each paid once.
  useEffect(() => {
    if (phase !== 'over') return;
    const fresh = newMilestones(stateRef.current.caught, useSaveStore.getState().save?.flags ?? {});
    setReached(fresh);
    if (fresh.length === 0) return;
    update((s) => ({ ...s, flags: { ...s.flags, ...Object.fromEntries(fresh.map((m) => [leavesFlag(m), true])) } }));
    // One write for every milestone this round reached (review round 2: one per milestone raced the server).
    void addXp(LEAVES_XP * fresh.length);
    sfx('levelup');
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.5 }, disableForReducedMotion: true });
  }, [phase, update, addXp]);

  if (!keyboard) return <KeyboardGate title="Falling Leaves" onBack={onBack} />;

  if (!typingUnlocked(flags)) {
    return (
      <div className="text-center">
        <div className="text-5xl mb-2" aria-hidden="true">
          🍂
        </div>
        <h2 className="text-xl font-extrabold mb-2">Falling Leaves</h2>
        <p className="text-sm text-white/80 mb-1">"Letters drift down on leaves — catch each one with the right finger before it lands!"</p>
        <p className="text-xs text-white/60 mb-5">Clear typing lesson 1 ({TYPING_LESSONS[0].title}) first: only keys you've learned fall.</p>
        <button onClick={onBack} className="bg-white/15 hover:bg-white/25 font-semibold rounded-xl px-5 py-2.5 min-h-11">
          📚 Back to the shelf
        </button>
      </div>
    );
  }

  function play() {
    const fresh = startLeaves();
    stateRef.current = fresh;
    setState(fresh);
    setNudge(null);
    setReached([]);
    setPhase('playing');
  }

  if (phase === 'intro' || phase === 'over') {
    const done = phase === 'over';
    const accuracy = Math.round(leavesAccuracy(state) * 100);
    const nextMilestone = LEAF_MILESTONES.find((m) => flags[leavesFlag(m)] !== true && !reached.includes(m));
    // Why the round ended (review round 3): the ground, the clock, or ⏹.
    const ended =
      state.missed >= LEAVES_TUNING.maxMissed
        ? `${LEAVES_TUNING.maxMissed} leaves landed.`
        : state.elapsedMs >= LEAVES_TUNING.roundMs
          ? "Time's up!"
          : 'Stopped early.';
    const letters = pool.map((k) => k.ch).join(' ');
    return (
      <div className="text-center">
        <div className="text-5xl mb-2" aria-hidden="true">
          🍂
        </div>
        <h2 className="text-xl font-extrabold mb-2">{done ? 'The leaves have settled!' : 'Falling Leaves'}</h2>
        {done ? (
          <>
            <p className="text-sm text-white/80 mb-1" role="status">
              {ended}{' '}
              You caught <span className="font-bold text-amber-300">{state.caught}</span> {state.caught === 1 ? 'leaf' : 'leaves'}, and {accuracy}% of your keys were right.
              {accuracy === 100 && state.caught > 0 ? ' Not one wrong key!' : ''}
            </p>
            {reached.map((m) => (
              <p key={m} className="text-sm text-yellow-200 font-semibold">
                🍂 {m} in one round — ⭐ +{LEAVES_XP} XP!
              </p>
            ))}
            <p className="text-xs text-white/60 mt-1 mb-4">
              {nextMilestone === undefined ? 'Every milestone caught — now it\'s just for fun!' : `Next: ${nextMilestone} leaves in one round.`}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-white/80 mb-1">
              "Letters drift down on leaves. Press each one with the right finger before its leaf lands — the lowest leaf has a white ring. Three
              on the ground — or a minute gone — and the round ends."
            </p>
            <p className="text-xs text-white/60 mb-1">
              Your letters so far: <span className="font-mono text-white/80">{letters}</span> — more with each lesson.
            </p>
            <p className="text-xs text-white/60 mb-4">
              {holdRule ? 'Keep your other hand on its bump key. ' : ''}10, 25 or 50 in one round: ⭐ {LEAVES_XP} XP each, once.
            </p>
          </>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <button autoFocus onClick={play} className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-6 py-3 min-h-11">
            {done ? '🍂 Play again' : '🍂 Play'}
          </button>
          <button onClick={onBack} className="bg-white/15 hover:bg-white/25 font-semibold rounded-xl px-5 py-3 min-h-11">
            📚 Back to the shelf
          </button>
        </div>
      </div>
    );
  }

  const lowest = lowestLeaf(state);
  const secondsLeft = Math.max(0, Math.ceil((LEAVES_TUNING.roundMs - state.elapsedMs) / 1000));
  return (
    // The round takes focus as it starts (review round 3: ▶ Play unmounted and focus fell to the page).
    <div ref={field} tabIndex={-1} className="outline-none" data-testid="leaf-round">
      <div className="flex items-center justify-between gap-2 mb-2 text-sm">
        <h2 className="text-lg font-extrabold">🍂 Falling Leaves</h2>
        <span className="text-xs text-white/80" data-testid="leaf-tally">
          Caught <span className="font-bold text-amber-300">{state.caught}</span> · Missed{' '}
          <span className="font-bold">
            {state.missed}/{LEAVES_TUNING.maxMissed}
          </span>{' '}
          · ⏳ {secondsLeft}s
        </span>
      </div>
      <div className="relative h-56 [@media(max-height:700px)]:h-40 rounded-xl bg-gradient-to-b from-sky-300/30 to-amber-200/20 overflow-hidden mb-2" data-testid="leaf-field">
        {state.leaves.map((leaf) => (
          <span
            key={leaf.id}
            data-testid="leaf"
            data-lowest={leaf.id === lowest?.id || undefined}
            aria-hidden="true"
            className={cn(
              'absolute -translate-x-1/2 -translate-y-1/2 font-mono font-extrabold text-amber-950 bg-amber-300 rounded-full w-9 h-9 grid place-items-center shadow-lg',
              // Punctuation is tiny: draw it big (review round 1).
              /[a-z]/.test(leaf.ch) ? 'text-base' : 'text-2xl leading-none',
              // The leaf that counts — the lowest — wears a white ring, so the kid needn't look down at the keyboard to tell.
              leaf.id === lowest?.id && 'ring-4 ring-white scale-110 z-10',
            )}
            // A gentle tilt (review round 3: at 40° a b, d, p or q was hard to match to an upright key).
            style={{ left: `${leaf.x}%`, top: `${leaf.y * 100}%`, transform: `translate(-50%, -50%) rotate(${(leaf.id % 2 ? 1 : -1) * leaf.y * 15}deg)` }}
          >
            {leaf.ch}
          </span>
        ))}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-amber-200/60" />
      </div>
      {/* Always mounted and this tall (a nudge never shoves the keyboard); a screen reader hears each nudge, else the lowest leaf's key. */}
      <p role="status" className="text-sm font-semibold text-sky-200 text-center mb-2 min-h-[1.5rem]">
        {nudge ?? <span className="sr-only">{`Caught ${state.caught}, missed ${state.missed}.${lowest ? ` Lowest leaf: ${keyName(lowest.code)}` : ''}`}</span>}
      </p>
      <KeyboardDiagram compact target={lowest?.code ?? null} anchors={lowest && holdRule ? anchorsFor(lowest.ch) : []} held={held} />
      <button onClick={() => setPhase('over')} className="mt-3 w-full min-h-11 bg-white/15 hover:bg-white/25 border border-white/20 font-semibold rounded-lg py-2 text-sm">
        ⏹ Stop the round
      </button>
    </div>
  );
}
