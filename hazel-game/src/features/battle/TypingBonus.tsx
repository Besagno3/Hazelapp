import { useEffect, useRef, useState } from 'react';
import { bonusWords, type TypingBonus as Bonus } from '../../content/typing';
import { nudgeText } from '../../lib/typing';
import { KeyboardDiagram } from '../typing/KeyboardDiagram';
import { keyName, wrongKey } from '../typing/hints';
import { TypingLine } from '../typing/TypingLine';
import { useTypingRun } from '../typing/useTypingRun';

/**
 * The post-battle bonus scroll (#165, item 3): one battle in three, with a
 * keyboard, a name to type for a little extra — the hero's, Ember's or the
 * foe's, written as it is (a capital wants the other hand's Shift). No clock:
 * the fight is over. Onward! without typing is fine too.
 */
export function TypingBonus({ bonus, holdRule, onClaim }: { bonus: Bonus; holdRule: boolean; onClaim: () => void }) {
  const [claimed, setClaimed] = useState(false);
  const run = useTypingRun({
    text: bonus.word,
    holdRule,
    active: !claimed,
    onDone: () => {
      setClaimed(true);
      onClaim();
    },
  });
  const whose = bonus.who === 'hero' ? 'your name' : bonus.who === 'ember' ? "Ember's name" : "the foe's name";
  // The task goes into the live region a tick after it mounts (review round 4).
  const [primed, setPrimed] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setPrimed(true), 0);
    return () => clearTimeout(id);
  }, []);
  const nudge = !claimed && run.last ? nudgeText(run.last.event, run.anchors, bonus.word[run.progress.index] ?? '', run.last.capsLock) : null;
  // Under the spoils, the scroll can sit below the fold: bring it into view once (review round 1).
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const raf = requestAnimationFrame(() => {
      const el = box.current;
      if (typeof el?.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={box} className="mt-4 rounded-xl border-2 border-amber-300/70 bg-white/10 p-3 text-left" data-testid="typing-bonus">
      <p className="font-bold text-amber-300 text-sm">📜 A bonus scroll!</p>
      <p className="text-xs text-white/80 mb-2">
        {claimed ? "A scribe's reward — well typed!" : `Type ${whose} to claim ${bonusWords(bonus.reward)}:`}
      </p>
      <div className="py-1">
        <TypingLine key={run.last?.event === 'wrong' ? run.last.seq : 'steady'} progress={run.progress} shake={run.last?.event === 'wrong'} big />
      </div>
      <p role="status" className="text-xs font-semibold text-center min-h-[1.25rem] [@media(max-width:639px)]:min-h-[2.5rem] text-sky-200">
        {claimed ? `✍️ Claimed: ${bonusWords(bonus.reward)}!` : (nudge ?? <span className="sr-only">{!run.last ? (primed ? `Type ${whose}: ${bonus.word}.` : '') : run.target ? keyName(run.target) : ''}</span>)}
      </p>
      {/* The keyboard stays once the name is typed, dimmed, so Onward! below doesn't jump (review round 5). */}
      <div className={claimed ? 'opacity-40' : undefined}>
        <KeyboardDiagram
          compact
          target={claimed ? null : run.target}
          targetChar={claimed ? null : (bonus.word[run.progress.index] ?? null)}
          anchors={claimed ? [] : run.anchors}
          held={run.held}
          wrong={claimed ? null : wrongKey(run.last)}
        />
      </div>
    </div>
  );
}
