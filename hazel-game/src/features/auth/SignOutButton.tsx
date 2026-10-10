import { useEffect, useId, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSaveStore } from '../../store/saveStore';

/** How long "Tap again to sign out" waits for the second tap. */
export const SIGN_OUT_ARM_MS = 3000;
/** A confirming tap sooner than this after the first is the tail of a double-tap, not a yes. */
export const SIGN_OUT_CONFIRM_GAP_MS = 400;

/**
 * Sign-out control, shown on every screen while authenticated: floating
 * top-right, or `inline` in the world screen's top bar (#75 item 14b / #102i).
 * Inline it sits by the HUD a child taps all the time, so it takes two taps:
 * the first asks "Sign out?" for 3 seconds — a slip of the finger (or Tab +
 * Enter) never lands a child on the sign-in page. Asking keeps the button's
 * size (the hint floats below it), so the map and the d-pad never move; any
 * other tap or key, or leaving the button, takes the question back; and a
 * double-tap's second half doesn't count as the answer (#75 item 14b review).
 * Once signing out has started, more taps do nothing.
 */
export default function SignOutButton({ inline = false }: { inline?: boolean }) {
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const armed = armedAt !== null;

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmedAt(null), SIGN_OUT_ARM_MS);
    // Anything else the child does — the d-pad, a walk key, a tap on the map — means "not now".
    // Only a tap on the button, or Enter / Space while it has focus, can answer yes.
    const onButton = (e: Event) => !!button.current?.contains(e.target as Node);
    const tapElsewhere = (e: Event) => {
      if (!onButton(e)) setArmedAt(null);
    };
    const otherKey = (e: KeyboardEvent) => {
      if (!(onButton(e) && (e.key === 'Enter' || e.key === ' '))) setArmedAt(null);
    };
    document.addEventListener('pointerdown', tapElsewhere, true);
    document.addEventListener('keydown', otherKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', tapElsewhere, true);
      document.removeEventListener('keydown', otherKey, true);
    };
  }, [armed]);

  async function handleSignOut() {
    setLeaving(true);
    try {
      // Push any pending save before the session goes away.
      await useSaveStore.getState().flush();
      await supabase.auth.signOut();
      // useAuthInit's auth listener clears the stores and resets the flow.
    } finally {
      setLeaving(false);
    }
  }

  function onClick() {
    if (leaving) return;
    if (inline) {
      if (armedAt === null) {
        setArmedAt(Date.now());
        return;
      }
      if (Date.now() - armedAt < SIGN_OUT_CONFIRM_GAP_MS) return;
      setArmedAt(null);
    }
    void handleSignOut();
  }

  const look = 'bg-black/30 hover:bg-black/50 text-white text-xs font-medium px-3 py-1.5 rounded-lg backdrop-blur transition';
  if (!inline) {
    return (
      <button
        onClick={onClick}
        disabled={leaving}
        aria-busy={leaving}
        className={`fixed top-3 right-3 z-50 ${look} disabled:opacity-60`}
      >
        Sign out
      </button>
    );
  }
  return (
    <span className="relative shrink-0">
      <button
        ref={button}
        onClick={onClick}
        onBlur={() => setArmedAt(null)}
        disabled={leaving}
        aria-busy={leaving}
        aria-describedby={hintId}
        className={`min-h-11 min-w-[5rem] ${look} disabled:opacity-60 ${armed ? 'ring-2 ring-white/70' : ''}`}
      >
        {armed ? 'Sign out?' : 'Sign out'}
      </button>
      {/* Read out as it appears; on screen it floats under the button, so the bar doesn't grow. */}
      <span id={hintId} role="status" className="sr-only">
        {armed ? 'Tap again to sign out' : ''}
      </span>
      {armed && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 top-full mt-1 z-10 whitespace-nowrap rounded-md bg-slate-900/95 px-2 py-1 text-[11px] font-semibold text-white shadow-lg"
        >
          Tap again to sign out
        </span>
      )}
    </span>
  );
}
