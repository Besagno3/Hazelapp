/**
 * Test helpers for 👪 Grown-ups enforced by the database (#167): the device's
 * own sign-in, as an access token whose `session_id` the app reads to name it
 * when a password check opens 👪 Grown-ups (`unlock_grown_ups(p_session)`).
 */
export const DEVICE_SESSION = '00000000-0000-4000-8000-0000000000d0';

/** An access token carrying `claims` (the signature is never read by the app). */
export function tokenWith(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
}

/** What `supabase.auth.getSession()` answers on the family device. */
export const deviceSession = {
  data: { session: { access_token: tokenWith({ sub: 'grown-up-1', session_id: DEVICE_SESSION }) } },
  error: null,
};
