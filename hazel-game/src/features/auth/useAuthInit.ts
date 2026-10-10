import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useProfileStore } from '../../store/profileStore';
import { useSaveStore } from '../../store/saveStore';
import { useBattleStore } from '../../store/battleStore';
import { sendFlow } from '../../machines/gameFlow';

/**
 * Loads the current Supabase session on mount and keeps the auth, profile,
 * and save stores in sync with sign-in / sign-out / token-refresh events.
 * Call once, at the app root.
 */
export function useAuthInit() {
  const setSession = useAuthStore((s) => s.setSession);
  const setInitialized = useAuthStore((s) => s.setInitialized);
  const loadProfile = useProfileStore((s) => s.loadProfile);
  const clearProfile = useProfileStore((s) => s.clearProfile);
  const loadSave = useSaveStore((s) => s.load);
  const clearSave = useSaveStore((s) => s.clear);

  useEffect(() => {
    let userId: string | null = null;

    function sync(session: Session | null) {
      setSession(session);
      if (session) {
        // Token refreshes fire this too — only reload on an actual user change.
        if (session.user.id !== userId) {
          userId = session.user.id;
          void loadProfile(session.user.id);
          void loadSave(session.user.id);
        }
      } else {
        userId = null;
        clearProfile();
        clearSave();
        useBattleStore.getState().reset();
        sendFlow({ type: 'RESET' });
      }
    }

    // A reset-email link lands with `type=recovery` in the URL. supabase-js
    // also emits PASSWORD_RECOVERY below; checking the URL too covers the
    // event firing before this listener is attached.
    if (isRecoveryUrl(window.location)) useAuthStore.getState().setPasswordRecovery(true);

    supabase.auth.getSession().then(({ data }) => {
      sync(data.session);
      setInitialized(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') useAuthStore.getState().setPasswordRecovery(true);
      // A normal sign-in (e.g. after an expired reset link) is not a recovery.
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
        useAuthStore.getState().setPasswordRecovery(false);
      }
      sync(session);
    });

    return () => sub.subscription.unsubscribe();
  }, [setSession, setInitialized, loadProfile, clearProfile, loadSave, clearSave]);
}

/** Whether the page was opened from a Supabase password-reset email link. */
export function isRecoveryUrl(loc: Pick<Location, 'hash' | 'search'>): boolean {
  return /(^|[#&?])type=recovery(&|$)/.test(loc.hash) || /[?&]type=recovery(&|$)/.test(loc.search);
}
