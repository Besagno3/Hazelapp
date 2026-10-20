import { useEffect, useRef, useState } from 'react';
import { BURST_MS } from '../../content/typing';
import { nudgeText, type TypingEvent, type TypingProgress } from '../../lib/typing';
import { KeyboardDiagram } from '../typing/KeyboardDiagram';
import { keyName, wrongKey } from '../typing/hints';
import { TypingLine } from '../typing/TypingLine';
import { useTypingRun } from '../typing/useTypingRun';
import { DefendTimer } from './DefendTimer';

/**
 * A ✍️ scribe burst (#159, item 2): after a right answer, a short word to
 * type against the clock — the hero's name, Ember's or the foe's. Every key
 * does something at once (a tick, the next letter lights); the word typed in
 * time powers the move (a harder hit, or ◆ after a block — the arena's call).
 * Running out just means no bonus: the answer already counted. Keyboard-only,
 * and only once the first typing lesson is cleared.
 */
export function TypeBurst({
  word,
  holdRule,
  durationMs = BURST_MS,
  timed = true,
  readyMs = 0,
  onResult,
  onEvent,
  label = "✍️ Scribe's power — type it!",
  doneText = "✍️ Done! The scribe's power is yours.",
  lateText = 'No bonus this time — the answer still counts.',
}: {
  word: string;
  holdRule: boolean;
  durationMs?: number;
  /** Off for a player whose defend countdown is off (📜 → ⚔️ Battle): no clock, the word waits (the arena decides what ends it). */
  timed?: boolean;
  /** A beat before the clock starts (the race: hands coming off the arrow keys, review round 2). Keys count from the first moment. */
  readyMs?: number;
  /** The prompt over the bar, and what's said when the word is typed in time or the clock runs out. */
  label?: string;
  doneText?: string;
  lateText?: string;
  /** Once: typed in time (true) or the clock ran out (false). */
  onResult: (done: boolean) => void;
  /** Each press that did something (the arena's sparks). */
  onEvent?: (event: TypingEvent, progress: TypingProgress) => void;
}) {
  const [state, setState] = useState<'typing' | 'done' | 'late'>('typing');
  const [ready, setReady] = useState(readyMs <= 0);
  useEffect(() => {
    if (readyMs <= 0) return;
    const id = window.setTimeout(() => setReady(true), readyMs);
    return () => clearTimeout(id);
  }, [readyMs]);
  // The card takes focus as it appears (review round 3: an untimed burst never settles, so ▶ Go!
  // was never focused and focus sat on the page) — a plain box, so Space is the word's.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, []);
  // The task goes into the live region a tick after it mounts (review round 4: text a region is born with may not be read).
  const [primed, setPrimed] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setPrimed(true), 0);
    return () => clearTimeout(id);
  }, []);
  const settled = useRef(false);
  const settle = (done: boolean) => {
    if (settled.current) return;
    settled.current = true;
    setState(done ? 'done' : 'late');
    onResult(done);
  };
  const run = useTypingRun({
    text: word,
    holdRule,
    active: state === 'typing',
    onEvent,
    onDone: () => settle(true),
  });
  const nudge = state === 'typing' && run.last ? nudgeText(run.last.event, run.anchors, word[run.progress.index] ?? '', run.last.capsLock) : null;
  return (
    <div
      ref={box}
      tabIndex={-1}
      role="group"
      aria-label={label}
      // A Space in the beat after the word (round 6): the run has let go, the box still has focus — never a page scroll.
      onKeyDown={(e) => {
        if (state !== 'typing' && e.key === ' ') e.preventDefault();
      }}
      className="rounded-xl border-2 border-amber-300 bg-indigo-950 text-white p-3 outline-none"
      data-testid="type-burst"
    >
      {timed ? (
        <DefendTimer
          durationMs={durationMs}
          // Only a typed word stops it "in time"; run out, it says "Time's up" (review round 3).
          stopped={state === 'done'}
          ready={ready}
          onExpire={() => settle(false)}
          // The box's name says it (round 7: the timer's visible label read it a second time).
          label={<span aria-hidden="true">{label}</span>}
          what="to type"
        />
      ) : (
        <p className="mb-2 flex items-center justify-between gap-2 text-white font-bold text-sm uppercase tracking-widest">
          {/* The group's name already says it (round 6). */}
          <span className="min-w-0" aria-hidden="true">{label}</span>
          <span className="shrink-0 normal-case tracking-normal text-xs font-semibold text-white/70">No clock — take your time</span>
        </p>
      )}
      <div className="py-2">
        <TypingLine key={run.last?.event === 'wrong' ? run.last.seq : 'steady'} progress={run.progress} shake={run.last?.event === 'wrong'} big />
      </div>
      <p role="status" className="text-xs font-semibold text-center min-h-[1.25rem] [@media(max-width:639px)]:min-h-[2.5rem] text-sky-200">
        {/* Before the first key a screen reader hears the whole task (review round 3), then just the next key's name. */}
        {state === 'done' ? doneText : state === 'late' ? lateText : (nudge ?? <span className="sr-only">{!run.last ? (primed ? `Type this: ${word}` : '') : run.target ? keyName(run.target) : ''}</span>)}
      </p>
      {/* The keyboard stays once the word is done, dimmed, so the card keeps its height and ▶ Go! doesn't jump (review round 2). */}
      <div className={state === 'typing' ? '' : 'opacity-40'}>
        <KeyboardDiagram
          compact
          target={state === 'typing' ? run.target : null}
          targetChar={state === 'typing' ? (word[run.progress.index] ?? null) : null}
          anchors={state === 'typing' ? run.anchors : []}
          held={run.held}
          wrong={state === 'typing' ? wrongKey(run.last) : null}
        />
      </div>
    </div>
  );
}
