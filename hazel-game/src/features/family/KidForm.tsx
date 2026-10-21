import { useState } from 'react';
import { errorMessage, sessionRanOut } from '../../lib/errors';
import { plainErrorOr } from '../../lib/familyErrors';
import { grownUpsLocked } from '../../lib/grownUpsGate';
import { KidAddedWithoutPin } from '../../store/familyStore';
import { isPin, KID_BIRTH_YEARS, KID_ICONS, MAX_KID_NAME, PIN_LENGTH } from '../../content/family';
import PasswordInput from '../../components/PasswordInput';
import PicturePicker from './PicturePicker';
import SignInAgainButton from './SignInAgainButton';
import type { Kid, KidInput } from '../../types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Why a kid didn't save, in words a grown-up can act on (#130 S6): the
 * database's own refusals (8 players, the PIN's shape, the nickname's length),
 * the connection's trouble, else a plain "didn't save" — never the raw error,
 * which goes to the console.
 */
function kidSaveMessage(err: unknown): string {
  // Added, but the PIN step didn't happen: say so plainly — the player IS on
  // the list now — and the form changes them from here (#167 review round 1).
  if (err instanceof KidAddedWithoutPin) {
    // Why, when it's something to fix (offline, signed out); a "Not now" needs no more words.
    const why = grownUpsLocked(err.pinError) ? '' : plainErrorOr(err.pinError, '');
    return `${err.kid.name ?? 'Your player'} is added, but their PIN didn't save.${why ? ` ${why}` : ''} Enter their PIN again and tap Save to finish.`;
  }
  const raw = errorMessage(err);
  // Said in 👪 Grown-ups, where the Remove buttons are one tap back.
  if (/kid_limit/.test(raw)) return 'A family can have up to 8 players. Tap Cancel, then Remove by a player to make room.';
  if (/pin_format/.test(raw)) return `Their PIN is ${PIN_LENGTH} numbers.`;
  if (/display_name_length/.test(raw)) return `A nickname is 1 to ${MAX_KID_NAME} letters.`;
  return plainErrorOr(err, "That didn't save just now. Please try again.");
}

const fieldClass =
  'w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400';

/**
 * Add or change a kid (#124): a nickname, a birth date (it picks questions
 * that suit their age), the picture on their tile and their 4-digit PIN. A new
 * kid (or one without a PIN yet) needs a PIN; changing one, a blank PIN keeps
 * theirs — and typing it, even the same one, unlocks a PIN the database has
 * locked after too many tries (#124c). `onSubmit` throws with a message to show.
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
  // The save failed because the sign-in ran out: the words ask to sign in again, so the button's here.
  const [signedOut, setSignedOut] = useState(false);
  const [saving, setSaving] = useState(false);
  // An older kid's birth year stays pickable when changing them.
  const years = kid && !KID_BIRTH_YEARS.includes(kid.birthYear) ? [...KID_BIRTH_YEARS, kid.birthYear] : KID_BIRTH_YEARS;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // The button is aria-disabled while it saves: a tap or Enter then stops here.
    if (saving) return;
    setError(null);
    setSignedOut(false);
    const trimmed = name.trim();
    if (!trimmed) return setError('Give them a nickname.');
    if (!month || !year) return setError('Pick their birth month and year.');
    if (!icon) return setError('Pick a picture for their tile.');
    if ((needsPin || pin) && !isPin(pin)) return setError(`Their PIN is ${PIN_LENGTH} numbers.`);
    setSaving(true);
    try {
      await onSubmit({ name: trimmed, icon, pin: pin || undefined, birthYear: Number(year), birthMonth: Number(month) });
    } catch (err) {
      // Plain words on screen, the whole error in the console (#130 S6).
      console.warn('Saving a player failed:', errorMessage(err));
      setError(kidSaveMessage(err));
      setSignedOut(sessionRanOut(err instanceof KidAddedWithoutPin ? err.pinError : err));
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
        <p className="text-xs text-gray-500 mt-1">
          {needsPin
            ? 'They type it to open their adventure — tell them! Keep it different from your own.'
            : 'Locked out after too many tries? Type their PIN here — even the same one — and save to unlock it.'}
        </p>
      </div>
      {/* Always there, so a screen reader hears each message as it appears. */}
      <div role="status" className="text-sm text-red-700">
        {error && <p>{error}</p>}
      </div>
      {signedOut && <SignInAgainButton />}
      <button
        type="submit"
        aria-disabled={saving}
        className="w-full min-h-11 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2 transition aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-purple-600"
      >
        {saving ? 'Saving…' : submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="w-full min-h-11 text-center text-sm text-gray-500 hover:underline">
          Cancel
        </button>
      )}
    </form>
  );
}
