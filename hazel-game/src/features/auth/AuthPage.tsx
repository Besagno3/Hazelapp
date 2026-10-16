import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import PasswordInput from '../../components/PasswordInput';
import PrivacyNotice from '../family/PrivacyNotice';
import { CONSENT_VERSION, MIN_PASSWORD_LENGTH } from '../../content/family';
import { dropSignupParam, hasSignupParam } from '../../lib/signupLink';
import { cn } from '../../lib/utils';

/** Supabase refused a sign-in because the email link hasn't been tapped yet. */
function notConfirmed(err: { code?: string; message?: string }): boolean {
  return err.code === 'email_not_confirmed' || /email not confirmed/i.test(err.message ?? '');
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // The address a confirmation link went to: "Check your inbox" replaces the form.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const inboxHeading = useRef<HTMLHeadingElement>(null);
  const emailField = useRef<HTMLInputElement>(null);
  const wasSent = useRef(false);

  // ?signup is read once: drop it from the address, so signing out later
  // (or a reload) opens Sign in as usual.
  useEffect(() => dropSignupParam(), []);

  // The form goes away under the focused button, so focus follows: to the
  // inbox heading, and back to the email field on the way out.
  useEffect(() => {
    if (sentTo) inboxHeading.current?.focus();
    else if (wasSent.current) emailField.current?.focus();
    wasSent.current = sentTo !== null;
  }, [sentTo]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (isForgot) {
      setLoading(true);
      // The link returns here; useAuthInit spots the recovery session and App
      // shows ResetPasswordPage. The URL must be in Supabase's redirect list.
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      setLoading(false);
      if (authError) {
        setError(errorMessage(authError));
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
        setError(errorMessage(authError));
        return;
      }
      // No session means email confirmation is required before sign-in.
      if (!data.session) {
        setSentTo(email);
        setIsSignUp(false);
        return;
      }
      // Session present → useAuthInit's listener advances the app.
    } else {
      setLoading(true);
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (authError) {
        setError(
          notConfirmed(authError)
            ? `Please confirm your email first: tap the link we sent to ${email}. Can't find it? Look in your spam or junk folder.`
            : errorMessage(authError),
        );
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
            <button
              type="button"
              onClick={() => setSentTo(null)}
              className="mt-6 w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2.5 transition"
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
                  {error && <p className="text-red-700">{error}</p>}
                  {notice && <p className="text-green-700">{notice}</p>}
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2.5 transition disabled:opacity-50"
                >
                  {loading ? 'Loading…' : isForgot ? 'Send reset link' : isSignUp ? 'Create family account' : 'Sign In'}
                </button>
              </div>
            </form>

            {!isSignUp && (
              <button
                onClick={() => {
                  setIsForgot(!isForgot);
                  setError(null);
                  setNotice(null);
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
