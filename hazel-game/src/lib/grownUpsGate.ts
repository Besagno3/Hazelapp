import { GROWN_UPS_LOCKED_SQLSTATE } from '../../supabase/functions/_shared/closeAccount';

/**
 * 👪 Grown-ups, enforced by the database (#167, migration 0024): a short
 * "unlocked until" for one sign-in (session) that every grown-up action
 * needs. The right grown-up PIN opens it (`try_parent_pin`); so does a
 * password typed just now, checked on `passwordCheckClient` — that check's
 * token asks `unlock_grown_ups` to open the device's own sign-in, which it
 * names. It shuts after `GROWN_UP_UNLOCK_MINUTES`, or when the app calls
 * `lock_grown_ups` on leaving. A refused grown-up action comes back with
 * SQLSTATE HQ001 (`grownUpsLocked`); the store then asks for the gate again
 * (`store/grownUpsStore`). The words and checks here touch nothing;
 * the calls are in `lib/grownUps.ts`.
 */

/** How long 👪 Grown-ups stays open after an unlock (`grown_up_unlock_seconds()` in 0024). */
export const GROWN_UP_UNLOCK_MINUTES = 15;

/** A grown-up action the database refused because 👪 Grown-ups was shut — and the grown-up didn't open it again. */
export class GrownUpsLockedError extends Error {
  readonly code = 'grown_ups_locked';
  constructor() {
    super('grown_ups_locked: 👪 Grown-ups is locked');
    this.name = 'GrownUpsLockedError';
  }
}

/**
 * Was this refused because 👪 Grown-ups is shut on this sign-in? The
 * database's own code (HQ001) or words, or the close-account function's
 * refusal (`grown_ups_locked`), or the store's own error after "Not now".
 */
export function grownUpsLocked(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const o = err as Record<string, unknown>;
  if (o.code === GROWN_UPS_LOCKED_SQLSTATE || o.code === 'grown_ups_locked') return true;
  return typeof o.message === 'string' && /^grown_ups_locked\b/.test(o.message);
}

/**
 * Words for a family screen when a grown-up action didn't happen because
 * 👪 Grown-ups locked again and the grown-up chose "Not now" (#167). Plain
 * and true whichever button it was.
 */
export const GROWN_UPS_LOCKED_MESSAGE = 'Grown-ups locked again, so nothing changed. Try again and enter your PIN or password when asked.';

/** The dialog's title: "again" once this tab has had it open. */
export function relockTitle(wasOpen: boolean): string {
  return wasOpen ? '👪 Grown-ups locked again' : "👪 Just checking it's a grown-up";
}

/** The dialog's first line: what to do, and that nothing on the page is lost. */
export function relockLead(hasParentPin: boolean): string {
  return `${hasParentPin ? 'Enter your grown-up PIN or password' : 'Enter your password'} to carry on. Everything on this page stays as it was.`;
}

/** The session id in a Supabase access token (its `session_id` claim), or null. The signature isn't read. */
export function sessionIdOf(accessToken: string | null | undefined): string | null {
  const part = accessToken?.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const claims: unknown = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    const id = typeof claims === 'object' && claims !== null ? (claims as Record<string, unknown>).session_id : null;
    return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}
