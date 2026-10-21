import { useEffect, useId, useRef, useState } from 'react';
import { errorMessage } from '../../lib/errors';
import { CloseAccountFailure, closeAccountMessage, CONFIRM_WORD, confirmTyped, type CloseFailureCode } from '../../lib/closeAccount';
import { useAuthStore } from '../../store/authStore';
import { useFamilyStore } from '../../store/familyStore';
import PasswordInput from '../../components/PasswordInput';
import { useLiveMessage } from '../auth/useLiveMessage';
import FamilyCard from './FamilyCard';
import ResetLinkButton from './ResetLinkButton';
import SignInAgainButton from './SignInAgainButton';

const fieldClass =
  'w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 aria-[invalid=true]:border-red-500';
/** The same labels as sign-in's: the most serious form in the app isn't the hardest to read. */
const labelClass = 'mb-1 block text-sm font-medium text-gray-700';

/** "Sam", "Sam and Kit", "Sam, Kit and Ada". */
function andList(items: string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The last section of 👪 Grown-ups (#124b): closing the whole account. Folded
 * to one line and a button, so it's never in the way; the button opens
 * `CloseAccountPage`. Back from "Keep my account", the list puts focus back
 * on it (`data-return`), that once.
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
      <button data-return="close" onClick={onOpen} className="mt-1 min-h-11 px-0 text-red-700 hover:underline">
        Close account…
      </button>
    </section>
  );
}

/**
 * Close your account? (#124b): says exactly what goes, asks for the account's
 * password (the 4-digit grown-up PIN isn't enough — a kid may know it) and the
 * word DELETE, then signs in again with the password and asks the server,
 * which checks the word and the fresh sign-in (`delete-account`). It opens at
 * the top with its title focused, so the list of what goes is read first; a
 * refusal about a box marks that box and puts the keyboard back in it. A
 * grown-up who only uses the PIN gets the gate's reset link under the
 * password box. On success the grown-up is signed out and the sign-in page
 * says "Your account and all its data are gone."
 */

/** Which box a refusal is about, so it's marked and focused. */
function fieldFor(code: CloseFailureCode): 'password' | 'confirm' | null {
  if (code === 'password_required' || code === 'wrong_password') return 'password';
  if (code === 'confirm_required') return 'confirm';
  return null;
}
export default function CloseAccountPage({ onCancel }: { onCancel: () => void }) {
  const email = useAuthStore((s) => s.user?.email ?? '');
  const kids = useFamilyStore((s) => s.kids);
  const userId = useFamilyStore((s) => s.userId);
  const closeAccount = useFamilyStore((s) => s.closeAccount);
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  // Keyed, so the same words said twice are read out twice.
  const [error, setError] = useLiveMessage();
  // A reset link on its way (said in green where the refusals go).
  const [notice, setNotice] = useLiveMessage();
  // The 24-hour password wait (#167 review round 2): calm news, amber, not an error.
  const [caution, setCaution] = useLiveMessage();
  // The family's data went though the login stayed (`login_not_deleted`):
  // the server has no players and no consent now, so leaving reloads the
  // family — the privacy notice comes first again (#124b review round 2).
  const familyGone = useRef(false);
  // The box the last refusal was about (marked aria-invalid, described by the message).
  const [badField, setBadField] = useState<'password' | 'confirm' | null>(null);
  // This device's sign-in has ended (#167 review round 1): the words ask to sign in again, so the button's here.
  const [signedOut, setSignedOut] = useState(false);
  const passwordId = useId();
  const confirmId = useId();
  const statusId = useId();
  const passwordBox = useRef<HTMLInputElement | null>(null);
  const confirmBox = useRef<HTMLInputElement>(null);
  const names = kids.map((k) => k.name ?? 'Player');
  const cautionLine = useRef<HTMLParagraphElement>(null);
  const cautionKey = caution?.key;
  // The wait's note lands over the button, often below a phone's fold: it comes into view (#167 review round 2).
  useEffect(() => {
    if (cautionKey !== undefined) cautionLine.current?.scrollIntoView?.({ block: 'nearest' });
  }, [cautionKey]);

  function refuse(code: CloseFailureCode, text = closeAccountMessage(code)) {
    setNotice(null);
    setError(code === 'password_changed' ? null : text);
    setCaution(code === 'password_changed' ? text : null);
    setSignedOut(code === 'device_signed_out');
    const field = fieldFor(code);
    setBadField(field);
    const box = field === 'password' ? passwordBox.current : field === 'confirm' ? confirmBox.current : null;
    box?.focus();
    if (code === 'wrong_password') box?.select();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // The button is aria-disabled, not disabled, while it works: a tap or Enter stops here.
    if (busy) return;
    if (!password) return refuse('password_required');
    if (!confirmTyped(typed)) return refuse('confirm_required');
    setError(null);
    setNotice(null);
    setCaution(null);
    setBadField(null);
    setBusy(true);
    try {
      await closeAccount(password);
      // Signed out: the app moves to the sign-in page, which says the account is gone.
    } catch (err) {
      setBusy(false);
      // Plain words on screen, the whole story in the console (#130 S6).
      if (err instanceof CloseAccountFailure) {
        console.warn('Closing the account failed:', err.log);
        if (err.code === 'login_not_deleted') familyGone.current = true;
        refuse(err.code, err.message);
      } else {
        console.warn('Closing the account failed:', errorMessage(err));
        refuse('outcome_unknown');
      }
    }
  }

  return (
    <FamilyCard wide focusTitle title="Close your account?">
      <div className="space-y-3 text-sm text-gray-700">
        <p className="font-semibold">This deletes, for good:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Your login{email && (
              <>
                {' '}— <span className="[overflow-wrap:anywhere]">{email}</span> —
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
          <label htmlFor={passwordId} className={labelClass}>
            Your password (not your grown-up PIN)
          </label>
          <PasswordInput
            inputRef={passwordBox}
            id={passwordId}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={badField === 'password'}
            aria-describedby={badField === 'password' ? statusId : undefined}
            className={fieldClass}
          />
          {email && (
            <ResetLinkButton
              email={email}
              onStart={() => {
                setError(null);
                setNotice(null);
              }}
              onSent={setNotice}
              onFailed={setError}
              className="text-purple-600"
            />
          )}
        </div>
        <div>
          <label htmlFor={confirmId} className={labelClass}>
            Type {CONFIRM_WORD} to confirm
          </label>
          <input
            ref={confirmBox}
            id={confirmId}
            aria-invalid={badField === 'confirm'}
            aria-describedby={badField === 'confirm' ? statusId : undefined}
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
        <div id={statusId} role="status" className="text-sm">
          {caution && (
            <p ref={cautionLine} key={caution.key} className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 [overflow-wrap:anywhere]">
              {caution.text}
            </p>
          )}
          {error && (
            <p key={error.key} className="text-red-700">
              {error.text}
            </p>
          )}
          {notice && (
            <p key={notice.key} className="text-green-700">
              {notice.text}
            </p>
          )}
        </div>
        {signedOut && <SignInAgainButton className="mt-0" />}
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
          if (busy) return;
          if (familyGone.current && userId) {
            void useFamilyStore.getState().load(userId);
            return;
          }
          onCancel();
        }}
        aria-disabled={busy}
        className="mt-2 w-full min-h-11 text-center text-sm text-purple-600 hover:underline aria-disabled:cursor-default aria-disabled:no-underline aria-disabled:opacity-50"
      >
        Keep my account
      </button>
    </FamilyCard>
  );
}
