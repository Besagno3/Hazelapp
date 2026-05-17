import { supabase } from '../../lib/supabase';
import { useGameStore } from '../../store/gameStore';

/** Floating sign-out control, shown on every screen while authenticated. */
export default function SignOutButton() {
  const reset = useGameStore((s) => s.reset);

  async function handleSignOut() {
    await supabase.auth.signOut();
    // Clear local game progress so the next player starts fresh.
    reset();
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
