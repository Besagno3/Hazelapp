import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { LINE_HOLD_MS, SCRIPTORIUM_OPENS_AFTER, SCRIPTORIUM_XP, TYPING_LESSONS, pageFlag, pagesCopied, scriptoriumOpen, scriptoriumPages, type ScriptoriumPage, typingLessonsCleared, typingStars } from '../../content/typing';
import { typingAccuracy, type TypingProgress } from '../../lib/typing';
import { sfx } from '../../lib/audio';
import { useKeyboardStore } from '../../store/keyboardStore';
import { useProfileStore } from '../../store/profileStore';
import { useSaveStore } from '../../store/saveStore';
import { LineRun } from './TypingLesson';
import { KeyboardGate } from './TypingLessons';

/**
 * The scriptorium (#159, item 5): a scribe's desk in the Library where the
 * kid copies out a page — the "here's why" of a question that stumped them
 * (learning by writing), or a true fact — line by line over the keyboard and
 * hands. A page pays `SCRIPTORIUM_XP` once and leaves the desk; the desk
 * refills from the shelf and the facts. Opens once the capitals lesson is
 * cleared: every page has big letters in it.
 */
export default function Scriptorium({ onBack }: { onBack: () => void }) {
  const library = useSaveStore((s) => s.save?.library ?? []);
  const flags = useSaveStore((s) => s.save?.flags ?? {});
  const holdRule = useSaveStore((s) => s.save?.typingAnchor ?? true);
  const update = useSaveStore((s) => s.update);
  const addXp = useProfileStore((s) => s.addXp);
  const keyboard = useKeyboardStore((s) => s.present);
  // The page being copied is kept whole: once copied, the desk no longer lists it.
  const [active, setActive] = useState<ScriptoriumPage | null>(null);
  const [line, setLine] = useState(0);
  const [tally, setTally] = useState({ hits: 0, misses: 0 });
  const [result, setResult] = useState<{ accuracy: number; paid: boolean } | null>(null);
  // A finished line stays a beat before the next (review round 3), as in a lesson.
  const hold = useRef<number | null>(null);
  useEffect(() => () => window.clearTimeout(hold.current ?? undefined), []);

  if (!keyboard) return <KeyboardGate title="The Scriptorium" onBack={onBack} />;

  const pages = scriptoriumPages(library, flags);
  const copied = pagesCopied(flags);

  function open(page: ScriptoriumPage) {
    // A beat still running from the last page would move this one on (review round 4: it could open a page past its last line).
    window.clearTimeout(hold.current ?? undefined);
    setActive(page);
    setLine(0);
    setTally({ hits: 0, misses: 0 });
    setResult(null);
  }
  function leave() {
    window.clearTimeout(hold.current ?? undefined);
    setActive(null);
  }
  // A short window (800×600): the keyboard without the hands, so the page's line and its Back stay in view (review round 4).
  const short = typeof window !== 'undefined' && window.matchMedia?.('(max-height: 700px)').matches === true;

  function lineDone(p: TypingProgress) {
    const total = { hits: tally.hits + p.hits, misses: tally.misses + p.misses };
    setTally(total);
    if (active && line + 1 < active.lines.length) {
      hold.current = window.setTimeout(() => setLine(line + 1), LINE_HOLD_MS);
      return;
    }
    const flag = pageFlag(active!.id);
    const paid = flags[flag] !== true;
    update((s) => ({ ...s, flags: { ...s.flags, [flag]: true } }));
    if (paid) void addXp(SCRIPTORIUM_XP);
    // The result after the same beat as any line (review round 4).
    hold.current = window.setTimeout(() => {
      sfx('levelup');
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.5 }, disableForReducedMotion: true });
      setResult({ accuracy: typingAccuracy(total), paid });
    }, LINE_HOLD_MS);
  }

  if (!scriptoriumOpen(flags)) {
    const gate = TYPING_LESSONS.find((l) => l.id === SCRIPTORIUM_OPENS_AFTER)!;
    const at = TYPING_LESSONS.indexOf(gate) + 1;
    return (
      <div className="text-center">
        <div className="text-5xl mb-2" aria-hidden="true">
          📜
        </div>
        <h2 className="text-xl font-extrabold mb-2">The Scriptorium</h2>
        <p className="text-sm text-white/80 mb-1">"A scribe copies whole pages here — big letters, little letters, every dot and comma."</p>
        <p className="text-xs text-white/60 mb-5">
          Clear typing lesson {at} ({gate.title}) first — {typingLessonsCleared(flags)} of {at} so far.
        </p>
        <button onClick={onBack} className="bg-white/15 hover:bg-white/25 font-semibold rounded-xl px-5 py-2.5 min-h-11">
          📚 Back to the shelf
        </button>
      </div>
    );
  }

  // One live region for the desk, a page and its result (review round 2).
  const stars = result ? typingStars(result.accuracy) : 0;
  const announce =
    active && result
      ? `Page copied! ${stars} of 3 stars. ${Math.round(result.accuracy * 100)} percent of your keys were right.${result.paid ? ` ${SCRIPTORIUM_XP} XP.` : ''}`
      : active
        ? `Line ${line + 1} of ${active.lines.length}: ${active.lines[line]}`
        : '';
  const live = (
    <p key="live" className="sr-only" role="status">
      {announce}
    </p>
  );

  if (active && result) {
    const next = pages[0];
    return (
      <>
        {live}
      <div className="text-center">
        <div className="text-5xl mb-2" aria-hidden="true">
          📜
        </div>
        <h2 className="text-xl font-extrabold mb-1">Page copied!</h2>
        <p className="text-2xl mb-1" role="img" aria-label={`${stars} of 3 stars`}>
          {'⭐'.repeat(stars)}
          <span className="opacity-25">{'⭐'.repeat(3 - stars)}</span>
        </p>
        <p className="text-sm text-white/80 mb-1">
          {Math.round(result.accuracy * 100)}% of your keys were right.
          {stars === 3 ? ' A true scribe!' : stars === 2 ? ' Nearly perfect!' : ' Every page you copy gets easier.'}
        </p>
        {result.paid ? (
          <p className="text-sm text-yellow-200 font-semibold">⭐ +{SCRIPTORIUM_XP} XP</p>
        ) : (
          <p className="text-sm text-white/60">This page was copied before — no XP this time.</p>
        )}
        <div className="flex flex-wrap justify-center gap-3 mt-4">
          {next && (
            <button autoFocus onClick={() => open(next)} className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-5 py-2.5 min-h-11">
              ➡️ Next page
            </button>
          )}
          <button autoFocus={!next} onClick={leave} className="bg-white/15 hover:bg-white/25 font-semibold rounded-xl px-5 py-2.5 min-h-11">
            ← Back to the pages
          </button>
        </div>
      </div>
      </>
    );
  }

  if (active) {
    return (
      <>
        {live}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-lg font-extrabold truncate">📜 {active.source === 'shelf' ? 'Copy out the why' : active.title}</h2>
          <span className="shrink-0 text-xs text-white/70">
            Line {line + 1} of {active.lines.length}
          </span>
        </div>
        <p className="text-xs text-white/70 mb-2">
          {active.source === 'shelf' ? (
            <>
              The question that stumped you: <span className="text-white/90">{active.title}</span> Copy out why — a scribe remembers what they write.
            </>
          ) : (
            'A true fact. Copy it out, every letter and dot.'
          )}
        </p>
        {/* The whole passage, the line being copied bright, the lines done green (review round 3: one line at a time hid the sense). */}
        <p className="text-xs leading-relaxed text-white/50 mb-2" aria-hidden="true" data-testid="passage">
          {active.lines.map((l, i) => (
            <span key={i} className={i === line ? 'text-white font-semibold' : i < line ? 'text-emerald-300/80' : undefined}>
              {l}{' '}
            </span>
          ))}
        </p>
        <LineRun key={line} text={active.lines[line]} holdRule={holdRule} onDone={lineDone} compact={short} />
        <button onClick={leave} className="mt-3 w-full min-h-11 bg-white/15 hover:bg-white/25 border border-white/20 font-semibold rounded-lg py-2 text-sm">
          ← Back to the pages
        </button>
      </div>
      </>
    );
  }

  return (
    <>
      {live}
    <div>
      <h2 className="text-xl font-extrabold mb-1">📜 The Scriptorium</h2>
      <p className="text-sm text-white/80 mb-1">"Copy a page, every letter and dot, and it's yours for good. That's how the old books were kept."</p>
      <p className="text-xs text-amber-300 font-semibold mb-3">
        {copied === 0 ? 'No pages copied yet' : `${copied} ${copied === 1 ? 'page' : 'pages'} copied`} · +{SCRIPTORIUM_XP} XP a page
      </p>
      {pages.length === 0 ? (
        <p className="text-emerald-300 text-sm py-4 text-center">
          Every page on the desk is copied! New ones come when a question stumps you. 🦉
        </p>
      ) : (
        <div className="space-y-2 mb-3">
          {pages.map((page) => (
            <button
              key={page.id}
              onClick={() => open(page)}
              className="w-full text-left flex items-center gap-3 bg-white/10 hover:bg-white/20 rounded-xl p-3 text-sm transition min-h-11"
            >
              <span className="text-xl w-7 text-center" aria-hidden="true">
                {page.source === 'shelf' ? '📚' : '💡'}
              </span>
              <span className="flex-1 min-w-0">
                <span className="font-bold block truncate">{page.title}</span>
                <span className="block text-xs text-white/60">
                  {page.source === 'shelf' ? 'From your shelf — copy out why · ' : 'A true fact · '}
                  {page.lines.length} {page.lines.length === 1 ? 'line' : 'lines'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      <button onClick={onBack} className="mt-1 w-full min-h-11 bg-white/10 hover:bg-white/20 font-semibold rounded-lg py-2 text-sm">
        📚 Back to the shelf
      </button>
    </div>
    </>
  );
}
