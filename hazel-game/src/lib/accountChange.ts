import { passwordCheckClient, supabase } from './supabase';
import { errorMessage } from './errors';
import { openGrownUpsWith } from './grownUps';

/**
 * Changing the login's email or password from 👪 Grown-ups (#124d). Behind
 * the gate (#167), and the current password is typed again first: checked on
 * `passwordCheckClient` (a client that keeps nothing, so no fresh-password
 * session is left on the family device), which also opens 👪 Grown-ups for
 * the window again — the password was just typed. The change itself goes
 * through the device's own client (`supabase`), so this sign-in stays valid
 * and picks the change up:
 *   - a new email is only a request: Supabase emails a confirmation link to
 *     the new address (and, with "Secure email change" on — its default — to
 *     the current one too); the email changes once they're tapped, and the
 *     old one signs in until then;
 *   - a new password takes effect at once; Supabase ends every OTHER
 *     session of the login (they're signed out when their token runs out,
 *     within about an hour) and keeps this one. With "Secure password
 *     change" on and this sign-in over a day old, it first wants a code it
 *     emails (`reauthenticate`), sent back as the `nonce`.
 * The Supabase errors come back as they are; the screen words them
 * (`authErrorMessage(err, { where: 'change-email' | 'change-password' })`).
 */

/** Good enough to send: something@something.something, no spaces. The server checks properly. */
export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/**
 * Check the password typed is the login's, on the throwaway client, and
 * open 👪 Grown-ups again for the window (best effort — the change doesn't
 * need it). Resolves with the sign-in's error, or null when it was right.
 */
export async function checkCurrentPassword(email: string, password: string): Promise<unknown> {
  const check = passwordCheckClient();
  const { error } = await check.auth.signInWithPassword({ email, password });
  if (error) return error;
  try {
    await openGrownUpsWith(check);
  } catch (err) {
    console.warn('Opening 👪 Grown-ups after the password check:', errorMessage(err));
  } finally {
    // Not kept a moment longer than needed: signed out before anything changes.
    await check.auth.signOut({ scope: 'local' }).then(
      ({ error: e }) => e && console.warn('Signing out the password check:', errorMessage(e)),
      (e: unknown) => console.warn('Signing out the password check:', errorMessage(e)),
    );
  }
  return null;
}

/** Ask Supabase to change the login's email to `email` (it sends the confirmation link(s)). Resolves with its error, or null. */
export async function requestEmailChange(email: string): Promise<unknown> {
  const { error } = await supabase.auth.updateUser(
    { email: email.trim() },
    // The link comes back to the game (this address must be in Supabase's Redirect URLs, as for reset links).
    { emailRedirectTo: window.location.origin + window.location.pathname },
  );
  return error ?? null;
}

/** Supabase wants the emailed code before it changes the password ("Secure password change"). */
export function needsReauthCode(err: unknown): boolean {
  const o = (typeof err === 'object' && err !== null ? err : {}) as { code?: unknown; message?: unknown };
  return o.code === 'reauthentication_needed' || /requires reauthentication/i.test(String(o.message ?? ''));
}

/** Change the login's password on this device's sign-in (with the emailed code when asked for one). Resolves with the error, or null. */
export async function changePassword(password: string, nonce?: string): Promise<unknown> {
  const { error } = await supabase.auth.updateUser(nonce ? { password, nonce: nonce.trim() } : { password });
  return error ?? null;
}

/** Email the code a password change wants (to the login's own address). Resolves with the error, or null. */
export async function sendReauthCode(): Promise<unknown> {
  const { error } = await supabase.auth.reauthenticate();
  return error ?? null;
}
