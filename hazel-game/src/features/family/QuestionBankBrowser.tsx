import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type FormEvent } from 'react';
import { ALL_TOPIC_INFO } from '../../content/topics';
import { useLiveMessage } from '../auth/useLiveMessage';
import { errorMessage } from '../../lib/errors';
import {
  BANK_PAGE,
  STATUS_WORDS,
  browseQuestions,
  fixQuestion,
  reviewTrouble,
  topicLabel,
  type BankFilter,
  type BankQuestion,
  type QuestionFix,
} from '../../lib/review';
import { cn } from '../../lib/utils';
import { asGrownUp } from '../../store/grownUpsStore';
import QuestionFixForm from './QuestionFixForm';

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  review: 'bg-red-100 text-red-700',
  retired: 'bg-gray-200 text-gray-600',
};
const LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What the waiting list did to a question Browse may have loaded (the page tells it). */
export type OutsideChange = { fix: QuestionFix } | { status: string };

export interface BankBrowserHandle {
  /** A question fixed or decided on the ⏳ Waiting tab: its card here is brought up to date. */
  changedElsewhere: (id: string, change: OutsideChange) => void;
}

const HINT = 'Save or cancel your fix first — a new list would lose it.';

interface BrowserProps {
  /** Whether it's the tab on show: a hidden one never moves the focus. */
  active: boolean;
  /** A question was fixed (the waiting list drops it too). */
  onFixed: (id: string, text: string) => void;
  /** Nothing left to land on (a retry loaded): the page's title takes the focus. */
  onFocusTitle: () => void;
  /** Whether any fix here holds changes not saved yet, or is saving. */
  onPendingChange: (pending: boolean) => void;
}

/**
 * 📚 Browse (migration 0028): every saved question with its right answer
 * marked, by topic, level, status and words, newest first, so the owner can
 * check answers without waiting for a report — and ✏️ Fix any of them. The
 * lists apply as they're picked; the words when Search (or Enter) is pressed.
 * While a fix is open with changes, the filters wait, so nothing typed is
 * dropped by a new list.
 */
