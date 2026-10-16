import { useState } from 'react';
import { flagQuestion, inQuestionBank, type FlagReason } from '../lib/questions';
import { errorMessage } from '../lib/errors';

interface FlagButtonProps {
  questionId: string;
}

const REASONS: { id: FlagReason; label: string }[] = [
  // First: a question no child should see (B10) — it's held back at once.
  { id: 'not_for_kids', label: 'Not OK for kids' },
  { id: 'wrong_answer', label: 'Wrong answer' },
  { id: 'confusing', label: 'Doesn’t make sense' },
  { id: 'difficulty', label: 'Too hard or too easy' },
];

/**
 * Tiny "report this question" affordance shown alongside the post-answer
 * explanation — on every question screen (B10: `QuestionCard` and the quiz).
 * A reason picker prevents accidental single-tap spam and tells the review
 * queue (migration 0015) what's wrong: "Not OK for kids" holds the question
 * back at once; it's hidden from this family whatever the reason.
 *
 * Nothing at all for a question that isn't in the server's bank — a starter
 * question (B5) or one that failed to cache: a report couldn't reach anyone,
 * so nothing promises "We'll take a look" (#153 review round 1).
 */
export default function FlagButton({ questionId }: FlagButtonProps) {
  const [open, setOpen] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!inQuestionBank(questionId)) return null;

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
    return <span className="text-xs text-gray-500">🚩 Reported — thanks! We'll take a look.</span>;
  }

  return (
    <div className="text-xs text-gray-500">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-[32px] hover:text-gray-700 transition"
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
              className="min-h-[36px] rounded border border-gray-200 px-2.5 py-1.5 hover:border-purple-400 hover:text-purple-600 disabled:opacity-50 transition"
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={submitting}
            className="min-h-[36px] text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-red-500">{error}</p>}
    </div>
  );
}
