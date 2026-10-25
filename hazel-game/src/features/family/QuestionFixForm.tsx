import { useId, useState, type FormEvent } from 'react';
import { errorMessage } from '../../lib/errors';
import { reviewTrouble, type QuestionFix } from '../../lib/review';
import { asGrownUp } from '../../store/grownUpsStore';

/**
 * ✏️ Fix (migration 0028): the owner corrects a question — its words, its
 * four answers, which one is right and the explanation — from 🛡️ Question
 * review or 📚 Browse. Saving approves it. The same checks the game runs on
 * a saved question run before it's sent (`fixQuestion`), so a fix the game
 * would never serve is refused here, in words.
 */
export default function QuestionFixForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: QuestionFix;
  /** Saves the fix (through `fixQuestion`); throws to say why not. */
  onSave: (fix: QuestionFix) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial.text);
  const [options, setOptions] = useState(() => [...initial.options]);
  const [correctIndex, setCorrectIndex] = useState(initial.correctIndex);
  const [explanation, setExplanation] = useState(initial.explanation ?? '');
  const [saving, setSaving] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const id = useId();

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
      setTrouble(reviewTrouble(err, "Couldn't save the fix just now. Please try again."));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="mt-3 space-y-3 rounded-xl bg-purple-50 p-3" aria-label="Fix this question">
      <div>
        <label htmlFor={`${id}-text`} className="block text-xs font-semibold text-gray-700">
          Question
        </label>
        <textarea
          id={`${id}-text`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={220}
          className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm"
        />
      </div>
      <fieldset>
        <legend className="text-xs font-semibold text-gray-700">Answers — pick the right one</legend>
        <div className="mt-1 space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${id}-right`}
                id={`${id}-right-${i}`}
                checked={correctIndex === i}
                onChange={() => setCorrectIndex(i)}
                className="h-5 w-5 shrink-0 accent-green-600"
                aria-label={`Answer ${i + 1} is the right one`}
              />
              <input
                value={o}
                onChange={(e) => setOptions((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
                maxLength={80}
                aria-label={`Answer ${i + 1}`}
                className={
                  correctIndex === i
                    ? 'min-w-0 flex-1 rounded-lg border-2 border-green-500 p-2 text-sm font-semibold text-green-800'
                    : 'min-w-0 flex-1 rounded-lg border border-gray-300 p-2 text-sm'
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
          className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm"
        />
      </div>
      {trouble && (
        <p role="alert" className="text-sm text-red-600">
          {trouble}
        </p>
      )}
      <p className="text-xs text-gray-500">Saving approves it: it goes back in the game, served first.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          aria-disabled={saving || undefined}
          className="min-h-11 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700 aria-disabled:cursor-default aria-disabled:opacity-60"
        >
          {saving ? 'Saving…' : '💾 Save fix'}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 px-3 text-sm text-gray-500 hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
