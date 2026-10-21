import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { authErrorMessage, errorMessage, isExpiredLink } from '../../lib/errors';
import { allowPasswordChange } from '../../lib/grownUps';
import { useAuthStore } from '../../store/authStore';
import PasswordInput from '../../components/PasswordInput';
import { MIN_PASSWORD_LENGTH } from '../../content/family';
import { useLiveMessage } from './useLiveMessage';

/**
 * Shown after a password-reset email link signs the user in with a temporary
 * recovery session (#88). They must pick a new password before the game
 * continues; "Cancel" signs them out instead. Once the link has run out,
 * saving can't work: the fields and "Save new password" go, and "Back to
 * sign in" (the same sign-out) is the big button, as its message says.
 * Before saving, the database is told a change is coming from this reset
 * link (`allow_password_change`): a password changed any other way can't
 * open 👪 Grown-ups for a day, and a reset link's change ends that wait —
 * how a grown-up takes their login back (#167 review round 1).
 */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // Keyed per message, so the same words said twice are read out twice.
  const [error, setError] = useLiveMessage();
  const [loading, setLoading] = useState(false);
  // The link's recovery session has run out: the way on is a new link.
  const [expired, setExpired] = useState(false);
  const back = useRef<HTMLButtonElement>(null);

  // Save goes away under the keyboard's focus: focus follows to the way on.
  useEffect(() => {
    if (expired) back.current?.focus();
  }, [expired]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // aria-disabled, not disabled (that drops the keyboard's focus): a tap or Enter while it saves stops here.
    if (loading || expired) return;
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    // Best effort: without it the new password still saves, but waits a day
    // before it can open 👪 Grown-ups (the grown-up PIN still can).
    const notAllowed = await allowPasswordChange(supabase);
    if (notAllowed) console.warn('Telling the database a password change is coming failed:', errorMessage(notAllowed));
    const { error: authError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (authError) {
      // Friendly words on screen, the whole error in the console (#130 S6).
      console.warn('Saving the new password failed:', errorMessage(authError));
      setError(authErrorMessage(authError, { where: 'reset', password }));
      setExpired(isExpiredLink(authError, { where: 'reset' }));
      return;
    }
    // Drop the recovery token from the address bar so a refresh can't replay it.
    window.history.replaceState(null, '', window.location.pathname);
    useAuthStore.getState().setPasswordRecovery(false);
  }

  const fieldClass =
    'w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400';
  const primary =
    'w-full min-h-[44px] bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2 transition aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-purple-600';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-500">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-purple-700 mb-2">Choose a new password</h1>
        <p className="text-center text-gray-500 mb-6 text-sm">Then it's straight back to your adventure.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!expired && (
            <>
              <PasswordInput
                placeholder="New password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={fieldClass}
              />
              <PasswordInput
                placeholder="Type it again"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className={fieldClass}
              />
            </>
          )}
          <div>
            {/* Always there, so a screen reader hears each message as it appears. */}
            <div role="status" className="mb-3 empty:mb-0 text-sm">
              {error && (
                <p key={error.key} className="text-red-700">
                  {error.text}
                </p>
              )}
            </div>
            {expired ? (
              <button ref={back} type="button" onClick={() => void supabase.auth.signOut()} className={primary}>
                Back to sign in
              </button>
            ) : (
              <button type="submit" aria-disabled={loading} className={primary}>
                {loading ? 'Saving…' : 'Save new password'}
              </button>
            )}
          </div>
        </form>
        {!expired && (
          <button
            onClick={() => void supabase.auth.signOut()}
            className="mt-2 w-full min-h-[44px] py-2 text-center text-sm text-purple-600 hover:underline"
          >
            Cancel and sign out
          </button>
        )}
      </div>
    </div>
  );
}
