import { useState } from 'react';
import { supabase } from '../../lib/supabase';

const CURRENT_YEAR = new Date().getFullYear();
// Birth years offered at sign-up: a few years back through ~100 years.
const BIRTH_YEARS = Array.from({ length: 98 }, (_, i) => CURRENT_YEAR - 3 - i);
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (isSignUp) {
      if (!birthYear || !birthMonth) {
        setError('Please select your birth year and month.');
        return;
      }
      setLoading(true);
      // birth_year / birth_month flow into the profiles row via the
      // handle_new_user() trigger (see supabase/migrations/0001).
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { birth_year: Number(birthYear), birth_month: Number(birthMonth) },
        },
      });
      setLoading(false);
      if (authError) {
        setError(authError.message);
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
        setError(authError.message);
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
        <p className="text-center text-gray-500 mb-6 text-sm">Learn. Battle. Conquer.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={fieldClass}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={fieldClass}
          />

          {isSignUp && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Birth date — used to pick age-appropriate questions
              </label>
              <div className="flex gap-2">
                <select
                  value={birthMonth}
                  onChange={(e) => setBirthMonth(e.target.value)}
                  required
                  className={fieldClass}
                >
                  <option value="">Month</option>
                  {MONTHS.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  required
                  className={fieldClass}
                >
                  <option value="">Year</option>
                  {BIRTH_YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}
          {notice && <p className="text-green-600 text-sm">{notice}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2 transition disabled:opacity-50"
          >
            {loading ? 'Loading…' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <button
          onClick={() => {
            setIsSignUp(!isSignUp);
            setError(null);
            setNotice(null);
          }}
          className="mt-4 w-full text-center text-sm text-purple-600 hover:underline"
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>
      </div>
    </div>
  );
}
