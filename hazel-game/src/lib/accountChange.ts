import { passwordCheckClient, supabase } from './supabase';
import { errorMessage } from './errors';
import { allowPasswordChange, askForPasswordCheck, openGrownUpsWith } from './grownUps';
import { unlockRefusal } from './grownUpsGate';

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
 *     within about an hour) and keeps this one.
 * What stops a kid holding the device's sign-in from changing the password
 * themselves (#167 review rounds 1–2, #168): the auth service accepts
 * `updateUser({ password })` from any sign-in of the login unless the project
 * asks for more —
 *   - "Secure password change" (`GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION`)
 *     wants a code it emails (`reauthenticate`, sent back as the `nonce`), but
 *     only from a sign-in over 24 hours old — a grown-up who signed in today
 *     is not covered;
 *   - "require the current password" (`GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD`)
 *     wants `current_password` with every change — except from a sign-in
 *     made by ANY emailed link (the auth service's "recovery" sessions: a
 *     reset link, a magic link, or the sign-up confirmation link a new family
 *     signs in with), for as long as that sign-in lasts. The app always sends
 *     it, so this can be on, but a family device signed in by its sign-up
 *     link isn't covered.
 * So whatever the project's settings, the database notes every password
 * change: one this page announced first, for this device's sign-in
 * (`allow_password_change`, from the password check, which must be a sign-in
 * made just after this device asked for one — `checkCurrentPassword`'s
 * `forPasswordChange`) is fine; any other means no password can open
 * 👪 Grown-ups or close the account for a day (the grown-up PIN still opens
 * 👪, and a reset link ends the wait) — migration 0024.
 * The Supabase errors come back as they are; the screen words them
 * (`authErrorMessage(err, { where: 'change-email' | 'change-password' })`).
 */

/** Good enough to send: something@something.something, no spaces. The server checks properly. */
export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/**
 * Check the password typed is the login's, on a throwaway client of its own
 * (asked for by this device first, `askForPasswordCheck`), and open
 * 👪 Grown-ups again for the window (best effort — an email change doesn't
 * need it). With `forPasswordChange`, that check also tells the database the
 * password change is coming, for this device's sign-in
 * (`allow_password_change`), and a refusal comes back: this device's sign-in
 * has ended, or the password was changed without a check and can't be
 * changed here for a day (`unlockRefusal` reads both) — the change would
 * only start the wait again. Resolves with the sign-in's error, that
 * refusal, or what kept the database from answering, or null.
 * `currentPasswordWrong` tells a wrong password from the rest.
 */
export async function checkCurrentPassword(
  email: string,
  password: string,
  { forPasswordChange = false }: { forPasswordChange?: boolean } = {},
): Promise<unknown> {
  const session = await askForPasswordCheck();
  const check = passwordCheckClient();
  const { error } = await check.auth.signInWithPassword({ email, password });
  if (error) return error;
  let refused: unknown = null;
  try {
    try {
      await openGrownUpsWith(check, session);
    } catch (err) {
      const kind = unlockRefusal(err)?.kind;
      if (forPasswordChange && (kind === 'no_session' || kind === 'password_changed')) refused = err;
      else console.warn('Opening 👪 Grown-ups after the password check:', errorMessage(err));
    }
    if (forPasswordChange && !refused) refused = await allowPasswordChange(check, session);
  } finally {
    // Not kept a moment longer than needed: signed out before anything changes.
    await check.auth.signOut({ scope: 'local' }).then(
      ({ error: e }) => e && console.warn('Signing out the password check:', errorMessage(e)),
      (e: unknown) => console.warn('Signing out the password check:', errorMessage(e)),
    );
  }
  return refused;
}

/** How long the email-change links can still work: no project keeps them longer than a day (Supabase's default is an hour). */
export const EMAIL_LINKS_LAST_MS = 24 * 60 * 60 * 1000;

/**
 * The 📬 line under "Your sign-in" while an email change waits: the links
 * (one to each address with "Secure email change") still to tap, or — sent
 * over a day ago, or cancelled (a password change cancels them and clears
 * when they were sent) — no longer working (#167 review round 1). Null when
 * nothing waits.
 */
export function pendingEmailLine(email: string, pending: string, sentAt: string | null | undefined, now = Date.now()): string | null {
  if (!pending || pending.toLowerCase() === email.toLowerCase()) return null;
  const sent = sentAt ? Date.parse(sentAt) : NaN;
  if (Number.isFinite(sent) && now - sent < EMAIL_LINKS_LAST_MS) {
    return `Waiting for you to tap the link in each email we sent, to change it to ${pending}.`;
  }
  return `The links to change it to ${pending} don't work any more. Tap "Change email…" to send new ones.`;
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

/**
 * Change the login's password on this device's sign-in, with the current
 * password always (so "require the current password" can be on, #167 review
 * round 1) and the emailed code when one was asked for. Resolves with the
 * error, or null.
 */
export async function changePassword(password: string, current: string, nonce?: string): Promise<unknown> {
  const { error } = await supabase.auth.updateUser(
    nonce ? { password, current_password: current, nonce: nonce.trim() } : { password, current_password: current },
  );
  return error ?? null;
}

/**
 * The password check said the password typed isn't the login's (the
 * sign-in's own "invalid login credentials") — the one failure that's about
 * the current-password box. A database refusal or a lost connection while
 * announcing the change is not (#167 review round 2).
 */
export function currentPasswordWrong(err: unknown): boolean {
  const o = (typeof err === 'object' && err !== null ? err : {}) as { code?: unknown; message?: unknown };
  return o.code === 'invalid_credentials' || /invalid login credentials/i.test(String(o.message ?? ''));
}

/** The auth service wanted the current password and it didn't match ("require the current password" on). */
export function currentPasswordRefused(err: unknown): boolean {
  const code = (typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined) ?? '';
  return code === 'current_password_mismatch' || code === 'current_password_required';
}

/** Email the code a password change wants (to the login's own address). Resolves with the error, or null. */
export async function sendReauthCode(): Promise<unknown> {
  const { error } = await supabase.auth.reauthenticate();
  return error ?? null;
}
