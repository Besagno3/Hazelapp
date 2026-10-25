import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveMessage } from '../auth/useLiveMessage';
import { errorMessage } from '../../lib/errors';
import {
  fetchReviewQueue,
  fixQuestion,
  reasonLabel,
  reviewQuestion,
  reviewTrouble,
  type ReviewDecision,
  type ReviewItem,
} from '../../lib/review';
import { cn } from '../../lib/utils';
import { asGrownUp } from '../../store/grownUpsStore';
import FamilyCard from './FamilyCard';
import QuestionBankBrowser from './QuestionBankBrowser';
import QuestionFixForm from './QuestionFixForm';

const DONE: Record<ReviewDecision, string> = {
  active: 'Released',
  approved: 'Approved',
  retired: 'Retired',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Focus a control by its selector once React has drawn it. */
function focusSoon(selector: string) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
}

type View = 'waiting' | 'browse';

/**
 * 🛡️ Question review (#147): the owner's admin page, inside 👪 Grown-ups.
 * Lists what's waiting — questions held back from everyone, then ones still
 * shown with new reports — with what families reported and what the checks
 * found, and decides each: release, approve, retire or ✏️ fix (migration
 * 0028: correct the answer, which approves it). 📚 Browse lists the whole bank
 * to check answers without waiting for a report. Both tabs stay drawn (one
 * hidden), so switching keeps a fix being typed and Browse's list. Leaving
 * with a fix not saved asks first. The database refuses anyone who isn't an
 * admin (`admin_review_queue`, migration 0019).
 */
