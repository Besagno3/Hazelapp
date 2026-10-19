import { useState } from 'react';
import { bonusWords, type TypingBonus as Bonus } from '../../content/typing';
import { nudgeText } from '../../lib/typing';
import { KeyboardDiagram } from '../typing/KeyboardDiagram';
import { TypingLine } from '../typing/TypingLine';
import { useTypingRun } from '../typing/useTypingRun';

/**
 * The post-battle bonus scroll (#159, item 3): one battle in three, with a
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
  const nudge = !claimed && run.last ? nudgeText(run.last.event, run.anchors, bonus.word[run.progress.index] ?? '') : null;
  return (
    <div className="mt-4 rounded-xl border-2 border-amber-300/70 bg-white/10 p-3 text-left" data-testid="typing-bonus">
      <p className="font-bold text-amber-300 text-sm">📜 A bonus scroll!</p>
      <p className="text-xs text-white/80 mb-2">
        {claimed ? `Claimed: ${bonusWords(bonus.reward)}! A scribe's reward.` : `Type ${whose} to claim ${bonusWords(bonus.reward)}:`}
      </p>
      <div className="py-1">
        <TypingLine key={run.last?.event === 'wrong' ? run.last.seq : 'steady'} progress={run.progress} shake={run.last?.event === 'wrong'} big />
      </div>
      <p role="status" className="text-xs font-semibold text-center min-h-[1.25rem] text-sky-200">
        {claimed ? '✍️ Claimed!' : (nudge ?? '')}
      </p>
      {!claimed && <KeyboardDiagram target={run.target} anchors={run.anchors} held={run.held} wrong={run.last?.event === 'wrong' ? run.last.code : null} />}
    </div>
  );
}
