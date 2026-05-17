import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useProfileStore } from '../../store/profileStore';

/**
 * Loads the current Supabase session on mount and keeps the auth + profile
 * stores in sync with sign-in / sign-out / token-refresh events.
 * Call once, at the app root.
 */
export function useAuthInit() {
  const setSession = useAuthStore((s) => s.setSession);
  const setInitialized = useAuthStore((s) => s.setInitialized);
  const loadProfile = useProfileStore((s) => s.loadProfile);
  const clearProfile = useProfileStore((s) => s.clearProfile);

  useEffect(() => {
    function sync(session: Session | null) {
      setSession(session);
      if (session) void loadProfile(session.user.id);
      else clearProfile();
    }

    supabase.auth.getSession().then(({ data }) => {
      sync(data.session);
      setInitialized(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      sync(session);
    });

    return () => sub.subscription.unsubscribe();
  }, [setSession, setInitialized, loadProfile, clearProfile]);
}
