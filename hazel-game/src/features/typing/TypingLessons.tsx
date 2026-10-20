import { useEffect, useRef, useState } from 'react';
import { LITTLE_HANDS_AGE, TYPING_LESSONS, typingLessonFlag, typingLessonOpen, typingLessonsCleared } from '../../content/typing';
import { fromPhysicalKeyboard } from '../../lib/typing';
import { playerAge } from '../../lib/age';
import { useKeyboardStore } from '../../store/keyboardStore';
import { useProfileStore } from '../../store/profileStore';
import { useSaveStore } from '../../store/saveStore';
import TypingLesson from './TypingLesson';

/**
 * Librarian Sage's typing lessons (#159), inside the Library's panel: a real
 * keyboard first (touch typing can't be learned on glass), then the lessons
 * in order — each opens once the one before is cleared — and the home-row
 * hold switch, which the 📜 Menu has too.
 */
export default function TypingLessons({ onBack }: { onBack: () => void }) {
  const flags = useSaveStore((s) => s.save?.flags ?? {});
  const holdRule = useSaveStore((s) => s.save?.typingAnchor ?? true);
  const update = useSaveStore((s) => s.update);
  const profile = useProfileStore((s) => s.profile);
  const keyboard = useKeyboardStore((s) => s.present);
  const [activeId, setActiveId] = useState<string | null>(null);
  const cleared = typingLessonsCleared(flags);
  // With every lesson cleared there is no Continue button to land on: the heading takes the focus (review round 7).
  const heading = useRef<HTMLHeadingElement>(null);
  const allCleared = cleared === TYPING_LESSONS.length;
  useEffect(() => {
    if (keyboard && activeId === null && allCleared) heading.current?.focus();
  }, [keyboard, activeId, allCleared]);

  if (!keyboard) return <KeyboardGate onBack={onBack} />;

  const active = TYPING_LESSONS.find((l) => l.id === activeId);
  if (active) {
    const i = TYPING_LESSONS.indexOf(active);
    const next = TYPING_LESSONS[i + 1];
    return <TypingLesson key={active.id} lesson={active} onBack={() => setActiveId(null)} onNext={next ? () => setActiveId(next.id) : undefined} />;
  }

  const little = playerAge(profile) < LITTLE_HANDS_AGE;
  // The lesson to do next: the first open one not yet cleared (review round 1: it sat below twelve ✅ rows).
  const next = TYPING_LESSONS.find((l) => flags[typingLessonFlag(l.id)] !== true && typingLessonOpen(l.id, flags));
  return (
    <div>
      <h2 ref={heading} tabIndex={-1} className="text-xl font-extrabold mb-1 focus:outline-none">
        ⌨️ Typing lessons
      </h2>
      <p className="text-sm text-white/80 mb-1">
        "Ten fingers, eyes on the page, pointers on the bumpy keys. That's how a scribe types!"
      </p>
      <p className="text-xs text-amber-300 font-semibold mb-3">
        {cleared} of {TYPING_LESSONS.length} lessons cleared
        {cleared === TYPING_LESSONS.length ? ' — a true scribe! ✍️' : ''}
      </p>
      {next && (
        <button
          autoFocus
          onClick={() => setActiveId(next.id)}
          className="w-full text-left flex items-center gap-3 bg-amber-400 hover:bg-amber-300 text-amber-950 rounded-xl p-3 mb-3 text-sm font-bold transition min-h-11"
        >
          <span className="text-xl w-7 text-center" aria-hidden="true">
            ▶
          </span>
          <span className="flex-1">
            {cleared === 0 ? 'Start: ' : 'Continue: '}
            {TYPING_LESSONS.indexOf(next) + 1}. {next.title}
          </span>
        </button>
      )}
      {little && (
        <p className="text-xs text-white/70 bg-white/10 rounded-lg px-3 py-2 mb-3">
          🖐️ Little hands? Go slow, and it's fine to turn the home-row hold off until your fingers can reach.
        </p>
      )}
      {/* The hold switch sits by the tip that names it (review round 2), above the list. */}
      <div className="mb-3">
      <button
        onClick={() => update((s) => ({ ...s, typingAnchor: !s.typingAnchor }))}
        aria-pressed={holdRule}
        className="w-full min-h-11 flex items-center justify-between bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 text-sm"
      >
        <span className="text-left">
          🖐️ Home-row hold
          <span className="block text-xs text-white/70">
            {holdRule ? 'Hold F or J with your other hand while you type' : 'Type with either hand — no holding'}
          </span>
        </span>
        <span className={holdRule ? 'text-emerald-300 font-bold' : 'text-white/70'}>{holdRule ? 'On' : 'Off'}</span>
      </button>
      </div>
      <div className="space-y-2 mb-3">
        {TYPING_LESSONS.map((lesson, i) => {
          const done = flags[typingLessonFlag(lesson.id)] === true;
          const open = typingLessonOpen(lesson.id, flags);
          return (
            <button
              key={lesson.id}
              onClick={() => open && setActiveId(lesson.id)}
              // Locked rows stay in the Tab order and readable (aria-disabled, as QuestionCard's crossed-out options).
              aria-disabled={!open}
              className="w-full text-left flex items-center gap-3 bg-white/10 hover:bg-white/20 aria-disabled:hover:bg-white/10 aria-disabled:opacity-70 aria-disabled:cursor-not-allowed rounded-xl p-3 text-sm transition min-h-11"
            >
              <span className="text-xl w-7 text-center" aria-hidden="true">
                {done ? '✅' : open ? lesson.emoji : '🔒'}
              </span>
              <span className="flex-1">
                <span className="font-bold">
                  {i + 1}. {lesson.title}
                </span>
                <span className="block text-xs text-white/60">
                  {done ? 'Cleared — play it again any time' : open ? `${lesson.lines.length} lines` : 'Clear the lesson before it first'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <button onClick={onBack} className="mt-3 w-full min-h-11 bg-white/10 hover:bg-white/20 font-semibold rounded-lg py-2 text-sm">
        📚 Back to the shelf
      </button>
    </div>
  );
}

/**
 * Until a physical keyboard has been seen this session: ask for a key. On a
 * phone or tablet the glass keyboard sends no physical key, so this screen
 * stays — with a word about why.
 */
export function KeyboardGate({ onBack, title = 'Typing lessons' }: { onBack: () => void; title?: string }) {
  const seen = useKeyboardStore((s) => s.seen);
  const [touch] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true);
  // The gate has no button to land on but Back: its heading takes the focus (review round 7).
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (fromPhysicalKeyboard(e)) seen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [seen]);
  return (
    <div className="text-center">
      <div className="text-5xl mb-2" aria-hidden="true">
        ⌨️
      </div>
      <h2 ref={heading} tabIndex={-1} className="text-xl font-extrabold mb-2 focus:outline-none">
        {title}
      </h2>
      <p className="text-sm text-white/80 mb-2">Press any key on your keyboard to begin.</p>
      <p className="text-xs text-white/60 mb-5">
        {touch
          ? "This needs a real keyboard — the one on a phone or tablet's screen can't teach your fingers. Plug one in, or play on a computer!"
          : 'Touch typing is learned on a real keyboard, with all ten fingers.'}
      </p>
      <button onClick={onBack} className="bg-white/15 hover:bg-white/25 font-semibold rounded-xl px-5 py-2.5 min-h-11">
        📚 Back to the shelf
      </button>
    </div>
  );
}
