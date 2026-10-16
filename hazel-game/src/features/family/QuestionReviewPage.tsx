import { useEffect, useState } from 'react';
import { errorMessage } from '../../lib/errors';
import { fetchReviewQueue, reasonLabel, reviewQuestion, type ReviewDecision, type ReviewItem } from '../../lib/review';
import { cn } from '../../lib/utils';
import FamilyCard from './FamilyCard';

const DONE: Record<ReviewDecision, string> = {
  active: 'Released',
  approved: 'Approved',
  retired: 'Retired',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * 🛡️ Question review (#147): the owner's admin page, inside 👪 Grown-ups.
 * Lists what's waiting — questions held back from everyone, then ones still
 * shown with new reports — with what families reported and what the checks
 * found, and decides each: release, approve or retire. The database refuses
 * anyone who isn't an admin (`admin_review_queue`, migration 0019).
 */
export default function QuestionReviewPage({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRetire, setConfirmRetire] = useState<string | null>(null);
  const [itemError, setItemError] = useState<{ id: string; message: string } | null>(null);
  const [notice, setNotice] = useState('');
  /** Bumped by Refresh / Try again to load the queue again. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    fetchReviewQueue().then(
      (list) => {
        if (live) setItems(list);
      },
      (err) => {
        if (live) setLoadError(errorMessage(err));
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  function reload() {
    setLoadError(null);
    setItems(null);
    setAttempt((n) => n + 1);
  }

  async function decide(item: ReviewItem, decision: ReviewDecision) {
    setBusyId(item.id);
    setItemError(null);
    setConfirmRetire(null);
    try {
      await reviewQuestion(item.id, decision);
      setItems((list) => (list ?? []).filter((i) => i.id !== item.id));
      setNotice(`${DONE[decision]}: "${item.text}"`);
    } catch (err) {
      setItemError({ id: item.id, message: errorMessage(err) });
    } finally {
      setBusyId(null);
    }
  }

  const subtitle =
    items === null ? undefined : items.length === 0 ? 'Nothing waiting — all clear! 🎉' : `${plural(items.length, 'question', 'questions')} waiting`;

  return (
    <FamilyCard wide title="🛡️ Question review" subtitle={subtitle}>
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
        </ul>
        <p className="mt-2 text-xs text-gray-500">
          The family who reported a question never sees it again, whatever you decide. A new report brings it back
          here.
        </p>
      </details>

      <p role="status" className="sr-only">
        {notice}
      </p>
      {notice && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}

      {loadError && (
        <div className="text-center">
          <p className="text-red-600 text-sm">{loadError}</p>
          <button onClick={reload} className="mt-3 text-sm text-purple-600 hover:underline min-h-11 px-3">
            Try again
          </button>
        </div>
      )}
      {!loadError && items === null && <p className="text-center text-gray-500 text-sm">Loading…</p>}

      {items && items.length > 0 && (
        <ul className="space-y-3" aria-label="Questions waiting for review">
          {items.map((item) => {
            const held = item.status === 'review';
            const busy = busyId === item.id;
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
                {confirmRetire === item.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-gray-700">Retire it for good?</span>
                    <button
                      onClick={() => void decide(item, 'retired')}
                      disabled={busy}
                      className="min-h-11 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
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
                      onClick={() => void decide(item, 'active')}
                      disabled={busy}
                      className="min-h-11 rounded-lg bg-purple-600 px-3 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                      ✅ Release
                    </button>
                    <button
                      onClick={() => void decide(item, 'approved')}
                      disabled={busy}
                      className="min-h-11 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      ⭐ Approve
                    </button>
                    <button
                      onClick={() => setConfirmRetire(item.id)}
                      disabled={busy}
                      className="min-h-11 rounded-lg border border-red-300 px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      🗑️ Retire
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={onBack}
          className="flex-1 rounded-lg bg-purple-600 py-2 font-semibold text-white transition hover:bg-purple-700"
        >
          ← Back to Grown-ups
        </button>
        <button onClick={reload} className="min-h-11 px-3 text-sm text-purple-600 hover:underline">
          Refresh
        </button>
      </div>
    </FamilyCard>
  );
}
