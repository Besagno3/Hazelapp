import { useState } from 'react';
import { errorMessage } from '../../lib/errors';
import { isPin, KID_BIRTH_YEARS, KID_ICONS, MAX_KID_NAME, PIN_LENGTH } from '../../content/family';
import PasswordInput from '../../components/PasswordInput';
import PicturePicker from './PicturePicker';
import type { Kid, KidInput } from '../../types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const fieldClass =
  'w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400';

/**
 * Add or change a kid (#118): a nickname, a birth date (it picks questions
 * that suit their age), the picture on their tile and their 4-digit PIN. A new
 * kid (or one without a PIN yet) needs a PIN; changing one, a blank PIN keeps
 * theirs. `onSubmit` throws with a message to show.
 */
export default function KidForm({
  kid,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  kid?: Kid;
  submitLabel: string;
  onSubmit: (input: KidInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(kid?.name ?? '');
  const [month, setMonth] = useState(kid ? String(kid.birthMonth) : '');
  const [year, setYear] = useState(kid ? String(kid.birthYear) : '');
  const [icon, setIcon] = useState<string | null>(kid?.icon ?? null);
  const [pin, setPin] = useState('');
  const needsPin = !kid?.hasPin;
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // An older kid's birth year stays pickable when changing them.
  const years = kid && !KID_BIRTH_YEARS.includes(kid.birthYear) ? [...KID_BIRTH_YEARS, kid.birthYear] : KID_BIRTH_YEARS;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return setError('Give them a nickname.');
    if (!month || !year) return setError('Pick their birth month and year.');
    if (!icon) return setError('Pick a picture for their tile.');
    if ((needsPin || pin) && !isPin(pin)) return setError(`Their PIN is ${PIN_LENGTH} numbers.`);
    setSaving(true);
    try {
      await onSubmit({ name: trimmed, icon, pin: pin || undefined, birthYear: Number(year), birthMonth: Number(month) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <div>
        <input
          placeholder="Nickname"
          aria-label="Nickname"
          value={name}
          maxLength={MAX_KID_NAME}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          className={fieldClass}
        />
        <p className="text-xs text-gray-400 mt-1">A nickname is all we need — no full names.</p>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Birth date — picks questions that suit their age</label>
        <div className="flex gap-2">
          <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Birth month" className={fieldClass}>
            <option value="">Month</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Birth year" className={fieldClass}>
            <option value="">Year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
      <PicturePicker label="Their picture on “Who’s playing?”" pictures={KID_ICONS} value={icon} onChange={setIcon} />
      <div>
        <PasswordInput
          placeholder={needsPin ? `Their ${PIN_LENGTH}-digit PIN` : 'New PIN (blank keeps theirs)'}
          aria-label="PIN"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_LENGTH}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
          className={fieldClass}
        />
        <p className="text-xs text-gray-400 mt-1">
          They type it to open their adventure — tell them! Keep it different from your own.
        </p>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2 transition disabled:opacity-50"
      >
        {saving ? 'Saving…' : submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="w-full text-center text-sm text-gray-500 hover:underline">
          Cancel
        </button>
      )}
    </form>
  );
}
