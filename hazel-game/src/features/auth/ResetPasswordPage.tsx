import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { useAuthStore } from '../../store/authStore';

/** Supabase's default minimum; the server enforces its own setting too. */
const MIN_PASSWORD_LENGTH = 6;

/**
 * Shown after a password-reset email link signs the user in with a temporary
 * recovery session (#76). They must pick a new password before the game
 * continues; "Cancel" signs them out instead.
 */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    const { error: authError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (authError) {
      setError(errorMessage(authError));
      return;
    }
    // Drop the recovery token from the address bar so a refresh can't replay it.
    window.history.replaceState(null, '', window.location.pathname);
    useAuthStore.getState().setPasswordRecovery(false);
  }

  const fieldClass =
    'w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-500">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-purple-700 mb-2">Choose a new password</h1>
        <p className="text-center text-gray-500 mb-6 text-sm">Then it's straight back to your adventure.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder="New password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={fieldClass}
          />
          <input
            type="password"
            placeholder="Type it again"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className={fieldClass}
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2 transition disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save new password'}
          </button>
        </form>
        <button
          onClick={() => void supabase.auth.signOut()}
          className="mt-4 w-full text-center text-sm text-purple-600 hover:underline"
        >
          Cancel and sign out
        </button>
      </div>
    </div>
  );
}
