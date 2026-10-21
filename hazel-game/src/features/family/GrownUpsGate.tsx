import { useState, type ReactNode } from 'react';
import { passwordCheckClient } from '../../lib/supabase';
import { authErrorMessage, errorMessage } from '../../lib/errors';
import { plainErrorOr } from '../../lib/familyErrors';
import { openGrownUpsWith, signInEmail } from '../../lib/grownUps';
import { GROWN_UP_LOCKED_TEXT, grownUpLockKey } from '../../lib/pinLock';
import { useAuthStore } from '../../store/authStore';
import { useFamilyStore } from '../../store/familyStore';
import { noteGrownUpsOpen } from '../../store/grownUpsStore';
import PasswordInput from '../../components/PasswordInput';
import PinPad from './PinPad';
import ResetLinkButton from './ResetLinkButton';
import { gateLinkClass, gatePrimaryClass } from './familyStyles';

const fieldClass =
  'w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400';

/**
 * The way into 👪 Grown-ups (#124, #167): the grown-up's own PIN if they've set
 * one (`try_parent_pin` — the database limits guesses, #124c, and the right
 * PIN opens 👪 Grown-ups on this sign-in for 15 minutes), or their password.
 * The password is checked on a client that keeps nothing
 * (`passwordCheckClient`), so no fresh-password session is left on the
 * device, and that check's token then opens 👪 Grown-ups on the device's own
 * sign-in (`openGrownUpsWith` → `unlock_grown_ups`). Used by 👪 Grown-ups'
 * own gate and by `RelockDialog` when it locks again mid-action; `frame`
 * puts the controls in that screen's card or dialog with the subtitle for
 * the way in shown now.
 */
export default function GrownUpsGate({
  onUnlock,
  frame,
  back,
  autoFocusPassword = false,
}: {
  onUnlock: () => void;
  frame: (subtitle: string, controls: ReactNode) => ReactNode;
  /** The way out, under the controls ("← Back to Who's playing", "Not now"). */
  back: ReactNode;
  autoFocusPassword?: boolean;
}) {
  const email = useAuthStore((s) => s.user?.email ?? '');
  const hasParentPin = useFamilyStore((s) => s.hasParentPin);
  const checkParentPin = useFamilyStore((s) => s.checkParentPin);
  const pinLocks = useFamilyStore((s) => s.pinLocks);
  const userId = useFamilyStore((s) => s.userId);
  const [usePassword, setUsePassword] = useState(false);
  // The grown-up PIN is locked: the password is the way in now, so it's the main button.
  const [pinResting, setPinResting] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function opened() {
    noteGrownUpsOpen();
    onUnlock();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Open is aria-disabled while it checks: a tap or Enter then stops here.
    if (loading) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    // Signing in again with the same login proves it's the grown-up — on a
    // client that keeps nothing, so the device's own session stays as it was
    // and no fresh-password one is left behind (#124b review round 2).
    const check = passwordCheckClient();
    const { error: authError } = await check.auth.signInWithPassword({ email: await signInEmail(email), password });
    if (authError) {
      setLoading(false);
      // Friendly words on screen, the whole error in the console (#130 S6).
      console.warn('Grown-ups sign-in failed:', errorMessage(authError));
      setError(authErrorMessage(authError, { where: 'gate' }));
      return;
    }
    // That password, typed just now, opens 👪 Grown-ups on this device's sign-in (#167).
    let failed: unknown = null;
    try {
      await openGrownUpsWith(check);
    } catch (err) {
      failed = err ?? new Error('unlock failed');
    }
    // The check's sign-in is signed out at once either way.
    void check.auth.signOut({ scope: 'local' }).catch((err: unknown) => console.warn('Signing out the password check:', errorMessage(err)));
    setLoading(false);
    if (failed) {
      console.warn('Opening 👪 Grown-ups failed:', errorMessage(failed));
      setError(plainErrorOr(failed, "We couldn't open 👪 Grown-ups just now. Please try again."));
      return;
    }
    opened();
  }

  if (hasParentPin && !usePassword) {
    return frame(
      pinResting ? 'Use your password for now.' : 'Type your grown-up PIN.',
      <>
        <PinPad
          onSubmit={async (pin) => {
            const verdict = await checkParentPin(pin);
            if (verdict.ok) opened();
            return verdict;
          }}
          lockKey={grownUpLockKey(userId)}
          lockedText={GROWN_UP_LOCKED_TEXT}
          who="grown-up"
          checkLock={async () => {
            const locks = await pinLocks();
            return locks === null ? null : locks.grownUp;
          }}
          onLockedChange={setPinResting}
        />
        <button
          onClick={() => setUsePassword(true)}
          className={pinResting ? `mt-2 w-full min-h-[44px] ${gatePrimaryClass}` : `${gateLinkClass} text-gray-500`}
        >
          Use my password instead
        </button>
        {back}
      </>,
    );
  }

  return frame(
    `Enter the password for ${email}.`,
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordInput
          placeholder="Password"
          aria-label="Password"
          autoComplete="current-password"
          autoFocus={autoFocusPassword}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className={fieldClass}
        />
        <div>
          {/* Always there, so a screen reader hears each message as it appears. */}
          <div role="status" className="mb-3 empty:mb-0 space-y-1 text-sm">
            {error && <p className="text-red-700">{error}</p>}
            {notice && <p className="text-green-700">{notice}</p>}
          </div>
          <button type="submit" aria-disabled={loading} className={`w-full min-h-[44px] ${gatePrimaryClass}`}>
            {loading ? 'Checking…' : 'Open'}
          </button>
        </div>
      </form>
      <ResetLinkButton
        email={email}
        onStart={() => {
          setError(null);
          setNotice(null);
        }}
        onSent={setNotice}
        onFailed={setError}
        className={`mt-1 ${gateLinkClass} text-gray-500`}
      />
      {hasParentPin && (
        <button onClick={() => setUsePassword(false)} className={`${gateLinkClass} text-gray-500`}>
          Use my grown-up PIN instead
        </button>
      )}
      {back}
    </>,
  );
}
