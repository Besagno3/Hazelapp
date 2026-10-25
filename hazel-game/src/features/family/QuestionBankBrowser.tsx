import { useEffect, useState, type FormEvent } from 'react';
import { ALL_TOPIC_INFO } from '../../content/topics';
import { errorMessage } from '../../lib/errors';
import { BANK_PAGE, browseQuestions, fixQuestion, reviewTrouble, type BankFilter, type BankQuestion } from '../../lib/review';
import { cn } from '../../lib/utils';
import { asGrownUp } from '../../store/grownUpsStore';
import QuestionFixForm from './QuestionFixForm';

const STATUS_WORDS: Record<string, string> = {
  active: 'Live',
  approved: 'Approved',
  review: 'Held back',
  retired: 'Retired',
};
const STATUS_STYLE: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  review: 'bg-red-100 text-red-700',
  retired: 'bg-gray-200 text-gray-600',
};
const LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);

const topicLabel = (id: string) => {
  const t = ALL_TOPIC_INFO.find((x) => x.id === id);
  return t ? `${t.emoji} ${t.label}` : id;
};

/**
 * 📚 Browse (migration 0028): every saved question with its right answer
 * marked, by topic, level, status and words, newest first, so the owner can
 * check answers without waiting for a report — and ✏️ Fix any of them.
 */
export default function QuestionBankBrowser({ onFixed }: { onFixed: (text: string) => void }) {
  const [draft, setDraft] = useState<BankFilter>({});
  const [filter, setFilter] = useState<BankFilter>({});
  const [items, setItems] = useState<BankQuestion[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  /** Bumped by Search / Try again. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    asGrownUp(() => browseQuestions(filter)).then(
      (page) => {
        if (!live) return;
        setItems(page);
        setMore(page.length === BANK_PAGE);
      },
      (err) => {
        console.warn('Loading the question bank failed:', errorMessage(err));
        if (live) setTrouble(reviewTrouble(err, `Couldn't load the questions just now. Tap "Try again".`));
      },
    );
    return () => {
      live = false;
    };
  }, [filter, attempt]);

  /** Load the list again from the top: Search and Try again. */
  function reload(next: BankFilter) {
    setItems(null);
    setTrouble(null);
    setFixing(null);
    setFilter(next);
    setAttempt((n) => n + 1);
  }

  function search(e: FormEvent) {
    e.preventDefault();
    reload({ ...draft });
  }

  async function loadMore() {
    if (loadingMore || !items) return;
    setLoadingMore(true);
    setTrouble(null);
    try {
      const page = await asGrownUp(() => browseQuestions(filter, items.length));
      // A question added meanwhile shifts the pages: skip any already shown.
      setItems((list) => {
        const seen = new Set((list ?? []).map((q) => q.id));
        return [...(list ?? []), ...page.filter((q) => !seen.has(q.id))];
      });
      setMore(page.length === BANK_PAGE);
    } catch (err) {
      console.warn('Loading more questions failed:', errorMessage(err));
      setTrouble(reviewTrouble(err, "Couldn't load more just now. Please try again."));
    } finally {
      setLoadingMore(false);
    }
  }

  const field = 'min-h-11 rounded-lg border border-gray-300 px-2 text-sm';

  return (
    <div>
      <form onSubmit={search} className="mb-4 flex flex-wrap items-end gap-2" aria-label="Find questions">
        <label className="flex flex-col text-xs font-semibold text-gray-700">
          Topic
          <select
            value={draft.topic ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, topic: e.target.value || undefined }))}
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
        <label className="flex flex-col text-xs font-semibold text-gray-700">
          Level
          <select
            value={draft.level ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, level: e.target.value ? Number(e.target.value) : undefined }))}
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
        <label className="flex flex-col text-xs font-semibold text-gray-700">
          Status
          <select
            value={draft.status ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value || undefined }))}
            className={field}
          >
            <option value="">All but retired</option>
            <option value="active">Live</option>
            <option value="approved">Approved</option>
            <option value="review">Held back</option>
            <option value="retired">Retired</option>
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col text-xs font-semibold text-gray-700">
          Words in the question
          <input
            type="search"
            value={draft.search ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
            className={field}
          />
        </label>
        <button type="submit" className="min-h-11 rounded-lg bg-purple-600 px-3 text-sm font-semibold text-white hover:bg-purple-700">
          🔍 Search
        </button>
      </form>

      {trouble && (
        <div className="mb-3 text-center">
          <p className="text-sm text-red-600">{trouble}</p>
          {items === null && (
            <button onClick={() => reload(filter)} className="mt-2 min-h-11 px-3 text-sm text-purple-600 hover:underline">
              Try again
            </button>
          )}
        </div>
      )}
      {!trouble && items === null && <p className="text-center text-sm text-gray-500">Loading…</p>}
      {items && items.length === 0 && <p className="text-center text-sm text-gray-500">No questions match.</p>}

      {items && items.length > 0 && (
        <ul className="space-y-3" aria-label="Saved questions">
          {items.map((q) => (
            <li key={q.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={cn('rounded-full px-2 py-0.5 font-semibold', STATUS_STYLE[q.status] ?? 'bg-gray-100')}>
                  {STATUS_WORDS[q.status] ?? q.status}
                </span>
                <span className="text-gray-500">
                  {topicLabel(q.topic)} · level {q.level}
                  {q.age !== null && ` · age ${q.age}`} · asked {q.timesAsked}×
                  {q.reports > 0 && ` · ${q.reports} ${q.reports === 1 ? 'report' : 'reports'}`}
                </span>
              </div>
              <p className="mt-2 font-semibold text-gray-800">{q.text}</p>
              <ul className="mt-1 text-sm">
                {q.options.map((o, i) => (
                  <li key={i} className={i === q.correctIndex ? 'font-semibold text-green-700' : 'text-gray-600'}>
                    <span aria-hidden>{i === q.correctIndex ? '✓ ' : '• '}</span>
                    {o}
                    {i === q.correctIndex && <span className="sr-only"> (the saved answer)</span>}
                  </li>
                ))}
              </ul>
              {q.explanation && <p className="mt-1 text-xs text-gray-500">Explanation: {q.explanation}</p>}
              {fixing === q.id ? (
                <QuestionFixForm
                  initial={q}
                  onCancel={() => setFixing(null)}
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
                    setFixing(null);
                    onFixed(fix.text.trim());
                  }}
                />
              ) : (
                q.status !== 'retired' && (
                  <button
                    onClick={() => setFixing(q.id)}
                    className="mt-3 min-h-11 rounded-lg border border-purple-300 px-3 text-sm font-semibold text-purple-700 hover:bg-purple-50"
                  >
                    ✏️ Fix
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      {items && more && (
        <button
          onClick={() => void loadMore()}
          aria-disabled={loadingMore || undefined}
          className="mt-3 min-h-11 w-full rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 aria-disabled:cursor-default aria-disabled:opacity-60"
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
