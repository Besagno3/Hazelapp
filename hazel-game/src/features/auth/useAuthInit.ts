import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useProfileStore } from '../../store/profileStore';
import { useSaveStore } from '../../store/saveStore';
import { useBattleStore } from '../../store/battleStore';
import { useQuizSessionStore } from '../../store/quizSessionStore';
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
        useQuizSessionStore.getState().reset();
        sendFlow({ type: 'RESET' });
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      sync(data.session);
      setInitialized(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      sync(session);
    });

    return () => sub.subscription.unsubscribe();
  }, [setSession, setInitialized, loadProfile, clearProfile, loadSave, clearSave]);
}
