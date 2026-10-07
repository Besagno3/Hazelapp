import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';

interface AuthStore {
  user: User | null;
  session: Session | null;
  /** True once the initial Supabase session check has completed. */
  initialized: boolean;
  /**
   * The user arrived from a password-reset email link: they hold a temporary
   * session and must choose a new password before playing.
   */
  passwordRecovery: boolean;
  setSession: (session: Session | null) => void;
  setInitialized: (initialized: boolean) => void;
  clearSession: () => void;
  setPasswordRecovery: (on: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  session: null,
  initialized: false,
  passwordRecovery: false,
  setSession: (session) => set({ session, user: session?.user ?? null }),
  setInitialized: (initialized) => set({ initialized }),
  clearSession: () => set({ session: null, user: null }),
  setPasswordRecovery: (passwordRecovery) => set({ passwordRecovery }),
}));
