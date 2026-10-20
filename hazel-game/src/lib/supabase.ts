import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config. Copy hazel-game/.env.example to hazel-game/.env ' +
      'and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
      '(Supabase dashboard → Project Settings → API).',
  );
}

/**
 * Where this device keeps the sign-in: supabase-js's own default name,
 * written out so a sign-out the server never heard can still drop it
 * (`forgetStoredSession`, #124b review round 2). The same name as before, so
 * nobody is signed out by it.
 */
export const AUTH_STORAGE_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { storageKey: AUTH_STORAGE_KEY } });

/** Drop the sign-in this device keeps (the session and its helpers), whatever the server said. */
export function forgetStoredSession(): void {
  try {
    for (const key of [AUTH_STORAGE_KEY, `${AUTH_STORAGE_KEY}-code-verifier`, `${AUTH_STORAGE_KEY}-user`]) {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable: nothing was kept in it.
  }
}

let passwordCheck: SupabaseClient | null = null;

/**
 * A client for checking the grown-up's password again (the 👪 gate, Close
 * account) that keeps nothing: its sign-in lives in memory only, is never
 * refreshed, never stored on the device and never told to other tabs (its
 * own storage name). So a password typed to check it's the grown-up never
 * leaves a fresh-password session on the family device — one that could
 * close the account (#124b review round 2, #167). Sign it out once used.
 */
export function passwordCheckClient(): SupabaseClient {
  passwordCheck ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'hazel-password-check' },
  });
  return passwordCheck;
}
