import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import PasswordInput from '../../components/PasswordInput';
import PrivacyNotice from '../family/PrivacyNotice';
import { CONSENT_VERSION } from '../../content/family';

/**
 * Sign in / sign up. An account is a grown-up's (#118): they sign up with
 * their own email and agree to the privacy notice, then add their kids —
 * kids never type an email or a password.
 */
export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  // "Forgot password?" mode: email only, sends a reset link (#88).
  const [isForgot, setIsForgot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      // handle_new_user() (migration 0012) makes the login a grown-up and
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
        setNotice('Account created — check your email to confirm it, then sign in.');
        setIsSignUp(false);
        return;
      }
      // Session present → useAuthInit's listener advances the app.
    } else {
      setLoading(true);
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (authError) {
        setError(errorMessage(authError));
        return;
      }
      // Success → useAuthInit's listener advances the app.
    }
  }

  const fieldClass =
    'w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-500">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center text-purple-700 mb-2">Hazel Quest</h1>
        <p className="text-center text-gray-500 mb-6 text-sm">
          {isSignUp
            ? "Grown-ups: make your family's account. You'll add your kids next."
            : "Learn. Battle. Conquer. A grown-up signs in, then picks who's playing."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder={isSignUp ? "Grown-up's email" : 'Email'}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={fieldClass}
          />
          {!isForgot && (
            <PasswordInput
              // A new field (hidden again) when switching sign in ↔ sign up.
              key={isSignUp ? 'new' : 'current'}
              placeholder="Password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={fieldClass}
            />
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

          {error && <p className="text-red-500 text-sm">{error}</p>}
          {notice && <p className="text-green-600 text-sm">{notice}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2 transition disabled:opacity-50"
          >
            {loading ? 'Loading…' : isForgot ? 'Send reset link' : isSignUp ? 'Create family account' : 'Sign In'}
          </button>
        </form>

        {!isSignUp && (
          <button
            onClick={() => {
              setIsForgot(!isForgot);
              setError(null);
              setNotice(null);
            }}
            className="mt-3 w-full text-center text-sm text-gray-500 hover:underline"
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
          className="mt-4 w-full text-center text-sm text-purple-600 hover:underline"
        >
          {isSignUp ? 'Already have an account? Sign in' : "New here? Grown-ups sign up"}
        </button>
      </div>
    </div>
  );
}
