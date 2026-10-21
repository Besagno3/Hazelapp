import { useEffect, useId, useRef, useState } from 'react';
import { authErrorMessage, errorMessage, sessionRanOut, type AuthWhere } from '../../lib/errors';
import {
  changePassword,
  checkCurrentPassword,
  currentPasswordRefused,
  currentPasswordWrong,
  looksLikeEmail,
  needsReauthCode,
  pendingEmailLine,
  requestEmailChange,
  sendReauthCode,
} from '../../lib/accountChange';
import { dropPasswordChange, signInEmail } from '../../lib/grownUps';
import { DEVICE_SIGNED_OUT_MESSAGE, passwordWaitMessage, unlockRefusal } from '../../lib/grownUpsGate';
import { noteGrownUpsOpen } from '../../store/grownUpsStore';
import { MIN_PASSWORD_LENGTH } from '../../content/family';
import { useAuthStore } from '../../store/authStore';
import PasswordInput from '../../components/PasswordInput';
import { useLiveMessage } from '../auth/useLiveMessage';
import { useRetryWait, waitWords } from '../auth/useRetryWait';
import FamilyCard from './FamilyCard';
import ResetLinkButton from './ResetLinkButton';
import SignInAgainButton from './SignInAgainButton';
import { familyFieldClass as fieldClass, familyLabelClass as labelClass, gatePrimaryClass } from './familyStyles';

const linkButton = 'mt-2 w-full min-h-11 text-center text-sm text-purple-600 hover:underline aria-disabled:cursor-default aria-disabled:no-underline aria-disabled:opacity-50';

/**
 * "Your sign-in" in 👪 Grown-ups (#124d): the email this login signs in
 * with, a change waiting for its link to be tapped, and the ways to change
 * the email or the password. Each button is where the list puts focus back
 * when its page is left (`data-return`).
 */
