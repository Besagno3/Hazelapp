import { useId, useState } from 'react';
import { errorMessage } from '../../lib/errors';
import { CloseAccountFailure, closeAccountMessage, CONFIRM_WORD, confirmTyped } from '../../lib/closeAccount';
import { useAuthStore } from '../../store/authStore';
import { useFamilyStore } from '../../store/familyStore';
import PasswordInput from '../../components/PasswordInput';
import { useLiveMessage } from '../auth/useLiveMessage';
import FamilyCard from './FamilyCard';

const fieldClass =
  'w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400';

/** "Sam", "Sam and Kit", "Sam, Kit and Ada". */
function andList(items: string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The last section of 👪 Grown-ups (#124b): closing the whole account. Folded
 * to one line and a button, so it's never in the way; the button opens
 * `CloseAccountPage`.
 */
export function CloseAccountSection({ onOpen }: { onOpen: () => void }) {
  return (
    <section aria-labelledby="close-account-heading" className="mt-8 border-t border-gray-200 pt-4 text-sm">
      <h2 id="close-account-heading" className="font-semibold text-gray-700">
        Close account
      </h2>
      <p className="mt-0.5 text-xs text-gray-600">
        Delete this account, every player on it and all their games, for good.
      </p>
      <button onClick={onOpen} className="mt-1 min-h-11 px-0 text-red-700 hover:underline">
        Close account…
      </button>
    </section>
  );
}

/**
 * Close your account? (#124b): says exactly what goes, asks for the account's
 * password (the 4-digit grown-up PIN isn't enough — a kid may know it) and the
 * word DELETE, then asks the server, which checks both again
 * (`delete-account`). On success the grown-up is signed out and the sign-in
 * page says "Your account and all its data are gone."
 */
export default function CloseAccountPage({ onCancel }: { onCancel: () => void }) {
  const email = useAuthStore((s) => s.user?.email ?? '');
  const kids = useFamilyStore((s) => s.kids);
  const closeAccount = useFamilyStore((s) => s.closeAccount);
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  // Keyed, so the same words said twice are read out twice.
  const [error, setError] = useLiveMessage();
  const passwordId = useId();
  const confirmId = useId();
  const names = kids.map((k) => k.name ?? 'Player');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // The button is aria-disabled, not disabled, while it works: a tap or Enter stops here.
    if (busy) return;
    if (!password) return setError(closeAccountMessage('password_required'));
    if (!confirmTyped(typed)) return setError(closeAccountMessage('confirm_required'));
    setError(null);
    setBusy(true);
    try {
      await closeAccount(password);
      // Signed out: the app moves to the sign-in page, which says the account is gone.
    } catch (err) {
      // Plain words on screen, the whole story in the console (#130 S6).
      if (err instanceof CloseAccountFailure) {
        console.warn('Closing the account failed:', err.log);
        setError(err.message);
      } else {
        console.warn('Closing the account failed:', errorMessage(err));
        setError(closeAccountMessage('unknown'));
      }
      setBusy(false);
    }
  }

  return (
    <FamilyCard wide title="Close your account?">
      <div className="space-y-3 text-sm text-gray-700">
        <p className="font-semibold">This deletes, for good:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Your login{email && (
              <>
                {' '}— <span className="break-all">{email}</span> —
              </>
            )}{' '}
            and its password.
          </li>
          <li>
            {names.length > 0
              ? `Every player on it — ${andList(names)} — with their adventures, levels, XP, coins, items and saved games.`
              : 'Every player on it, with their adventures and saved games.'}
          </li>
          <li>Their PINs and your grown-up PIN.</li>
          <li>The questions they've seen and any questions they reported.</li>
          <li>Your agreement to the privacy notice.</li>
        </ul>
        <p className="text-gray-600">
          We keep only a count of today's new questions, with no name or account on it, for one day, so the game's
          daily question limit still works. Games saved on this device are removed too.
        </p>
        <p className="font-semibold text-red-700">This can't be undone.</p>
      </div>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-left">
        <div>
          <label htmlFor={passwordId} className="mb-1 block text-xs text-gray-600">
            Your password (not your grown-up PIN)
          </label>
          <PasswordInput
            id={passwordId}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor={confirmId} className="mb-1 block text-xs text-gray-600">
            Type {CONFIRM_WORD} to confirm
          </label>
          <input
            id={confirmId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className={fieldClass}
          />
        </div>
        {/* Always there, so a screen reader hears each message as it appears. */}
        <div role="status" className="text-sm">
          {error && (
            <p key={error.key} className="text-red-700">
              {error.text}
            </p>
          )}
        </div>
        <button
          type="submit"
          aria-disabled={busy}
          className="w-full min-h-11 rounded-lg bg-red-600 py-2 font-semibold text-white transition hover:bg-red-700 aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-red-600"
        >
          {busy ? 'Closing your account…' : 'Close account for good'}
        </button>
      </form>
      <button
        onClick={() => {
          if (!busy) onCancel();
        }}
        aria-disabled={busy}
        className="mt-2 w-full min-h-11 text-center text-sm text-purple-600 hover:underline aria-disabled:cursor-default aria-disabled:no-underline"
      >
        Keep my account
      </button>
    </FamilyCard>
  );
}
