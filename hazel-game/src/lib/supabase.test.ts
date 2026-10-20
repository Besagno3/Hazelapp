import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { AUTH_STORAGE_KEY, forgetStoredSession, passwordCheckClient, supabase } from './supabase';

/** A GoTrue client's own settings (protected in the types, plain fields at runtime). */
interface AuthInternals {
  storageKey: string;
  persistSession: boolean;
  autoRefreshToken: boolean;
  detectSessionInUrl: boolean;
  broadcastChannel: unknown;
}
const internals = (auth: unknown) => auth as AuthInternals;

const session = {
  access_token: 'fresh.access.token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'fresh-refresh',
  user: { id: 'grown-up-1', aud: 'authenticated', role: 'authenticated', email: 'mum@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
};

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the sign-in this device keeps (#124b review round 2)', () => {
  it("is kept under supabase-js's own default name — written out, so nobody is signed out by it", () => {
    const plain = createClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string);
    expect(AUTH_STORAGE_KEY).toBe((plain as unknown as { storageKey: string }).storageKey);
    expect(internals(supabase.auth).storageKey).toBe(AUTH_STORAGE_KEY);
  });

  it('forgetStoredSession drops it (and its helpers) whatever the server said, and nothing else', () => {
    localStorage.setItem(AUTH_STORAGE_KEY, '{"access_token":"x"}');
    localStorage.setItem(`${AUTH_STORAGE_KEY}-code-verifier`, 'v');
    localStorage.setItem(`${AUTH_STORAGE_KEY}-user`, '{}');
    localStorage.setItem('hazel-save-kid-sam', '{}');
    forgetStoredSession();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(`${AUTH_STORAGE_KEY}-code-verifier`)).toBeNull();
    expect(localStorage.getItem(`${AUTH_STORAGE_KEY}-user`)).toBeNull();
    expect(localStorage.getItem('hazel-save-kid-sam')).toBe('{}');
  });
});

describe('the password-check client keeps nothing (#124b review round 2, #165)', () => {
  it('is set up to keep nothing: memory only, never refreshed, its own name, no word to other tabs', () => {
    const check = internals(passwordCheckClient().auth);
    expect(check.persistSession).toBe(false);
    expect(check.autoRefreshToken).toBe(false);
    expect(check.detectSessionInUrl).toBe(false);
    expect(check.storageKey).toBe('hazel-password-check');
    expect(check.storageKey).not.toBe(AUTH_STORAGE_KEY);
    expect(check.broadcastChannel).toBeNull();
    // One client, made once.
    expect(passwordCheckClient()).toBe(passwordCheckClient());
  });

  it('a password checked on it leaves no session on the device — the stored one is untouched — and it signs out', async () => {
    localStorage.setItem('hazel-save-kid-sam', '{}');
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const u = String(url instanceof Request ? url.url : url);
        calls.push(u);
        if (u.includes('/auth/v1/token')) return new Response(JSON.stringify(session), { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (u.includes('/auth/v1/logout')) return new Response(null, { status: 204 });
        return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
      }),
    );
    const check = passwordCheckClient().auth;
    const signedIn = await check.signInWithPassword({ email: 'mum@example.com', password: 'hunter22' });
    expect(signedIn.error).toBeNull();
    expect(signedIn.data.session?.access_token).toBe('fresh.access.token');
    // Nothing written to this device: no session under any name.
    expect(Object.keys(localStorage)).toEqual(['hazel-save-kid-sam']);
    // The device's own client never heard of it.
    expect((await supabase.auth.getSession()).data.session).toBeNull();
    await check.signOut({ scope: 'local' });
    expect(calls.some((u) => u.includes('/auth/v1/logout'))).toBe(true);
    expect((await check.getSession()).data.session).toBeNull();
  });
});
