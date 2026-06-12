import { supabase } from '../../lib/supabase';
import { useSaveStore } from '../../store/saveStore';

/** Floating sign-out control, shown on every screen while authenticated. */
export default function SignOutButton() {
  async function handleSignOut() {
    // Push any pending save before the session goes away.
    await useSaveStore.getState().flush();
    await supabase.auth.signOut();
    // useAuthInit's auth listener clears the stores and resets the flow.
  }

  return (
    <button
      onClick={handleSignOut}
      className="fixed top-3 right-3 z-50 bg-black/30 hover:bg-black/50 text-white text-xs font-medium px-3 py-1.5 rounded-lg backdrop-blur transition"
    >
      Sign out
    </button>
  );
}
