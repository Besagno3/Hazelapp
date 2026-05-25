import { useState } from 'react';
import { flagQuestion, type FlagReason } from '../lib/questions';
import { errorMessage } from '../lib/errors';

interface FlagButtonProps {
  questionId: string;
}

const REASONS: { id: FlagReason; label: string }[] = [
  { id: 'wrong_answer', label: 'Wrong answer' },
  { id: 'confusing', label: 'Doesn’t make sense' },
  { id: 'difficulty', label: 'Too hard or too easy' },
];

/**
 * Tiny "report this question" affordance shown alongside the post-answer
 * explanation. A reason picker prevents accidental single-tap spam and gives
 * the eventual review tool a signal for triage.
 */
export default function FlagButton({ questionId }: FlagButtonProps) {
  const [open, setOpen] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(reason: FlagReason) {
    setSubmitting(true);
    setError(null);
    try {
      await flagQuestion(questionId, reason);
      setFlagged(true);
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (flagged) {
    return <span className="text-xs text-gray-400">🚩 Reported — thanks!</span>;
  }

  return (
    <div className="text-xs text-gray-400">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hover:text-gray-600 transition"
        >
          🚩 Report this question
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-gray-500">What’s wrong?</span>
          {REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => submit(r.id)}
              disabled={submitting}
              className="rounded border border-gray-200 px-2 py-1 hover:border-purple-400 hover:text-purple-600 disabled:opacity-50 transition"
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-600 underline disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-red-500">{error}</p>}
    </div>
  );
}
