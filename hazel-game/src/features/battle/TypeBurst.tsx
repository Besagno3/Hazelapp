import { useRef, useState } from 'react';
import { BURST_MS } from '../../content/typing';
import { nudgeText, type TypingEvent, type TypingProgress } from '../../lib/typing';
import { KeyboardDiagram } from '../typing/KeyboardDiagram';
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
  onResult,
  onEvent,
  label = "✍️ Scribe's power — type it!",
  doneText = "✍️ Done! The scribe's power is yours.",
  lateText = 'The ink dried — next time!',
}: {
  word: string;
  holdRule: boolean;
  durationMs?: number;
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
  const settled = useRef(false);
  const settle = (done: boolean) => {
    if (settled.current) return;
    settled.current = true;
    setState(done ? 'done' : 'late');
    onResult(done);
  };
  const run = useTypingRun({ text: word, holdRule, active: state === 'typing', onEvent, onDone: () => settle(true) });
  const nudge = state === 'typing' && run.last ? nudgeText(run.last.event, run.anchors, word[run.progress.index] ?? '') : null;
  return (
    <div className="mt-3 rounded-xl border-2 border-amber-300 bg-indigo-950 text-white p-3" data-testid="type-burst">
      <DefendTimer
        durationMs={durationMs}
        stopped={state !== 'typing'}
        onExpire={() => settle(false)}
        label={label}
        what="to type"
      />
      <div className="py-2">
        <TypingLine key={run.last?.event === 'wrong' ? run.last.seq : 'steady'} progress={run.progress} shake={run.last?.event === 'wrong'} big />
      </div>
      <p role="status" className="text-xs font-semibold text-center min-h-[1.25rem] text-sky-200">
        {state === 'done' ? doneText : state === 'late' ? lateText : (nudge ?? '')}
      </p>
      {state === 'typing' && <KeyboardDiagram compact target={run.target} anchors={run.anchors} held={run.held} wrong={run.last?.event === 'wrong' ? run.last.code : null} />}
    </div>
  );
}