export function SignInSection({ onChange }: { onChange: (what: 'email' | 'password') => void }) {
  const email = useAuthStore((s) => s.user?.email ?? '');
  const pending = useAuthStore((s) => s.user?.new_email ?? '');
  const sentAt = useAuthStore((s) => s.user?.email_change_sent_at);
  const waiting = pendingEmailLine(email, pending, sentAt);
  return (
    <section aria-labelledby="sign-in-heading" className="mt-6 rounded-xl border border-gray-200 p-3 text-sm">
      <h2 id="sign-in-heading" className="font-semibold text-gray-700">
        Your sign-in
      </h2>
      <p className="mt-0.5 text-xs text-gray-500 [overflow-wrap:anywhere]">{email || 'No email on this login'}</p>
      {waiting && (
        <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900 [overflow-wrap:anywhere]">
          <span aria-hidden="true">📬 </span>
          {waiting}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-x-2">
        <button data-return="email" onClick={() => onChange('email')} className="min-h-11 px-2 text-purple-600 hover:underline">
          Change email…
        </button>
        <button data-return="password" onClick={() => onChange('password')} className="min-h-11 px-2 text-purple-600 hover:underline">
          Change password…
        </button>
      </div>
    </section>
  );
}

type LiveLine = { text: string; key: number } | null;

/**
 * The status line every form here keeps: always there, so a screen reader
 * hears each message as it appears. `caution` is calm news, not a mistake
 * (the 24-hour password wait, #167 review round 2): amber, not red.
 */
function Status({ id, error, notice, caution = null }: { id: string; error: LiveLine; notice: LiveLine; caution?: LiveLine }) {
  const cautionLine = useRef<HTMLParagraphElement>(null);
  const cautionKey = caution?.key;
  // The wait's note lands over the button, often below a phone's fold: it comes into view (#167 review round 2).
  useEffect(() => {
    if (cautionKey !== undefined) cautionLine.current?.scrollIntoView?.({ block: 'nearest' });
  }, [cautionKey]);
  return (
    <div id={id} role="status" className="text-sm">
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
  );
}

/** The current password box with the gate's reset link under it (a grown-up who only uses the PIN). */
function CurrentPassword({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  inputRef,
  email,
  onResetStart,
  onResetSent,
  onResetFailed,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
  describedBy?: string;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  email: string;
  onResetStart: () => void;
  onResetSent: (words: string) => void;
  onResetFailed: (words: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        Your password now (not your grown-up PIN)
      </label>
      <PasswordInput
        inputRef={inputRef}
        id={id}
        autoComplete="current-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        aria-describedby={invalid ? describedBy : undefined}
        className={fieldClass}
      />
      {email && (
        <ResetLinkButton email={email} onStart={onResetStart} onSent={onResetSent} onFailed={onResetFailed} className="text-purple-600" />
      )}
    </div>
  );
}

/**
 * Change the login's email (#124d): the new address and the current
 * password. The password is checked on the throwaway client (which also
 * opens 👪 Grown-ups for the window again); then Supabase is asked for the
 * change on this device's own sign-in and emails the confirmation link(s).
 * The page then says exactly what happens next: tap the link in each email
 * that comes (the new address, and the current one too when the project
 * asks both to confirm), the old email works until then, and devices
 * already signed in stay signed in.
 */
export function ChangeEmailPage({ onDone }: { onDone: () => void }) {
  const email = useAuthStore((s) => s.user?.email ?? '');
  const [next, setNext] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<{ to: string; from: string } | null>(null);
  const [error, setError] = useLiveMessage();
  const [notice, setNotice] = useLiveMessage();
  const [bad, setBad] = useState<'email' | 'password' | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const wait = useRetryWait();
  const emailId = useId();
  const passwordId = useId();
  const statusId = useId();
  const emailBox = useRef<HTMLInputElement>(null);
  const passwordBox = useRef<HTMLInputElement | null>(null);

  function refuse(text: string, field: 'email' | 'password' | null) {
    setNotice(null);
    setError(text);
    setBad(field);
    if (field === 'email') emailBox.current?.focus();
    if (field === 'password') {
      passwordBox.current?.focus();
      passwordBox.current?.select();
    }
  }

  /** A refusal from Supabase, in words for this page (logged whole). */
  function refused(what: string, err: unknown, where: AuthWhere, field: 'email' | 'password' | null) {
    console.warn(`${what} failed:`, errorMessage(err));
    refuse(authErrorMessage(err, { where }), field);
    setSignedOut(sessionRanOut(err));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // aria-disabled while it works (or a rate limit's wait runs): a tap or Enter stops here.
    if (busy || wait.left > 0) return;
    setSignedOut(false);
    const to = next.trim();
    if (!looksLikeEmail(to)) return refuse("That email address doesn't look right. Check it and try again.", 'email');
    if (to.toLowerCase() === email.toLowerCase()) return refuse("That's the email you sign in with now.", 'email');
    if (!password) return refuse('Enter your password to change your email.', 'password');
    setError(null);
    setNotice(null);
    setBad(null);
    setBusy(true);
    const from = await signInEmail(email);
    const wrong = await checkCurrentPassword(from, password);
    if (wrong) {
      setBusy(false);
      wait.refused(wrong);
      // Only a wrong password is about the box; a lost connection isn't (#167 review round 2).
      return refused('Checking the password', wrong, 'change-email', currentPasswordWrong(wrong) ? 'password' : null);
    }
    // The password typed just now opened 👪 Grown-ups again (its home counts from here).
    noteGrownUpsOpen();
    const failed = await requestEmailChange(to);
    setBusy(false);
    if (failed) {
      wait.refused(failed);
      const aboutEmail = /email/i.test(String((failed as { code?: unknown }).code ?? '')) && !/rate_limit|not_authorized/i.test(String((failed as { code?: unknown }).code ?? ''));
      return refused('Changing the email', failed, 'change-email', aboutEmail ? 'email' : null);
    }
    setPassword('');
    setSentTo({ to, from });
  }

  if (sentTo) {
    return (
      <FamilyCard wide focusTitle title="📬 Check your email">
        <div className="space-y-3 text-sm text-gray-700 [overflow-wrap:anywhere]">
          <p>
            We've sent a confirmation link to <strong>{sentTo.to}</strong>. We may also send one to{' '}
            <strong>{sentTo.from}</strong>, to make sure the change is yours — tap the link in each email you get.
          </p>
          <p>
            Your sign-in email changes once that's done. Until then, keep signing in with <strong>{sentTo.from}</strong>.
          </p>
          <p>Devices already signed in stay signed in. No email after a few minutes? Look in your spam or junk folder.</p>
        </div>
        <button onClick={onDone} className={`mt-5 w-full min-h-11 ${gatePrimaryClass}`}>
          Done
        </button>
      </FamilyCard>
    );
  }

  const waiting = !busy && wait.left > 0;
  return (
    <FamilyCard wide focusTitle title="Change your sign-in email">
      <p className="text-sm text-gray-600 [overflow-wrap:anywhere]">
        You sign in with <strong>{email}</strong>. We'll email a link to the new address, to check it's yours. Type
        your password too, so we know it's you.
      </p>
      {/* Our own checks, in our own words (a browser's bubble would come first). */}
      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-3 text-left">
        <div>
          <label htmlFor={emailId} className={labelClass}>
            New email
          </label>
          <input
            ref={emailBox}
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-invalid={bad === 'email'}
            aria-describedby={bad === 'email' ? statusId : undefined}
            className={fieldClass}
          />
        </div>
        <CurrentPassword
          id={passwordId}
          value={password}
          onChange={setPassword}
          invalid={bad === 'password'}
          describedBy={statusId}
          inputRef={passwordBox}
          email={email}
          onResetStart={() => {
            setError(null);
            setNotice(null);
          }}
          onResetSent={setNotice}
          onResetFailed={setError}
        />
        <Status id={statusId} error={error} notice={notice} />
        {signedOut && <SignInAgainButton />}
        <button
          type="submit"
          aria-disabled={busy || waiting}
          aria-label={waiting ? `Change email ${waitWords(wait.left).said}` : undefined}
          className={`w-full min-h-11 ${gatePrimaryClass}`}
        >
          {busy ? 'Checking…' : waiting ? `Change email ${waitWords(wait.left).shown}` : 'Change email'}
        </button>
      </form>
      <button onClick={() => !busy && onDone()} aria-disabled={busy} className={linkButton}>
        Cancel
      </button>
    </FamilyCard>
  );
}

/**
 * Change the login's password (#124d): the current one, then the new one
 * twice (the sign-up form's rules: `MIN_PASSWORD_LENGTH`, the server's own
 * through `authErrorMessage`). The current password is checked on the
 * throwaway client; the new one is set on this device's own sign-in, which
 * stays signed in while Supabase signs every other session out. When the
 * project wants a code for it ("Secure password change" and a sign-in over a
 * day old), Supabase emails one and the page asks for it.
 */
export function ChangePasswordPage({ onDone }: { onDone: () => void }) {
  const email = useAuthStore((s) => s.user?.email ?? '');
  // An email change waiting for its links: a new password cancels it (the
  // auth service clears its links), so the done page says so.
  const [pendingEmail] = useState(() => {
    const u = useAuthStore.getState().user;
    return u?.new_email && u.new_email.toLowerCase() !== (u.email ?? '').toLowerCase() ? u.new_email : null;
  });
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'code' | 'done'>('form');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useLiveMessage();
  const [notice, setNotice] = useLiveMessage();
  const [caution, setCaution] = useLiveMessage();
  const [bad, setBad] = useState<'current' | 'next' | 'again' | 'code' | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const wait = useRetryWait();
  const codeWait = useRetryWait();
  const currentId = useId();
  const nextId = useId();
  const againId = useId();
  const codeId = useId();
  const statusId = useId();
  const hintId = useId();
  const currentBox = useRef<HTMLInputElement | null>(null);
  const nextBox = useRef<HTMLInputElement | null>(null);
  const againBox = useRef<HTMLInputElement | null>(null);
  const codeBox = useRef<HTMLInputElement>(null);

  function refuse(text: string, field: typeof bad) {
    setNotice(null);
    setCaution(null);
    setError(text);
    setBad(field);
    const box = { current: currentBox.current, next: nextBox.current, again: againBox.current, code: codeBox.current }[field ?? 'current'];
    if (field) {
      box?.focus();
      box?.select();
    }
  }

  function refused(what: string, err: unknown, field: typeof bad) {
    console.warn(`${what} failed:`, errorMessage(err));
    refuse(authErrorMessage(err, { where: 'change-password', password: next }), field);
    setSignedOut(sessionRanOut(err));
  }

  /**
   * The current password checked again on a client of its own, telling the
   * database the change is coming (#167 review rounds 1–2). True when it's
   * right and the change may go ahead; otherwise the page says why: a wrong
   * password (its box — and only then, never for a lost connection), this
   * device signed out ("Sign in again"), or a password changed without a
   * check that can't be changed here for a day (calm, amber, with the way to
   * end it now).
   */
  async function checked(): Promise<boolean> {
    const wrong = await checkCurrentPassword(await signInEmail(email), current, { forPasswordChange: true });
    if (!wrong) {
      noteGrownUpsOpen();
      return true;
    }
    const refusal = unlockRefusal(wrong);
    if (refusal?.kind === 'password_changed') {
      console.warn('Changing the password refused:', errorMessage(wrong));
      setError(null);
      setNotice(null);
      setBad(null);
      setCaution(passwordWaitMessage(refusal.until, { doing: 'change' }));
    } else if (refusal?.kind === 'no_session') {
      console.warn('Changing the password refused:', errorMessage(wrong));
      refuse(DEVICE_SIGNED_OUT_MESSAGE, null);
      setSignedOut(true);
    } else {
      wait.refused(wrong);
      refused('Checking the password', wrong, currentPasswordWrong(wrong) ? 'current' : null);
    }
    return false;
  }

  /** Set the new password; a code wanted first moves to the code step and sends it. */
  async function save(nonce?: string) {
    const failed = await changePassword(next, current, nonce);
    // Not changed: the allowance announced for it goes at once (#167 review
    // round 2) — the code step announces again before it saves.
    if (failed) void dropPasswordChange();
    if (!failed) {
      setCurrent('');
      setNext('');
      setAgain('');
      setCode('');
      setStep('done');
      return;
    }
    if (!nonce && needsReauthCode(failed)) {
      setStep('code');
      setError(null);
      setBad(null);
      await sendCode();
      return;
    }
    wait.refused(failed);
    const weak = /weak_password|same_password/.test(String((failed as { code?: unknown }).code ?? ''));
    refused('Saving the new password', failed, nonce ? 'code' : currentPasswordRefused(failed) ? 'current' : weak ? 'next' : null);
  }

  async function sendCode() {
    if (sending || codeWait.left > 0) return;
    setSending(true);
    const failed = await sendReauthCode();
    setSending(false);
    if (failed) {
      codeWait.refused(failed);
      console.warn('Sending the code failed:', errorMessage(failed));
      setNotice(null);
      setError(authErrorMessage(failed, { where: 'resend' }));
      return;
    }
    codeWait.wait(60);
    setError(null);
    setNotice(`A 6-digit code is on its way to ${email}.`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || wait.left > 0) return;
    setSignedOut(false);
    if (!current) return refuse('Enter the password you have now.', 'current');
    if (next.length < MIN_PASSWORD_LENGTH) return refuse(`Use at least ${MIN_PASSWORD_LENGTH} characters.`, 'next');
    if (next !== again) return refuse("The two new passwords don't match.", 'again');
    if (next === current) return refuse("That's the password you have now. Choose a new one.", 'next');
    setError(null);
    setNotice(null);
    setCaution(null);
    setBad(null);
    setBusy(true);
    if (!(await checked())) {
      setBusy(false);
      return;
    }
    await save();
    setBusy(false);
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setSignedOut(false);
    if (!/^\d{6}$/.test(code.trim())) return refuse('The code is the 6 numbers in the email.', 'code');
    setError(null);
    setNotice(null);
    setCaution(null);
    setBad(null);
    setBusy(true);
    // The emailed code can take a while: the password is checked again so the
    // change is announced just before it's made (the database holds that for
    // ten minutes).
    if (!(await checked())) {
      setBusy(false);
      return;
    }
    await save(code);
    setBusy(false);
  }

  if (step === 'done') {
    return (
      <FamilyCard wide focusTitle title="🔑 Password changed">
        <div className="space-y-3 text-sm text-gray-700">
          <p>Use your new password from now on.</p>
          <p>
            This device stays signed in. Other phones, tablets and computers signed in to this account are signed out
            within about an hour, and need the new password to sign in again.
          </p>
          {pendingEmail && (
            <p className="[overflow-wrap:anywhere]">
              Changing your password cancelled the change of your sign-in email to <strong>{pendingEmail}</strong>. To
              still change it, tap "Change email…" again.
            </p>
          )}
        </div>
        <button onClick={onDone} className={`mt-5 w-full min-h-11 ${gatePrimaryClass}`}>
          Done
        </button>
      </FamilyCard>
    );
  }

  if (step === 'code') {
    const codeWaiting = !sending && codeWait.left > 0;
    return (
      <FamilyCard wide focusTitle title="Enter the code we emailed">
        <p className="text-sm text-gray-600 [overflow-wrap:anywhere]">
          To keep your account safe, we emailed a 6-digit code to <strong>{email}</strong>. Enter it to save your new
          password.
        </p>
        <form onSubmit={handleCode} noValidate className="mt-4 space-y-3 text-left">
          <div>
            <label htmlFor={codeId} className={labelClass}>
              Code from the email
            </label>
            <input
              ref={codeBox}
              id={codeId}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-invalid={bad === 'code'}
              aria-describedby={bad === 'code' ? statusId : undefined}
              className={fieldClass}
            />
          </div>
          <Status id={statusId} error={error} notice={notice} caution={caution} />
          {signedOut && <SignInAgainButton />}
          <button type="submit" aria-disabled={busy} className={`w-full min-h-11 ${gatePrimaryClass}`}>
            {busy ? 'Saving…' : 'Save new password'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => void sendCode()}
          aria-disabled={sending || codeWaiting}
          aria-label={codeWaiting ? `Send a new code ${waitWords(codeWait.left).said}` : undefined}
          className={linkButton}
        >
          {sending ? 'Sending…' : codeWaiting ? `Send a new code ${waitWords(codeWait.left).shown}` : 'Send a new code'}
        </button>
        <button onClick={() => !busy && onDone()} aria-disabled={busy} className="w-full min-h-11 text-center text-sm text-gray-500 hover:underline">
          Cancel — keep my password
        </button>
      </FamilyCard>
    );
  }

  const waiting = !busy && wait.left > 0;
  return (
    <FamilyCard wide focusTitle title="Change your password">
      <p className="text-sm text-gray-600 [overflow-wrap:anywhere]">
        For <strong>{email}</strong>. Type the password you have now, so we know it's you. This device stays signed in;
        other devices will need the new password.
      </p>
      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-3 text-left">
        <CurrentPassword
          id={currentId}
          value={current}
          onChange={setCurrent}
          invalid={bad === 'current'}
          describedBy={statusId}
          inputRef={currentBox}
          email={email}
          onResetStart={() => {
            setError(null);
            setNotice(null);
          }}
          onResetSent={setNotice}
          onResetFailed={setError}
        />
        <div>
          <label htmlFor={nextId} className={labelClass}>
            New password
          </label>
          <PasswordInput
            inputRef={nextBox}
            id={nextId}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-invalid={bad === 'next'}
            aria-describedby={bad === 'next' ? `${hintId} ${statusId}` : hintId}
            className={fieldClass}
          />
          <p id={hintId} className="mt-1 text-xs text-gray-500">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        </div>
        <div>
          <label htmlFor={againId} className={labelClass}>
            New password again
          </label>
          <PasswordInput
            inputRef={againBox}
            id={againId}
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            aria-invalid={bad === 'again'}
            aria-describedby={bad === 'again' ? statusId : undefined}
            className={fieldClass}
          />
        </div>
        <Status id={statusId} error={error} notice={notice} caution={caution} />
        {signedOut && <SignInAgainButton />}
        <button
          type="submit"
          aria-disabled={busy || waiting}
          aria-label={waiting ? `Change password ${waitWords(wait.left).said}` : undefined}
          className={`w-full min-h-11 ${gatePrimaryClass}`}
        >
          {busy ? 'Saving…' : waiting ? `Change password ${waitWords(wait.left).shown}` : 'Change password'}
        </button>
      </form>
      <button onClick={() => !busy && onDone()} aria-disabled={busy} className={linkButton}>
        Cancel
      </button>
    </FamilyCard>
  );
}
