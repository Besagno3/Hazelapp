import { useEffect, useState, type ReactNode } from 'react';
import { passwordCheckClient } from '../../lib/supabase';
import { authErrorMessage, errorMessage } from '../../lib/errors';
import { plainErrorOr } from '../../lib/familyErrors';
import { askForPasswordCheck, openGrownUpsWith, signInEmail } from '../../lib/grownUps';
import {
  DEVICE_SIGNED_OUT_WHY,
  DeviceSignedOutError,
  passwordWaitMessage,
  SIGNED_OUT_LEAD,
  unlockRefusal,
  waitLead,
  type GateWay,
} from '../../lib/grownUpsGate';
import { GROWN_UP_LOCKED_TEXT, grownUpLockKey } from '../../lib/pinLock';
import { useAuthStore } from '../../store/authStore';
import { useFamilyStore } from '../../store/familyStore';
import { noteGrownUpsOpen } from '../../store/grownUpsStore';
import PasswordInput from '../../components/PasswordInput';
import PinPad from './PinPad';
import ResetLinkButton from './ResetLinkButton';
import SignInAgainButton from './SignInAgainButton';
import { gateLinkClass, gatePrimaryClass } from './familyStyles';

const fieldClass =
  'w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400';

/** The reset link as the gate's main button (no grown-up PIN while the password waits). */
const resetPrimaryClass = `w-full min-h-[44px] text-base ${gatePrimaryClass} hover:no-underline`;

/** What the reset email leads to, said on the gate once one is on its way (#167 review round 2). */
const RESET_NEXT = 'Choose a new password from it, then enter the new one here.';

/**
 * `line` a beat after it's set (at once when cleared): text a live region
 * gains after it's on the page is read out, text it's born with may not be —
 * the gate's view can change under it (the PIN pad giving way to "Sign in
 * again") as well as in place (#167 review round 2).
 */
function useSaidAfterABeat(line: string | null): string | null {
  const [settled, setSettled] = useState<string | null>(null);
  useEffect(() => {
    if (line === null) return;
    const t = window.setTimeout(() => setSettled(line), 50);
    return () => window.clearTimeout(t);
  }, [line]);
  return line !== null && settled === line ? line : null;
}

/**
 * The way into 👪 Grown-ups (#124, #167): the grown-up's own PIN if they've set
 * one (`try_parent_pin` — the database limits guesses, #124c, and the right
 * PIN opens 👪 Grown-ups on this sign-in for 15 minutes), or their password.
 * The password is checked on a client that keeps nothing
 * (`passwordCheckClient`), so no fresh-password session is left on the
 * device; the device asks the database for that check first
 * (`askForPasswordCheck`), and the check's token then opens 👪 Grown-ups on
 * the device's own sign-in (`openGrownUpsWith` → `unlock_grown_ups`). Used by
 * 👪 Grown-ups' own gate and by `RelockDialog` when it locks again mid-action;
 * `frame` puts the controls in that screen's card or dialog with the subtitle
 * for the way in shown now (and which way that is). On the PIN pad, the other
 * way in and the way out sit in the pad's `beside` slot, so a sideways phone
 * shows them beside the pad (#167 review round 1).
 *
 * When the password can't work, the gate says why and offers only what can
 * (#167 review round 2): this device's sign-in has ended (a password change
 * elsewhere; a right PIN on it says so too) → one "Sign in again"; the
 * password was changed without a check (the 24-hour wait) → the box and
 * "Open" go, a short amber note says until when, and the grown-up PIN — or,
 * with none, "Email me a reset link" — is the main button ("Didn't change
 * it? Reset it now" beside the PIN). Once a reset email is on its way the
 * box comes back for the new password.
 */
