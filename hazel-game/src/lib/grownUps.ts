import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { errorMessage } from './errors';
import { functionMissing } from './pinLock';
import { sessionIdOf } from './grownUpsGate';

/** The calls that open and shut 👪 Grown-ups on the server (#167); the words and checks are in `grownUpsGate.ts`. */

/** This device's own sign-in (the main client's session id), or null when there's none to read. */
export async function deviceSessionId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return sessionIdOf(data.session?.access_token);
  } catch {
    return null;
  }
}

/**
 * The email this login signs in with now: asked of the auth service, so a
 * change confirmed on another device counts (the stored session still says
 * the old one until it refreshes, #124d); else what the device knows.
 */
export async function signInEmail(known: string): Promise<string> {
  try {
    const { data, error } = await supabase.auth.getUser();
    const email = data?.user?.email;
    if (!error && email) return email;
  } catch {
    // Offline or no such call: the device's copy will do.
  }
  return known;
}

/**
 * After a password check signed in on `client` (a password typed just now),
 * open 👪 Grown-ups on this device's own sign-in (`known`, else read) for
 * the window. 'no-gate':
 * the database is from before 0024, so there's nothing to open. Throws when
 * the database refused or couldn't be reached.
 */
export async function openGrownUpsWith(client: SupabaseClient, known?: string | null): Promise<'open' | 'no-gate'> {
  const session = known ?? (await deviceSessionId());
  if (!session) throw new Error("no_session: this device's sign-in couldn't be read");
  const { error } = await client.rpc('unlock_grown_ups', { p_session: session });
  if (!error) return 'open';
  if (functionMissing(error)) return 'no-gate';
  throw refusalError(error, 'unlock refused');
}

/** A database refusal as a thrown `Error` that keeps its `code` and `details` (HQ002's DETAIL says when a wait ends). */
function refusalError(error: { message?: unknown; code?: unknown; details?: unknown }, fallback: string): Error {
  return Object.assign(new Error(typeof error.message === 'string' ? error.message : fallback), { code: error.code, details: error.details });
}

/**
 * Tell the database this device's sign-in is one the family's app runs on
 * (as the family loads, #167 review round 1): such a sign-in — however
 * fresh, as in the minute after a grown-up signs in — never names another
 * to open, nor closes the account; only a password check does. Never throws;
 * a database from before this has nothing to note.
 */
export async function noteDeviceSession(): Promise<void> {
  try {
    const { error } = await supabase.rpc('note_device_session');
    if (error && !functionMissing(error)) console.warn('Noting this device\'s sign-in failed:', errorMessage(error));
  } catch (err) {
    console.warn('Noting this device\'s sign-in failed:', errorMessage(err));
  }
}

/**
 * Tell the database a password change is coming, from `client`'s sign-in —
 * the password check made just now (the change-password page), or a reset
 * link's sign-in (the reset page). A change it hasn't been told about makes
 * the password unable to open 👪 Grown-ups for a day (#167 review round 1).
 * Resolves with the refusal (`unlockRefusal` reads it), or null — also on a
 * database from before this.
 */
export async function allowPasswordChange(client: SupabaseClient): Promise<unknown> {
  try {
    const { error } = await client.rpc('allow_password_change');
    if (!error || functionMissing(error)) return null;
    return refusalError(error, 'password change refused');
  } catch (err) {
    return err ?? new Error('password change refused');
  }
}

/**
 * Right after signing up or in while the family is still being set up
 * (consent → first player → their PIN): that fresh sign-in may open
 * 👪 Grown-ups for itself, so the first-run flow needs no gate. The
 * database decides (it refuses a sign-in that isn't fresh, or a family
 * that's set up); a refusal is quiet. True when it opened.
 */
export async function openForFirstRun(): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('unlock_grown_ups');
    if (!error) return true;
    if (!functionMissing(error) && error.code !== 'HQ002') console.warn('Opening 👪 Grown-ups for the first run failed:', errorMessage(error));
    return false;
  } catch (err) {
    console.warn('Opening 👪 Grown-ups for the first run failed:', errorMessage(err));
    return false;
  }
}

/** Shut 👪 Grown-ups on this sign-in (leaving it, or the first run done). Never throws; a database from before 0024 has nothing to shut. */
export async function lockGrownUps(): Promise<void> {
  try {
    const { error } = await supabase.rpc('lock_grown_ups');
    if (error && !functionMissing(error)) console.warn('Locking 👪 Grown-ups failed:', errorMessage(error));
  } catch (err) {
    console.warn('Locking 👪 Grown-ups failed:', errorMessage(err));
  }
}
