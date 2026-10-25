import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useLiveMessage } from '../auth/useLiveMessage';
import { errorMessage } from '../../lib/errors';
import { reviewTrouble, type QuestionFix } from '../../lib/review';
import { asGrownUp } from '../../store/grownUpsStore';

/** The sibling forms' field look (KidForm): 16px text, so iOS doesn't zoom on a tap. */
const fieldClass = 'w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400';

/**
 * ✏️ Fix (migration 0028): the owner corrects a question — its words, its
 * four answers, which one is right and the explanation — from 🛡️ Question
 * review or 📚 Browse. Saving approves it. The same checks the game runs on
 * a saved question run before it's sent (`fixQuestion`), so a fix the game
 * would never serve is refused here, in words. It opens with the question's
 * words focused; Cancel waits while a save is on its way.
 */
export default function QuestionFixForm({
  initial,
  onSave,
  onCancel,
  onPendingChange,
}: {
  initial: QuestionFix;
  /** Saves the fix (through `fixQuestion`); throws to say why not. */
  onSave: (fix: QuestionFix) => Promise<void>;
  onCancel: () => void;
  /** Whether it holds changes not saved yet, or is saving: the page asks before anything would drop them. */
  onPendingChange?: (pending: boolean) => void;
}) {
  const [text, setText] = useState(initial.text);
  const [options, setOptions] = useState(() => [...initial.options]);
  const [correctIndex, setCorrectIndex] = useState(initial.correctIndex);
  const [explanation, setExplanation] = useState(initial.explanation ?? '');
  const [saving, setSaving] = useState(false);
  // Read out again when the same refusal repeats (an always-there region).
  const [trouble, setTrouble] = useLiveMessage();
  const id = useId();
  const first = useRef<HTMLTextAreaElement>(null);
  const live = useRef(true);

  const changed =
    text !== initial.text ||
    correctIndex !== initial.correctIndex ||
    explanation !== (initial.explanation ?? '') ||
    options.some((o, i) => o !== initial.options[i]);
  const pending = changed || saving;

  useEffect(() => {
    first.current?.focus();
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // The latest callback, so a parent's inline arrow doesn't re-run the effects below.
  const tell = useRef(onPendingChange);
  useEffect(() => {
    tell.current = onPendingChange;
  });
  useEffect(() => {
    tell.current?.(pending);
  }, [pending]);
  // Gone: nothing of it is pending any more.
  useEffect(() => () => tell.current?.(false), []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setTrouble(null);
    try {
      // A grown-up action (#167): if 👪 Grown-ups locked meanwhile, the gate is asked for and it saves after.
      await asGrownUp(() => onSave({ text, options, correctIndex, explanation: explanation.trim() ? explanation : null }));
    } catch (err) {
      console.warn('Saving a question fix failed:', errorMessage(err));
      if (!live.current) return;
      setTrouble(reviewTrouble(err, "Couldn't save the fix just now. Please try again."));
      setSaving(false);
    }
  }

  const troubleId = `${id}-trouble`;
  const describedBy = trouble ? troubleId : undefined;

  return (
    <form onSubmit={(e) => void save(e)} className="mt-3 space-y-3 rounded-xl bg-purple-50 p-3" aria-label="Fix this question">
      <div>
        <label htmlFor={`${id}-text`} className="block text-xs font-semibold text-gray-700">
          Question
        </label>
        <textarea
          ref={first}
          id={`${id}-text`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={220}
          aria-describedby={describedBy}
          className={`mt-1 ${fieldClass}`}
        />
      </div>
      <fieldset aria-describedby={describedBy}>
        <legend className="text-xs font-semibold text-gray-700">Answers — tick the right one</legend>
        <div className="mt-1 space-y-1">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-1">
              <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-green-50">
                <input
                  type="radio"
                  name={`${id}-right`}
                  checked={correctIndex === i}
                  onChange={() => setCorrectIndex(i)}
                  className="h-5 w-5 accent-green-600"
                  aria-label={`Right answer: ${o.trim() || `answer ${i + 1}`}`}
                />
              </label>
              <input
                value={o}
                onChange={(e) => setOptions((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
                maxLength={80}
                aria-label={`Answer ${i + 1}`}
                className={
                  correctIndex === i
                    ? `min-w-0 flex-1 ${fieldClass} border-2 border-green-500 font-semibold text-green-800`
                    : `min-w-0 flex-1 ${fieldClass} border-gray-300`
                }
              />
            </div>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${id}-why`} className="block text-xs font-semibold text-gray-700">
          Explanation (shown after a kid answers)
        </label>
        <textarea
          id={`${id}-why`}
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          rows={2}
          maxLength={280}
          className={`mt-1 ${fieldClass}`}
        />
      </div>
      <div id={troubleId} role="alert" className="text-sm text-red-600">
        {trouble && <p key={trouble.key}>{trouble.text}</p>}
      </div>
      <p className="text-xs text-gray-500">Saving approves it: it goes back in the game, served first.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          aria-disabled={saving || undefined}
          className="min-h-11 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700 aria-disabled:cursor-default aria-disabled:opacity-60"
        >
          {saving ? 'Saving…' : '💾 Save fix'}
        </button>
        <button
          type="button"
          onClick={saving ? undefined : onCancel}
          aria-disabled={saving || undefined}
          className="min-h-11 px-3 text-sm text-gray-500 hover:underline aria-disabled:cursor-default aria-disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
