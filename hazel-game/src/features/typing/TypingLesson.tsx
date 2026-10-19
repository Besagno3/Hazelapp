import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { LINE_HOLD_MS, TYPING_BADGE_ID, TYPING_LESSONS, TYPING_LESSON_XP, type TypingLesson as LessonDef, typingLessonFlag, typingStars } from '../../content/typing';
import { nudgeText, typingAccuracy, type TypingProgress } from '../../lib/typing';
import { sfx } from '../../lib/audio';
import { useProfileStore } from '../../store/profileStore';
import { useSaveStore } from '../../store/saveStore';
import { KeyboardDiagram } from './KeyboardDiagram';
import { keyName, spellLine, wrongKey } from './hints';
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

  // A finished line stays a beat, all green, before the next (review round 3: it vanished on its
  // last key, and a kid typing in rhythm pressed into the new line). Keys in the beat do nothing.
  const hold = useRef<number | null>(null);
  useEffect(() => () => window.clearTimeout(hold.current ?? undefined), []);
  function lineDone(p: TypingProgress) {
    const total = { hits: tally.hits + p.hits, misses: tally.misses + p.misses };
    setTally(total);
    if (line + 1 < lesson.lines.length) {
      hold.current = window.setTimeout(() => setLine(line + 1), LINE_HOLD_MS);
      return;
    }
    // The lesson is cleared the moment the last line ends (leaving now keeps it) — the result card
    // follows after the same beat as any line (review round 4: a habitual Enter on the last key closed it unread).
    const flag = typingLessonFlag(lesson.id);
    let badge = false;
    update((s) => {
      const flags = { ...s.flags, [flag]: true };
      const all = TYPING_LESSONS.every((l) => flags[typingLessonFlag(l.id)]);
      badge = all && !s.badges.includes(TYPING_BADGE_ID);
      return { ...s, flags, badges: badge ? [...s.badges, TYPING_BADGE_ID] : s.badges };
    });
    if (!clearedBefore) void addXp(TYPING_LESSON_XP);
    const paid = !clearedBefore;
    hold.current = window.setTimeout(() => {
      sfx('levelup');
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 }, disableForReducedMotion: true });
      setResult({ accuracy: typingAccuracy(total), paid, badge });
    }, LINE_HOLD_MS);
  }

  // One live region for the whole lesson (review round 2): a per-line remount
  // never announced the new line, nor the result that replaced it.
  const stars = result ? typingStars(result.accuracy) : 0;
  const announce = result
    ? `Lesson cleared! ${stars} of 3 stars. ${Math.round(result.accuracy * 100)} percent of your keys were right.${result.paid ? ` ${TYPING_LESSON_XP} XP.` : ' You cleared this lesson before — no XP this time.'}`
    : started
      ? `Line ${line + 1} of ${lesson.lines.length}: ${spellLine(lesson.lines[line])}`
      : `${lesson.title}. ${lesson.teaches}`;
  const live = (
    <p key="live" className="sr-only" role="status">
      {announce}
    </p>
  );

  if (result) {
    return (
      <>
        {live}
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
        {result.paid ? (
          <p className="text-sm text-yellow-200 font-semibold">⭐ +{TYPING_LESSON_XP} XP</p>
        ) : (
          // As the desk says it (review round 5).
          <p className="text-sm text-white/60">You cleared this lesson before — no XP this time.</p>
        )}
        {result.badge && <p className="text-sm text-amber-300 font-semibold">✍️ You earned the Scribe's Quill badge! Find it on your 📜 Menu.</p>}
        <div className="flex flex-wrap justify-center gap-3 mt-4">
          {onNext && (
            <button autoFocus onClick={onNext} className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-5 py-2.5 min-h-11">
              ➡️ Next lesson
            </button>
          )}
          <button autoFocus={!onNext} onClick={onBack} className="bg-white/15 hover:bg-white/25 font-semibold rounded-xl px-5 py-2.5 min-h-11">
            ← Back to the lessons
          </button>
        </div>
      </div>
      </>
    );
  }

  if (!started) {
    return (
      <>
        {live}
      <div className="text-center">
        <div className="text-5xl mb-2" aria-hidden="true">
          {lesson.emoji}
        </div>
        <h2 className="text-xl font-extrabold mb-2">{lesson.title}</h2>
        <p className="text-sm text-white/80 mb-1">"{lesson.teaches}"</p>
        <p className="text-xs text-white/60 mb-5">
          {lesson.lines.length} lines to type.{' '}
          {holdRule
            ? lesson.lines.some((l) => /[A-Z]/.test(l))
              ? "Press the gold key. Keep your other hand on the blue key (F or J) — and for a capital, hold that hand's Shift instead (it turns blue too)."
              : 'Press the gold key. Keep your other hand on the blue key (F or J) while you type.'
            : 'The home-row hold is off: press the gold key with either hand.'}
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
            ← Back to the lessons
          </button>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      {live}
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-lg font-extrabold truncate">
          {lesson.emoji} {lesson.title}
        </h2>
        <span className="shrink-0 text-xs text-white/70">
          Line {line + 1} of {lesson.lines.length}
        </span>
      </div>
      <LineRun key={line} text={lesson.lines[line]} holdRule={holdRule} onDone={lineDone} spell label={`Line ${line + 1} of ${lesson.lines.length}`} />
      <button onClick={onBack} className="mt-3 w-full min-h-11 bg-white/15 hover:bg-white/25 border border-white/20 font-semibold rounded-lg py-2 text-sm">
        ← Back to the lessons
      </button>
    </div>
    </>
  );
}

/** One line of a lesson (or a scriptorium page), with the keyboard and hands under it. */
export function LineRun({
  text,
  holdRule,
  onDone,
  announce = false,
  compact = false,
  spell = false,
  label,
}: {
  text: string;
  holdRule: boolean;
  onDone: (p: TypingProgress) => void;
  /** A drill line is spelled to a screen reader ("F F F, J J J" — review round 5). */
  spell?: boolean;
  /** The name of the focused box ("Line 2 of 5"); "Typing line" when none. */
  label?: string;
  /** Read the whole line to a screen reader as it appears (a chest's lock, a letter — review round 3); the lessons' own live line does it for them. */
  announce?: boolean;
  /** The keyboard without the hands (a chest's lock, where the riddle below must stay in view). */
  compact?: boolean;
}) {
  const run = useTypingRun({
    text,
    holdRule,
    // A brighter tick as the line ends (review round 3: the last key sounded like any other).
    onDone: (p) => {
      sfx('correct');
      onDone(p);
    },
  });
  // The task goes into the live region a tick after it mounts (review round 4).
  const [primed, setPrimed] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setPrimed(true), 0);
    return () => clearTimeout(id);
  }, []);
  const nudge = run.last ? nudgeText(run.last.event, run.anchors, text[run.progress.index] ?? '', run.last.capsLock) : null;
  // The line takes focus as it appears (review round 2: the Start button unmounted and focus fell to the page) —
  // a plain box, so Space is the line's, never a button's.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div ref={box} tabIndex={-1} role="group" aria-label={label ?? 'Typing line'} className="outline-none">
      <div className="bg-white/10 rounded-xl px-3 py-4 mb-2">
        <TypingLine key={run.last?.event === 'wrong' ? run.last.seq : 'steady'} progress={run.progress} shake={run.last?.event === 'wrong'} spoken={spell ? spellLine(text) : undefined} />
      </div>
      {/* Always mounted and always this tall, so a nudge never shoves the keyboard (review round 1); a
          screen reader hears each nudge, and between nudges just the next key's name (round 2: a whole
          sentence a key was forty sentences a line) — the full words are the keyboard's own label. */}
      <p role="status" className="text-sm font-semibold text-sky-200 text-center mb-2 min-h-[1.5rem] [@media(max-width:639px)]:min-h-[3rem]">
        {nudge ?? <span className="sr-only">{announce && !run.last ? (primed ? `Type this: ${text}` : '') : run.target ? keyName(run.target) : ''}</span>}
      </p>
      <KeyboardDiagram compact={compact} target={run.target} targetChar={text[run.progress.index] ?? null} anchors={run.anchors} held={run.held} wrong={wrongKey(run.last)} />
    </div>
  );
}