export default function GrownUpsGate({
  onUnlock,
  frame,
  back,
  autoFocusPassword = false,
}: {
  onUnlock: () => void;
  frame: (subtitle: string, controls: ReactNode, way: GateWay) => ReactNode;
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
  // This device's sign-in has ended: only signing in again can help.
  const [signedOut, setSignedOut] = useState(false);
  // The password was changed without a check: it can't open 👪 until then.
  const [waiting, setWaiting] = useState<{ until: Date | null } | null>(null);
  // Back from the wait to the box (a reset email on its way): the box takes the keyboard.
  const [backFromWait, setBackFromWait] = useState(false);

  const stateLine = useSaidAfterABeat(
    signedOut ? DEVICE_SIGNED_OUT_WHY : waiting ? passwordWaitMessage(waiting.until, { hasParentPin }) : null,
  );

  function opened() {
    noteGrownUpsOpen();
    onUnlock();
  }

  function resetSent(words: string) {
    setNotice(`${words} ${RESET_NEXT}`);
    if (waiting) {
      // The new password from that email ends the wait: the box is back for it.
      setWaiting(null);
      setBackFromWait(true);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Open is aria-disabled while it checks (and gone while it can't work): a tap or Enter then stops here.
    if (loading || signedOut || waiting) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    // Signing in again with the same login proves it's the grown-up — on a
    // client that keeps nothing, so the device's own session stays as it was
    // and no fresh-password one is left behind (#124b review round 2) — once
    // this device has asked the database for the check (#167 review round 2).
    const session = await askForPasswordCheck();
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
      await openGrownUpsWith(check, session);
    } catch (err) {
      failed = err ?? new Error('unlock failed');
    }
    // The check's sign-in is signed out at once either way (its own client, so
    // a sign-out still on its way never touches the next check's).
    void check.auth.signOut({ scope: 'local' }).catch((err: unknown) => console.warn('Signing out the password check:', errorMessage(err)));
    setLoading(false);
    if (failed) {
      console.warn('Opening 👪 Grown-ups failed:', errorMessage(failed));
      const refusal = unlockRefusal(failed);
      if (refusal?.kind === 'no_session') {
        // This device's sign-in has ended: no password can open it again, only signing in.
        setSignedOut(true);
      } else if (refusal?.kind === 'password_changed') {
        setPassword('');
        setWaiting({ until: refusal.until });
      } else {
        setError(plainErrorOr(failed, "We couldn't open 👪 Grown-ups just now. Please try again."));
      }
      return;
    }
    opened();
  }

  if (hasParentPin && !usePassword && !signedOut) {
    return frame(
      pinResting ? 'Use your password for now.' : 'Type your grown-up PIN.',
      <PinPad
        onSubmit={async (pin) => {
          const verdict = await checkParentPin(pin);
          // Right, but this device's sign-in has ended: nothing opened. The
          // gate says so as the password does, with "Sign in again".
          if (verdict.ok && verdict.signedOut) {
            setSignedOut(true);
            throw new DeviceSignedOutError();
          }
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
        beside={
          <>
            <button
              onClick={() => setUsePassword(true)}
              className={pinResting ? `mt-2 w-full min-h-[44px] ${gatePrimaryClass}` : `${gateLinkClass} text-gray-500`}
            >
              Use my password instead
            </button>
            {back}
          </>
        }
      />,
      pinResting ? 'pin-resting' : 'pin',
    );
  }

  const way: GateWay = signedOut ? 'signed-out' : waiting ? 'password-wait' : 'password';
  const subtitle = signedOut ? SIGNED_OUT_LEAD : waiting ? waitLead(hasParentPin) : `Enter the password for ${email}.`;
  return frame(
    subtitle,
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {way === 'password' && (
          <PasswordInput
            placeholder="Password"
            aria-label="Password"
            autoComplete="current-password"
            autoFocus={autoFocusPassword || backFromWait}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={fieldClass}
          />
        )}
        <div>
          {/* Always there, so a screen reader hears each message as it appears. */}
          <div role="status" className="mb-3 empty:mb-0 space-y-1 text-sm">
            {stateLine && (
              <p
                className={
                  signedOut
                    ? 'text-red-700'
                    : 'rounded-lg bg-amber-50 px-3 py-2 text-amber-900 [overflow-wrap:anywhere]'
                }
              >
                {stateLine}
              </p>
            )}
            {error && <p className="text-red-700">{error}</p>}
            {notice && <p className="text-green-700 [overflow-wrap:anywhere]">{notice}</p>}
          </div>
          {way === 'signed-out' ? (
            <SignInAgainButton key="sign-in" autoFocus className="mt-0" />
          ) : way === 'password-wait' ? (
            hasParentPin ? (
              // Its own key: a new button (the focus lands on it), never "Open" reused.
              <button key="pin" type="button" autoFocus onClick={() => setUsePassword(false)} className={`w-full min-h-[44px] ${gatePrimaryClass}`}>
                Use my grown-up PIN
              </button>
            ) : (
              <ResetLinkButton
                key="reset"
                email={email}
                autoFocus
                label="Email me a reset link"
                onStart={() => {
                  setError(null);
                  setNotice(null);
                }}
                onSent={resetSent}
                onFailed={setError}
                className={resetPrimaryClass}
              />
            )
          ) : (
            <button key="open" type="submit" aria-disabled={loading} className={`w-full min-h-[44px] ${gatePrimaryClass}`}>
              {loading ? 'Checking…' : 'Open'}
            </button>
          )}
        </div>
      </form>
      {way === 'password' || (way === 'password-wait' && hasParentPin) ? (
        <ResetLinkButton
          email={email}
          label={way === 'password-wait' ? "Didn't change it? Reset it now" : undefined}
          onStart={() => {
            setError(null);
            setNotice(null);
          }}
          onSent={resetSent}
          onFailed={setError}
          className={`mt-1 ${gateLinkClass} text-gray-500`}
        />
      ) : null}
      {hasParentPin && way === 'password' && (
        <button onClick={() => setUsePassword(false)} className={`${gateLinkClass} text-gray-500`}>
          Use my grown-up PIN instead
        </button>
      )}
      {back}
    </>,
    way,
  );
}
