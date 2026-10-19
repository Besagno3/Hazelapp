import { useState } from 'react';
import confetti from 'canvas-confetti';
import {
  TYPING_BADGE_ID,
  TYPING_LESSONS,
  TYPING_LESSON_XP,
  typingLessonFlag,
  typingStars,
  type TypingLesson as LessonDef,
} from '../../content/typing';
import { nudgeText, typingAccuracy, type TypingProgress } from '../../lib/typing';
import { sfx } from '../../lib/audio';
import { useProfileStore } from '../../store/profileStore';
import { useSaveStore } from '../../store/saveStore';
import { KeyboardDiagram } from './KeyboardDiagram';
import { TypingLine } from './TypingLine';
import { useTypingRun } from './useTypingRun';

/**
 * One typing lesson (#159): the Librarian's words, then its lines one by one
 * over the keyboard diagram, then stars for accuracy. Clearing it sets its
 * flag (which opens the next lesson), pays `TYPING_LESSON_XP` the first time,
 * and the last lesson cleared gives the Scribe's Quill badge.
 */
export default function TypingLesson({ lesson, onBack, onNext }: { lesson: LessonDef; onBack: () => void; onNext?: () => void }) {
  const holdRule = useSaveStore((s) => s.save?.typingAnchor ?? true);
  const clearedBefore = useSaveStore((s) => s.save?.flags[typingLessonFlag(lesson.id)] === true);
  const update = useSaveStore((s) => s.update);
  const addXp = useProfileStore((s) => s.addXp);
  const [started, setStarted] = useState(false);
  const [line, setLine] = useState(0);
  const [tally, setTally] = useState({ hits: 0, misses: 0 });
  const [result, setResult] = useState<{ accuracy: number; paid: boolean; badge: boolean } | null>(null);

  function lineDone(p: TypingProgress) {
    const total = { hits: tally.hits + p.hits, misses: tally.misses + p.misses };
    setTally(total);
    if (line + 1 < lesson.lines.length) {
      setLine(line + 1);
      return;
    }
    // The lesson is cleared the moment the last line ends (leaving now keeps it).
    const flag = typingLessonFlag(lesson.id);
    let badge = false;
    update((s) => {
      const flags = { ...s.flags, [flag]: true };
      const all = TYPING_LESSONS.every((l) => flags[typingLessonFlag(l.id)]);
      badge = all && !s.badges.includes(TYPING_BADGE_ID);
      return { ...s, flags, badges: badge ? [...s.badges, TYPING_BADGE_ID] : s.badges };
    });
    if (!clearedBefore) void addXp(TYPING_LESSON_XP);
    sfx('levelup');
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 }, disableForReducedMotion: true });
    setResult({ accuracy: typingAccuracy(total), paid: !clearedBefore, badge });
  }

  if (result) {
    const stars = typingStars(result.accuracy);
    return (
      <div className="text-center">
        <div className="text-5xl mb-2" aria-hidden="true">
          {lesson.emoji}
        </div>
        <h2 className="text-xl font-extrabold mb-1">Lesson cleared!</h2>
        <p className="text-2xl mb-1" role="img" aria-label={`${stars} of 3 stars`}>
          {'⭐'.repeat(stars)}
          <span className="opacity-25">{'⭐'.repeat(3 - stars)}</span>
        </p>
        <p className="text-sm text-white/80 mb-1">
          {Math.round(result.accuracy * 100)}% of your keys were right.
          {stars === 3 ? ' A true scribe!' : stars === 2 ? ' Nearly perfect!' : ' Every key you practise gets easier.'}
        </p>
        {result.paid && <p className="text-sm text-yellow-200 font-semibold">⭐ +{TYPING_LESSON_XP} XP</p>}
        {result.badge && <p className="text-sm text-amber-300 font-semibold">✍️ You earned the Scribe's Quill badge! Find it on your 📜 Menu.</p>}
        <div className="flex flex-wrap justify-center gap-3 mt-4">
          {onNext && (
            <button onClick={onNext} className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-5 py-2.5 min-h-11">
              ➡️ Next lesson
            </button>
          )}
          <button onClick={onBack} className="bg-white/15 hover:bg-white/25 font-semibold rounded-xl px-5 py-2.5 min-h-11">
            📚 Back to the lessons
          </button>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="text-center">
        <div className="text-5xl mb-2" aria-hidden="true">
          {lesson.emoji}
        </div>
        <h2 className="text-xl font-extrabold mb-2">{lesson.title}</h2>
        <p className="text-sm text-white/80 mb-1">"{lesson.teaches}"</p>
        <p className="text-xs text-white/60 mb-5">
          {lesson.lines.length} lines to type.{' '}
          {holdRule ? 'Keep your other hand on its bump key (F or J) while you type.' : 'The home-row hold is off: type with either hand.'}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            autoFocus
            onClick={() => setStarted(true)}
            className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-6 py-3 min-h-11"
          >
            ⌨️ Start typing
          </button>
          <button onClick={onBack} className="bg-white/15 hover:bg-white/25 font-semibold rounded-xl px-5 py-3 min-h-11">
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-lg font-extrabold truncate">
          {lesson.emoji} {lesson.title}
        </h2>
        <span className="shrink-0 text-xs text-white/70">
          Line {line + 1} of {lesson.lines.length}
        </span>
      </div>
      <LineRun key={line} text={lesson.lines[line]} holdRule={holdRule} onDone={lineDone} />
      <button onClick={onBack} className="mt-3 w-full min-h-11 bg-white/10 hover:bg-white/20 font-semibold rounded-lg py-2 text-sm">
        Stop for now
      </button>
    </div>
  );
}

/** One line of a lesson, with the keyboard and hands under it. */
function LineRun({ text, holdRule, onDone }: { text: string; holdRule: boolean; onDone: (p: TypingProgress) => void }) {
  const run = useTypingRun({ text, holdRule, onDone });
  const nudge = run.last ? nudgeText(run.last.event, run.anchors, text[run.progress.index] ?? '') : null;
  return (
    <div>
      <div className="bg-white/10 rounded-xl px-3 py-4 mb-2">
        <TypingLine key={run.last?.event === 'wrong' ? run.last.seq : 'steady'} progress={run.progress} shake={run.last?.event === 'wrong'} />
      </div>
      {/* Always mounted, so a screen reader hears each nudge as it appears. */}
      <p role="status" className={nudge ? 'text-sm font-semibold text-sky-200 text-center mb-2 min-h-[1.5rem]' : 'sr-only'}>
        {nudge ?? ''}
      </p>
      <KeyboardDiagram target={run.target} anchors={run.anchors} held={run.held} wrong={run.last?.event === 'wrong' ? run.last.code : null} />
    </div>
  );
}
