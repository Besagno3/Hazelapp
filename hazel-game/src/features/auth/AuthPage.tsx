import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { authErrorMessage, errorMessage, type AuthErrorContext } from '../../lib/errors';
import PasswordInput from '../../components/PasswordInput';
import PrivacyNotice from '../family/PrivacyNotice';
import { CONSENT_VERSION, MIN_PASSWORD_LENGTH } from '../../content/family';
import { dropSignupParam, hasSignupParam } from '../../lib/signupLink';
import { cn } from '../../lib/utils';
import { useRetryWait, waitWords } from './useRetryWait';
import { useLiveMessage } from './useLiveMessage';
import { dropLinkError, linkErrorFrom } from './linkError';
import { takeAccountClosedNotice } from '../../lib/closeAccount';

/** Supabase refused a sign-in because the email link hasn't been tapped yet. */
function notConfirmed(err: { code?: string; message?: string }): boolean {
  return err.code === 'email_not_confirmed' || /email not confirmed/i.test(err.message ?? '');
}

/**
 * How long "Send the link again" waits after a link goes out (#146): Supabase
 * sends one confirmation email a minute to an address, so a sooner tap would
 * only be refused.
 */
const RESEND_COOLDOWN_S = 60;

/** The friendly words on screen; the whole error in the console, for whoever fixes it (#130 S6). */
function shown(what: string, err: unknown, context?: AuthErrorContext): string {
  console.warn(`${what} failed:`, errorMessage(err));
  return authErrorMessage(err, context);
}

/**
 * Sign in / sign up. An account is a grown-up's (#124): they sign up with
 * their own email and agree to the privacy notice, then add their kids —
 * kids never type an email or a password.
 */
