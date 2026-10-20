import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { putAwayGame, useFamilyStore } from '../../store/familyStore';

/**
 * Loads the current Supabase session on mount and keeps the auth and family
 * stores in sync with sign-in / sign-out / token-refresh events. A login is a
 * grown-up's (#124): signing in loads their kids; a kid's profile and save
 * load when they're picked on "Who's playing?". Call once, at the app root.
 */
export function useAuthInit() {
  const setSession = useAuthStore((s) => s.setSession);
  const setInitialized = useAuthStore((s) => s.setInitialized);

  useEffect(() => {
    function sync(session: Session | null) {
      setSession(session);
      if (session) {
        // Token refreshes fire this too — only reload on an actual user
        // change. The family store says whose family is loaded, so one
        // cleared without an event (a sign-out the server never heard,
        // `signOutHere`) loads again on the next sign-in.
        if (session.user.id !== useFamilyStore.getState().userId) {
          void useFamilyStore.getState().load(session.user.id);
        }
      } else {
        useFamilyStore.getState().clear();
        putAwayGame();
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
  }, [setSession, setInitialized]);
}

/** Whether the page was opened from a Supabase password-reset email link. */
export function isRecoveryUrl(loc: Pick<Location, 'hash' | 'search'>): boolean {
  return /(^|[#&?])type=recovery(&|$)/.test(loc.hash) || /[?&]type=recovery(&|$)/.test(loc.search);
}
