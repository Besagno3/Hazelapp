import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSaveStore } from '../../store/saveStore';

/** How long "Tap again to sign out" waits for the second tap. */
export const SIGN_OUT_ARM_MS = 3000;

/**
 * Sign-out control, shown on every screen while authenticated: floating
 * top-right, or `inline` in the world screen's top bar (#75 item 14b / #102i).
 * Inline it sits by the HUD a child taps all the time, so it takes two taps:
 * the first turns it into "Tap again to sign out" for 3 seconds — a slip of
 * the finger (or Tab + Enter) never lands a child on the sign-in page.
 */
export default function SignOutButton({ inline = false }: { inline?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), SIGN_OUT_ARM_MS);
    return () => clearTimeout(t);
  }, [armed]);

  async function handleSignOut() {
    // Push any pending save before the session goes away.
    await useSaveStore.getState().flush();
    await supabase.auth.signOut();
    // useAuthInit's auth listener clears the stores and resets the flow.
  }

  return (
    <button
      onClick={() => (inline && !armed ? setArmed(true) : void handleSignOut())}
      className={`${inline ? 'shrink-0 min-h-11' : 'fixed top-3 right-3 z-50'} ${armed ? 'bg-rose-600/80 hover:bg-rose-600' : 'bg-black/30 hover:bg-black/50'} text-white text-xs font-medium px-3 py-1.5 rounded-lg backdrop-blur transition`}
    >
      {armed ? 'Tap again to sign out' : 'Sign out'}
    </button>
  );
}