export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  // Opened from the public site's sign-up button (?signup, #146)?
  const [isSignUp, setIsSignUp] = useState(() => hasSignupParam());
  // "Forgot password?" mode: email only, sends a reset link (#88).
  const [isForgot, setIsForgot] = useState(false);
  // An email link that came back with an error (run out, used already) says
  // why, once — the address loses it as the page opens (#159 review round 2).
  const [linkError] = useState(() => linkErrorFrom(window.location));
  // Keyed per message, so the same words said twice are read out twice.
  const [error, setError] = useLiveMessage(linkError ? authErrorMessage(linkError, { where: 'link' }) : null);
  // Just closed the account from 👪 Grown-ups (#124b): say so, once.
  const [notice, setNotice] = useState<string | null>(() => takeAccountClosedNotice());
  const [loading, setLoading] = useState(false);
  // The address a confirmation link went to: "Check your inbox" replaces the form.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const inboxHeading = useRef<HTMLHeadingElement>(null);
  const emailField = useRef<HTMLInputElement>(null);
  const wasSent = useRef(false);
  // "Send the link again" (#146): the wait before asking again can work (a
  // minute after the last link went out — sign-up counts — or what a refusal
  // said), and what the last try said. "Send reset link" counts down a
  // refusal's wait the same way.
  const resendWait = useRetryWait();
  const resetWait = useRetryWait();
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<{ ok: boolean; text: string } | null>(null);
  // Signing in said the email isn't confirmed yet: offer the link again for it.
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const waitLeft = resendWait.left;
  const resetWaiting = isForgot && resetWait.left > 0;

  // ?signup is read once: drop it from the address, so signing out later
  // (or a reload) opens Sign in as usual.
  useEffect(() => dropSignupParam(), []);

  // The link's error is on screen now: off the address, the whole of it in the console.
  useEffect(() => {
    if (!linkError) return;
    console.warn('Email link failed:', errorMessage(linkError));
    dropLinkError();
  }, [linkError]);

  // The form goes away under the focused button, so focus follows: to the
  // inbox heading, and back to the email field on the way out.
  useEffect(() => {
    if (sentTo) inboxHeading.current?.focus();
    else if (wasSent.current) emailField.current?.focus();
    wasSent.current = sentTo !== null;
  }, [sentTo]);

  /** A confirmation link just went out to `to`: start the wait. */
  function linkSent(to: string) {
    resendWait.wait(RESEND_COOLDOWN_S);
    setSentTo(to);
  }

  async function resendLink(to: string) {
    if (resending || waitLeft > 0) return;
    setResending(true);
    setResendNote(null);
    // Like signUp, no redirect: the link goes where the first one did.
    const { error: authError } = await supabase.auth.resend({ type: 'signup', email: to });
    setResending(false);
    if (authError) {
      const text = shown('Sending the link again', authError, { where: 'resend' });
      if (sentTo) setResendNote({ ok: false, text });
      else setError(text);
      // "Please wait 12 seconds": the button counts those down, instead of
      // inviting a tap the server would refuse again.
      resendWait.refused(authError);
      return;
    }
    setError(null);
    setUnconfirmed(null);
    linkSent(to);
    setResendNote({ ok: true, text: `📬 Sent! A new link is on its way to ${to}. It can take a minute or two.` });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // The button is aria-disabled, not disabled (that would drop the
    // keyboard's focus), so a tap or Enter while it waits stops here.
    if (loading || resetWaiting) return;
    setError(null);
    setNotice(null);
    setUnconfirmed(null);

    if (isForgot) {
      setLoading(true);
      // The link returns here; useAuthInit spots the recovery session and App
      // shows ResetPasswordPage. The URL must be in Supabase's redirect list.
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      setLoading(false);
      if (authError) {
        setError(shown('Reset link', authError, { where: 'forgot' }));
        // A refusal's wait counts down on the button, as the resend's does.
        resetWait.refused(authError);
        return;
      }
      // Same message whether or not the account exists (no account probing).
      setNotice('If that email has an account, a reset link is on its way. Check your inbox!');
      setIsForgot(false);
      return;
    }

    if (isSignUp) {
      if (!agreed) {
        setError('Please tick the box to agree as the parent or guardian.');
        return;
      }
      setLoading(true);
      // handle_new_user() (migration 0013) makes the login a grown-up and
      // stamps their consent with this version; their kids come next.
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { consent_version: CONSENT_VERSION } },
      });
      setLoading(false);
      if (authError) {
        setError(shown('Sign-up', authError, { where: 'sign-up', password }));
        return;
      }
      // No session means email confirmation is required before sign-in.
      if (!data.session) {
        setResendNote(null);
        linkSent(email);
        setIsSignUp(false);
        return;
      }
      // Session present → useAuthInit's listener advances the app.
    } else {
      setLoading(true);
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (authError) {
        if (notConfirmed(authError)) {
          setUnconfirmed(email);
          setError(`Please confirm your email first: tap the link we sent to ${email}. Can't find it? Look in your spam or junk folder.`);
        } else {
          setError(shown('Sign-in', authError, { where: 'sign-in' }));
        }
        return;
      }
      // Success → useAuthInit's listener advances the app.
    }
  }

  const fieldClass =
    'w-full border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-400';
  const labelClass = 'block mb-1 text-sm font-medium text-gray-700';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-500">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center text-purple-700 mb-2">Hazel Quest</h1>

        {sentTo ? (
          <div className="text-center">
            <h2 ref={inboxHeading} tabIndex={-1} className="mt-4 text-xl font-bold text-gray-800 focus:outline-none">
              <span aria-hidden>📬 </span>Check your inbox
            </h2>
            <p className="mt-3 text-gray-700">
              We've sent a link to <strong className="break-all">{sentTo}</strong>. Tap it to confirm your account,
              then sign in.
            </p>
            <p className="mt-2 text-sm text-gray-600">Can't find it? Look in your spam or junk folder.</p>
            {/* Signing up again with a confirmed address sends nothing, and says
                nothing (Supabase won't tell who has an account). */}
            <p className="mt-2 text-sm text-gray-600">Already have an account? Go back and sign in, or reset your password.</p>
            <ResendButton waitLeft={waitLeft} busy={resending} onClick={() => void resendLink(sentTo)} className="mt-4" />
            {/* Always there, so a screen reader hears how the resend went. */}
            <div role="status" className="mt-2 empty:mt-0 text-sm">
              {resendNote && <p className={resendNote.ok ? 'text-green-700' : 'text-red-700'}>{resendNote.text}</p>}
            </div>
            <button
              type="button"
              onClick={() => {
                setSentTo(null);
                setResendNote(null);
              }}
              className="mt-4 w-full min-h-[44px] bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2.5 transition"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <p className="text-center text-gray-500 mb-6 text-sm">
              {isSignUp
                ? "Grown-ups: make your family's account. You'll add your kids next."
                : "Learn. Battle. Conquer. A grown-up signs in, then picks who's playing."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="auth-email" className={labelClass}>
                  {isSignUp ? "Grown-up's email" : 'Email'}
                </label>
                <input
                  ref={emailField}
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={fieldClass}
                />
              </div>
              {!isForgot && (
                <div>
                  <label htmlFor="auth-password" className={labelClass}>
                    Password
                  </label>
                  <PasswordInput
                    // A new field (hidden again) when switching sign in ↔ sign up.
                    key={isSignUp ? 'new' : 'current'}
                    id="auth-password"
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    minLength={isSignUp ? MIN_PASSWORD_LENGTH : undefined}
                    aria-describedby={isSignUp ? 'auth-password-hint' : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={fieldClass}
                  />
                  {isSignUp && (
                    <p id="auth-password-hint" className="mt-1 text-xs text-gray-600">
                      At least {MIN_PASSWORD_LENGTH} characters.
                    </p>
                  )}
                </div>
              )}

              {isSignUp && (
                <div className="space-y-3">
                  <PrivacyNotice />
                  <label className="flex items-start gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 accent-purple-600"
                    />
                    <span>I'm the parent or guardian, I'm 18 or older, and I agree to the privacy notice.</span>
                  </label>
                </div>
              )}

              <div>
                {/* Always there, so a screen reader hears each message as it appears. */}
                <div role="status" className="mb-3 empty:mb-0 space-y-1 text-sm">
                  {error && (
                    <p key={error.key} className="text-red-700">
                      {error.text}
                    </p>
                  )}
                  {notice && <p className="text-green-700">{notice}</p>}
                </div>
                {unconfirmed && unconfirmed === email && (
                  <ResendButton waitLeft={waitLeft} busy={resending} onClick={() => void resendLink(unconfirmed)} className="mb-3" />
                )}
                {/* aria-disabled while it works or waits: a disabled button under
                    the keyboard's focus drops it to the page. */}
                <button
                  type="submit"
                  aria-disabled={loading || resetWaiting}
                  aria-label={!loading && resetWaiting ? `Send reset link ${waitWords(resetWait.left).said}` : undefined}
                  className="w-full min-h-[44px] bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2.5 transition aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-purple-600"
                >
                  {loading
                    ? 'Loading…'
                    : isForgot
                      ? resetWaiting
                        ? `Send reset link ${waitWords(resetWait.left).shown}`
                        : 'Send reset link'
                      : isSignUp
                        ? 'Create family account'
                        : 'Sign In'}
                </button>
              </div>
            </form>

            {!isSignUp && (
              <button
                onClick={() => {
                  setIsForgot(!isForgot);
                  setError(null);
                  setNotice(null);
                  setUnconfirmed(null);
                }}
                className="mt-1 w-full py-3 text-center text-sm text-gray-500 hover:underline"
              >
                {isForgot ? 'Back to sign in' : 'Forgot password?'}
              </button>
            )}

            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setIsForgot(false);
                setError(null);
                setNotice(null);
                setUnconfirmed(null);
              }}
              className={cn('w-full py-3 text-center text-sm text-purple-600 hover:underline', isSignUp && 'mt-1')}
            >
              {isSignUp ? 'Already have an account? Sign in' : "New here? Grown-ups sign up"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * "Send the link again", counting down while Supabase would still refuse
 * (#146). `aria-disabled`, not `disabled`, while it waits: a disabled button
 * under the keyboard's focus drops it to the page, and the countdown couldn't
 * be reached to hear how long is left. The wait is read in words ("60s" can
 * be read as "sixties").
 */
function ResendButton({ waitLeft, busy, onClick, className }: { waitLeft: number; busy: boolean; onClick: () => void; className?: string }) {
  const waiting = busy || waitLeft > 0;
  return (
    <button
      type="button"
      onClick={() => {
        if (!waiting) onClick();
      }}
      aria-disabled={waiting}
      aria-label={!busy && waitLeft > 0 ? `Send the link again ${waitWords(waitLeft).said}` : undefined}
      className={cn(
        'w-full min-h-[44px] rounded-lg border-2 border-purple-600 py-2 font-semibold text-purple-700 transition hover:bg-purple-50 aria-disabled:cursor-default aria-disabled:border-gray-300 aria-disabled:text-gray-500 aria-disabled:hover:bg-transparent',
        className,
      )}
    >
      {busy ? 'Sending…' : waitLeft > 0 ? `Send the link again ${waitWords(waitLeft).shown}` : '📨 Send the link again'}
    </button>
  );
}