export default function QuestionReviewPage({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRetire, setConfirmRetire] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string[]>([]);
  /** Waiting cards whose fix holds changes not saved, or is saving. */
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [browsePending, setBrowsePending] = useState(false);
  const [view, setView] = useState<View>('waiting');
  // Browse loads the first time it's opened, then stays (hidden on the other tab).
  const [browsed, setBrowsed] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [itemError, setItemError] = useState<{ id: string; message: string } | null>(null);
  // Read out again when it repeats word for word (the same question fixed twice).
  const [notice, setNotice] = useLiveMessage();
  /** Bumped by Refresh / Try again to load the queue again. */
  const [attempt, setAttempt] = useState(0);
  // "Try again" waits in place while it tries (the keyboard keeps its place);
  // once the queue loads the title takes the focus (#29 review round 1's
  // also-noted: the button used to vanish, dropping the focus to the page).
  const [retrying, setRetrying] = useState(false);
  const [refocus, setRefocus] = useState(0);
  const retried = useRef(false);
  const waitingPending = pendingIds.length > 0;
  const anyPending = waitingPending || browsePending;

  useEffect(() => {
    let live = true;
    // A grown-up action (#167): if 👪 Grown-ups locked meanwhile, the gate is asked for and it loads after.
    asGrownUp(fetchReviewQueue).then(
      (list) => {
        if (!live) return;
        setLoadError(null);
        setRetrying(false);
        setItems(list);
        if (retried.current) {
          retried.current = false;
          setRefocus((n) => n + 1);
        }
      },
      (err) => {
        console.warn('Loading the review queue failed:', errorMessage(err));
        if (!live) return;
        retried.current = false;
        setRetrying(false);
        setLoadError(reviewTrouble(err, `Couldn't load the review queue just now. Tap "Try again".`));
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  function reload() {
    // A new list would drop a fix being typed.
    if (waitingPending) return;
    setLoadError(null);
    setItems(null);
    setFixing([]);
    setAttempt((n) => n + 1);
  }

  function tryAgain() {
    retried.current = true;
    setRetrying(true);
    setAttempt((n) => n + 1);
  }

  function show(next: View) {
    if (next === view) return;
    setView(next);
    setBrowsed(true);
    // What was said is about the other tab.
    setNotice(null);
    setConfirmLeave(false);
  }

  async function decide(item: ReviewItem, decision: ReviewDecision) {
    setBusyId(item.id);
    setItemError(null);
    setConfirmRetire(null);
    try {
      await asGrownUp(() => reviewQuestion(item.id, decision));
      setItems((list) => (list ?? []).filter((i) => i.id !== item.id));
      setNotice(`${DONE[decision]}: "${item.text}"`);
      // Its card is gone: the title takes the focus (nothing else to land on).
      setRefocus((n) => n + 1);
    } catch (err) {
      console.warn('Saving a review decision failed:', errorMessage(err));
      setItemError({ id: item.id, message: reviewTrouble(err, "Couldn't save that just now. Please try again.") });
    } finally {
      setBusyId(null);
    }
  }

  const setPending = useCallback((id: string, pending: boolean) => {
    setPendingIds((list) => (pending ? (list.includes(id) ? list : [...list, id]) : list.filter((x) => x !== id)));
  }, []);

  const focusTitle = useCallback(() => setRefocus((n) => n + 1), []);

  // A fix saved in 📚 Browse: the waiting copy is out of date (and now approved), so it goes.
  const fixedInBrowse = useCallback(
    (id: string, text: string) => {
      setItems((list) => (list === null ? list : list.filter((i) => i.id !== id)));
      setFixing((list) => list.filter((x) => x !== id));
      setNotice(`Fixed and approved: "${text}"`);
    },
    [setNotice],
  );

  function leave() {
    if (anyPending && !confirmLeave) {
      setConfirmLeave(true);
      return;
    }
    onBack();
  }

  const subtitle =
    view === 'browse'
      ? 'Every saved question, the right answer ticked'
      : items === null
        ? undefined
        : items.length === 0
          ? 'Nothing waiting — all clear! 🎉'
          : `${plural(items.length, 'question', 'questions')} waiting`;

  return (
    <FamilyCard wide title="🛡️ Question review" subtitle={subtitle} refocus={refocus}>
      <details className="mb-4 rounded-xl bg-purple-50 p-3 text-sm text-gray-700">
        <summary className="cursor-pointer font-semibold text-purple-700">What the buttons do</summary>
        <ul className="mt-2 space-y-1">
          <li>
            <b>✅ Release</b> puts it back in the game.
          </li>
          <li>
            <b>⭐ Approve</b> puts it back, serves it first, and only two families saying "Not OK for kids" can pull it
            again.
          </li>
          <li>
            <b>🗑️ Retire</b> removes it for good.
          </li>
          <li>
            <b>✏️ Fix</b> corrects the question, its answers or which one is right, and approves it. Kids get the fixed
            one on their next request; a device that already had it may show the old one for up to 45 minutes, or
            until it reloads.
          </li>
        </ul>
        <p className="mt-2 text-xs text-gray-500">
          The family who reported a question never sees it again, whatever you decide. A new report brings it back
          here.
        </p>
      </details>

      <div role="group" aria-label="Show" className="mb-4 flex gap-2">
        {(
          [
            ['waiting', '⏳ Waiting'],
            ['browse', '📚 Browse all'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => show(key)}
            aria-pressed={view === key}
            className={cn(
              'min-h-11 flex-1 rounded-lg border px-3 text-sm font-semibold',
              view === key ? 'border-purple-600 bg-purple-600 text-white' : 'border-purple-300 text-purple-700 hover:bg-purple-50',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="status" className="sr-only">
        {notice && <p key={notice.key}>{notice.text}</p>}
      </div>
      {notice && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice.text}</p>}

      {browsed && (
        <div hidden={view !== 'browse'}>
          <QuestionBankBrowser onFixed={fixedInBrowse} onFocusTitle={focusTitle} onPendingChange={setBrowsePending} />
        </div>
      )}

      <div hidden={view !== 'waiting'}>
        {loadError && (
          <div className="text-center">
            <p className="text-red-600 text-sm">{loadError}</p>
            <button
              onClick={retrying ? undefined : tryAgain}
              aria-disabled={retrying || undefined}
              className="mt-3 text-sm text-purple-600 hover:underline min-h-11 px-3 aria-disabled:cursor-default aria-disabled:opacity-60"
            >
              {retrying ? 'Trying…' : 'Try again'}
            </button>
          </div>
        )}
        {!loadError && items === null && <p className="text-center text-gray-500 text-sm">Loading…</p>}

        {items && items.length > 0 && (
          <ul className="space-y-3" aria-label="Questions waiting for review">
            {items.map((item) => {
              const held = item.status === 'review';
              const busy = busyId === item.id;
              const open = fixing.includes(item.id);
              const closeFix = () => {
                setFixing((list) => list.filter((x) => x !== item.id));
                focusSoon(`[data-fix-button="${item.id}"]`);
              };
              return (
                <li key={item.id} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 font-semibold',
                        held ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800',
                      )}
                    >
                      {held ? 'Held back' : 'Still shown'}
                    </span>
                    <span className="text-gray-500">
                      {item.topic} · level {item.level}
                      {item.age !== null && ` · written for age ${item.age}`}
                    </span>
                  </div>
                  <p className="mt-2 font-semibold text-gray-800">{item.text}</p>
                  <ul className="mt-1 text-sm">
                    {item.options.map((o, i) => (
                      <li key={i} className={i === item.correctIndex ? 'font-semibold text-green-700' : 'text-gray-600'}>
                        <span aria-hidden>{i === item.correctIndex ? '✓ ' : '• '}</span>
                        {o}
                        {i === item.correctIndex && <span className="sr-only"> (the saved answer)</span>}
                      </li>
                    ))}
                  </ul>
                  {item.explanation && <p className="mt-1 text-xs text-gray-500">Explanation: {item.explanation}</p>}
                  <p className="mt-2 text-xs text-gray-600">
                    {item.reports === 0
                      ? 'No reports — held back by a check'
                      : `${plural(item.reports, 'report', 'reports')} from ${plural(item.families, 'family', 'families')}`}
                  </p>
                  {item.reasons.length > 0 && (
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {item.reasons.map((r, i) => (
                        <li key={i} className="break-words rounded-lg bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                          {reasonLabel(r)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {itemError?.id === item.id && <p className="mt-2 text-sm text-red-600">{itemError.message}</p>}
                  {open ? (
                    <QuestionFixForm
                      initial={item}
                      onCancel={closeFix}
                      onPendingChange={(p) => setPending(item.id, p)}
                      onSave={async (fix) => {
                        await fixQuestion(item.id, fix);
                        setFixing((list) => list.filter((x) => x !== item.id));
                        setItems((list) => (list ?? []).filter((i) => i.id !== item.id));
                        setNotice(`Fixed and approved: "${fix.text.trim()}"`);
                        // Its card is gone: the title takes the focus.
                        setRefocus((n) => n + 1);
                      }}
                    />
                  ) : confirmRetire === item.id ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-gray-700">Retire it for good?</span>
                      <button
                        onClick={busy ? undefined : () => void decide(item, 'retired')}
                        aria-disabled={busy || undefined}
                        className="min-h-11 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 aria-disabled:opacity-50"
                      >
                        Yes, retire
                      </button>
                      <button
                        onClick={() => setConfirmRetire(null)}
                        className="min-h-11 px-3 text-sm text-gray-500 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={busy ? undefined : () => void decide(item, 'active')}
                        aria-disabled={busy || undefined}
                        className="min-h-11 rounded-lg bg-purple-600 px-3 text-sm font-semibold text-white hover:bg-purple-700 aria-disabled:opacity-50"
                      >
                        ✅ Release
                      </button>
                      <button
                        onClick={busy ? undefined : () => void decide(item, 'approved')}
                        aria-disabled={busy || undefined}
                        className="min-h-11 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700 aria-disabled:opacity-50"
                      >
                        ⭐ Approve
                      </button>
                      <button
                        onClick={busy ? undefined : () => setConfirmRetire(item.id)}
                        aria-disabled={busy || undefined}
                        className="min-h-11 rounded-lg border border-red-300 px-3 text-sm font-semibold text-red-700 hover:bg-red-50 aria-disabled:opacity-50"
                      >
                        🗑️ Retire
                      </button>
                      <button
                        data-fix-button={item.id}
                        onClick={
                          busy
                            ? undefined
                            : () => {
                                setConfirmRetire(null);
                                setItemError(null);
                                setFixing((list) => [...list, item.id]);
                              }
                        }
                        aria-disabled={busy || undefined}
                        className="min-h-11 rounded-lg border border-purple-300 px-3 text-sm font-semibold text-purple-700 hover:bg-purple-50 aria-disabled:opacity-50"
                      >
                        ✏️ Fix
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {confirmLeave && (
        <div role="alert" className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p>A fix isn't saved yet. Leave without saving it?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={onBack} className="min-h-11 rounded-lg bg-amber-600 px-3 font-semibold text-white hover:bg-amber-700">
              Leave without saving
            </button>
            <button onClick={() => setConfirmLeave(false)} className="min-h-11 px-3 text-gray-600 hover:underline">
              Stay
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={leave}
          className="min-h-11 flex-1 rounded-lg bg-purple-600 py-2 font-semibold text-white transition hover:bg-purple-700"
        >
          ← Back to Grown-ups
        </button>
        {view === 'waiting' && (
          <button
            onClick={reload}
            aria-disabled={waitingPending || undefined}
            title={waitingPending ? 'Save or cancel your fix first' : undefined}
            className="min-h-11 px-3 text-sm text-purple-600 hover:underline aria-disabled:cursor-default aria-disabled:opacity-60"
          >
            Refresh
          </button>
        )}
      </div>
    </FamilyCard>
  );
}