const QuestionBankBrowser = forwardRef<BankBrowserHandle, BrowserProps>(function QuestionBankBrowser(
  { active, onFixed, onFocusTitle, onPendingChange },
  ref,
) {
  const [draft, setDraft] = useState<BankFilter>({});
  const [filter, setFilter] = useState<BankFilter>({});
  const [items, setItems] = useState<BankQuestion[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [moreTrouble, setMoreTrouble] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [fixing, setFixing] = useState<string[]>([]);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [said, say] = useLiveMessage();
  const [nudged, setNudged] = useState(false);
  const hintId = useId();
  const box = useRef<HTMLDivElement>(null);
  /** Bumped by every new list (Search, a filter, Try again). */
  const [attempt, setAttempt] = useState(0);
  // Which list a Load more belongs to: one that lands after a new list started is dropped.
  const generation = useRef(0);
  const retried = useRef(false);
  const blocked = pendingIds.length > 0;
  // The page's latest callbacks, so its inline arrows never re-run a load.
  const page = useRef({ active, onFixed, onFocusTitle, onPendingChange });
  useEffect(() => {
    page.current = { active, onFixed, onFocusTitle, onPendingChange };
  });

  /** Focus something of this tab's own (never a twin on the hidden tab), once it's drawn — only while on show. */
  const focusSoon = useCallback((selector: string) => {
    requestAnimationFrame(() => {
      if (page.current.active) box.current?.querySelector<HTMLElement>(selector)?.focus();
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      changedElsewhere(id, change) {
        setItems((list) =>
          list === null
            ? list
            : list.map((q) =>
                q.id !== id
                  ? q
                  : 'fix' in change
                    ? {
                        ...q,
                        text: change.fix.text.trim(),
                        options: change.fix.options.map((o) => o.trim()),
                        correctIndex: change.fix.correctIndex,
                        explanation: change.fix.explanation?.trim() || null,
                        status: 'approved',
                      }
                    : { ...q, status: change.status },
              ),
        );
        // A fix open on the old copy would save over the new one: it starts again from it.
        setFixing((list) => list.filter((x) => x !== id));
      },
    }),
    [],
  );



  useEffect(() => {
    page.current.onPendingChange(blocked);
  }, [blocked]);

  useEffect(() => {
    let live = true;
    asGrownUp(() => browseQuestions(filter)).then(
      (first) => {
        if (!live) return;
        setTrouble(null);
        setRetrying(false);
        setItems(first);
        setMore(first.length === BANK_PAGE);
        say(first.length === 0 ? 'No questions match.' : `${plural(first.length, 'question', 'questions')}${first.length === BANK_PAGE ? ' so far' : ''}`);
        if (retried.current) {
          retried.current = false;
          if (page.current.active) page.current.onFocusTitle();
        }
      },
      (err) => {
        console.warn('Loading the question bank failed:', errorMessage(err));
        if (!live) return;
        retried.current = false;
        setRetrying(false);
        const words = reviewTrouble(err, `Couldn't load the questions just now. Tap "Try again".`);
        setTrouble(words);
        say(words);
      },
    );
    return () => {
      live = false;
    };
  }, [filter, attempt, say]);

  /** Said when a filter is tried while a fix holds changes: shown in amber and read out. */
  function nudge() {
    setNudged(true);
    say(HINT);
  }

  /** A new list from the top. */
  function reload(next: BankFilter) {
    if (blocked) return nudge();
    setNudged(false);
    generation.current += 1;
    setItems(null);
    setTrouble(null);
    setMoreTrouble(null);
    setLoadingMore(false);
    setFixing([]);
    setFilter(next);
    setAttempt((n) => n + 1);
  }

  /** The lists apply as they're picked. */
  function pick(change: BankFilter) {
    if (blocked) return nudge();
    const next = { ...draft, ...change };
    setDraft(next);
    reload(next);
  }

  function search(e: FormEvent) {
    e.preventDefault();
    reload({ ...draft });
  }

  // "Try again" waits in place while it tries (the keyboard keeps its place, #29 review round 1).
  function tryAgain() {
    generation.current += 1;
    retried.current = true;
    setRetrying(true);
    setAttempt((n) => n + 1);
  }

  async function loadMore() {
    if (loadingMore || !items || items.length === 0) return;
    const mine = generation.current;
    setLoadingMore(true);
    setMoreTrouble(null);
    try {
      const next = await asGrownUp(() => browseQuestions(filter, items[items.length - 1]));
      if (generation.current !== mine) return;
      // From the list as it is now: a fix saved while this was on its way stays.
      const seen = new Set(items.map((q) => q.id));
      const added = next.filter((q) => !seen.has(q.id));
      setItems((list) => {
        const have = new Set((list ?? []).map((q) => q.id));
        return [...(list ?? []), ...added.filter((q) => !have.has(q.id))];
      });
      setMore(next.length === BANK_PAGE);
      say(added.length === 0 ? 'No more questions.' : `${plural(added.length, 'more question', 'more questions')}`);
      // The keyboard lands on the first new question (or stays at the end), not on a button that moved or went.
      const target = added[0] ?? items[items.length - 1];
      focusSoon(`[data-bank-card="${target.id}"]`);
    } catch (err) {
      console.warn('Loading more questions failed:', errorMessage(err));
      if (generation.current !== mine) return;
      const words = reviewTrouble(err, "Couldn't load more just now. Please try again.");
      setMoreTrouble(words);
      say(words);
    } finally {
      if (generation.current === mine) setLoadingMore(false);
    }
  }

  const setPending = useCallback((id: string, pending: boolean) => {
    setPendingIds((list) => (pending ? (list.includes(id) ? list : [...list, id]) : list.filter((x) => x !== id)));
  }, []);

  function closeFix(id: string) {
    setFixing((list) => list.filter((x) => x !== id));
    focusSoon(`[data-fix-button="${id}"]`);
  }

  // 16px, not the label's 12px semibold (iOS zooms on a smaller field).
  const field =
    'min-h-11 rounded-lg border border-gray-300 px-2 text-base font-normal text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-400 aria-disabled:cursor-default aria-disabled:opacity-60';
  const held = { 'aria-disabled': blocked || undefined, 'aria-describedby': hintId };
  const label =
    'flex flex-col text-xs font-semibold text-gray-700 [@media(max-width:359px)]:w-full';

  return (
    <div ref={box}>
      <form onSubmit={search} className="mb-2 flex flex-wrap items-end gap-2" aria-label="Find questions">
        <label className={label}>
          Topic
          <select
            value={draft.topic ?? ''}
            onChange={(e) => pick({ topic: e.target.value || undefined })}
            {...held}
            className={field}
          >
            <option value="">All topics</option>
            {ALL_TOPIC_INFO.map((t) => (
              <option key={t.id} value={t.id}>
                {t.emoji} {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Level
          <select
            value={draft.level ?? ''}
            onChange={(e) => pick({ level: e.target.value ? Number(e.target.value) : undefined })}
            {...held}
            className={field}
          >
            <option value="">Any</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Status
          <select
            value={draft.status ?? ''}
            onChange={(e) => pick({ status: e.target.value || undefined })}
            {...held}
            className={field}
          >
            <option value="">All but retired</option>
            <option value="active">Live</option>
            <option value="approved">Approved</option>
            <option value="review">Held back</option>
            <option value="retired">Retired</option>
          </select>
        </label>
        <label className={cn(label, 'min-w-[10rem] flex-1')}>
          Words in the question
          <input
            type="search"
            value={draft.search ?? ''}
            onChange={(e) => (blocked ? nudge() : setDraft((d) => ({ ...d, search: e.target.value })))}
            {...held}
            className={field}
          />
        </label>
        <button
          type="submit"
          {...held}
          className="min-h-11 rounded-lg bg-purple-600 px-3 text-sm font-semibold text-white hover:bg-purple-700 aria-disabled:cursor-default aria-disabled:opacity-60 [@media(max-width:359px)]:w-full"
        >
          🔍 Search
        </button>
      </form>
      <p id={hintId} className={cn('mb-4 text-xs', blocked && nudged ? 'font-semibold text-amber-700' : 'text-gray-500')}>
        {blocked ? HINT : 'Topic, level and status apply as you pick them; press Search for words.'}
      </p>

      <div aria-live="polite" className="sr-only">
        {said && <p key={said.key}>{said.text}</p>}
      </div>

      {trouble && (
        <div className="mb-3 text-center">
          <p className="text-sm text-red-600">{trouble}</p>
          <button
            onClick={retrying ? undefined : tryAgain}
            aria-disabled={retrying || undefined}
            className="mt-2 min-h-11 px-3 text-sm text-purple-600 hover:underline aria-disabled:cursor-default aria-disabled:opacity-60"
          >
            {retrying ? 'Trying…' : 'Try again'}
          </button>
        </div>
      )}
      {!trouble && items === null && <p className="text-center text-sm text-gray-500">Loading…</p>}
      {items && items.length === 0 && (
        <div className="text-center">
          <p className="text-sm text-gray-500">No questions match.</p>
          {(filter.topic || filter.level || filter.status || filter.search?.trim()) && (
            <button
              onClick={() => {
                setDraft({});
                reload({});
              }}
              className="mt-2 min-h-11 px-3 text-sm text-purple-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-3" aria-label="Saved questions">
          {items.map((q) => {
            const open = fixing.includes(q.id);
            return (
              <li key={q.id} data-bank-card={q.id} tabIndex={-1} className="rounded-xl border border-gray-200 p-3 focus:outline-none focus:ring-2 focus:ring-purple-400">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={cn('rounded-full px-2 py-0.5 font-semibold', STATUS_STYLE[q.status] ?? 'bg-gray-100')}>
                    {STATUS_WORDS[q.status] ?? q.status}
                  </span>
                  <span className="text-gray-500">
                    {topicLabel(q.topic)} · level {q.level}
                    {q.age !== null && ` · written for age ${q.age}`} · asked {q.timesAsked}×
                    {q.reports > 0 && ` · ${plural(q.reports, 'report', 'reports')}`}
                  </span>
                </div>
                <p className="mt-2 font-semibold text-gray-800">{q.text}</p>
                <ul className="mt-1 text-sm">
                  {q.options.map((o, i) => (
                    <li key={i} className={i === q.correctIndex ? 'font-semibold text-green-700' : 'text-gray-600'}>
                      <span aria-hidden>{i === q.correctIndex ? '✓ ' : '• '}</span>
                      {o}
                      {i === q.correctIndex && <span className="sr-only"> (the right answer)</span>}
                    </li>
                  ))}
                </ul>
                {q.explanation && <p className="mt-1 text-xs text-gray-500">Explanation: {q.explanation}</p>}
                {q.status === 'retired' && <p className="mt-2 text-xs text-gray-500">Retired questions can't be fixed.</p>}
                {open ? (
                  <QuestionFixForm
                    initial={q}
                    onCancel={() => closeFix(q.id)}
                    onPendingChange={(p) => setPending(q.id, p)}
                    onSave={async (fix) => {
                      await fixQuestion(q.id, fix);
                      // Saved as typed, trimmed (the database trims the same way).
                      setItems((list) =>
                        (list ?? []).map((x) =>
                          x.id === q.id
                            ? {
                                ...x,
                                text: fix.text.trim(),
                                options: fix.options.map((o) => o.trim()),
                                correctIndex: fix.correctIndex,
                                explanation: fix.explanation?.trim() || null,
                                status: 'approved',
                              }
                            : x,
                        ),
                      );
                      closeFix(q.id);
                      page.current.onFixed(q.id, fix.text.trim());
                    }}
                  />
                ) : (
                  q.status !== 'retired' && (
                    <button
                      data-fix-button={q.id}
                      onClick={() => setFixing((list) => [...list, q.id])}
                      className="mt-3 min-h-11 rounded-lg border border-purple-300 px-3 text-sm font-semibold text-purple-700 hover:bg-purple-50"
                    >
                      ✏️ Fix
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}

      {items && more && (
        <div className="mt-3">
          {moreTrouble && <p className="mb-2 text-center text-sm text-red-600">{moreTrouble}</p>}
          <button
            onClick={() => void loadMore()}
            aria-disabled={loadingMore || undefined}
            className="min-h-11 w-full rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 aria-disabled:cursor-default aria-disabled:opacity-60"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
});

export default QuestionBankBrowser;
