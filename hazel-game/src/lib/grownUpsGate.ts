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

/**
 * Words for a family screen when a grown-up action didn't happen because
 * 👪 Grown-ups was shut and the grown-up chose "Not now" (#167) — by
 * situation (#167 review round 1): "locked again" only in 👪 Grown-ups
 * itself, where it was open; on a setup screen (consent, a first player, a
 * player's PIN) it never was, and a kid may be the one reading, so it asks
 * for a grown-up. `GROWN_UPS_LOCKED_MESSAGE` is for a refusal with no
 * situation known (the database's own, passed on).
 */
export function grownUpsLockedMessage({ inArea, hasParentPin }: { inArea: boolean; hasParentPin: boolean }): string {
  const key = hasParentPin ? 'grown-up PIN or password' : 'password';
  return inArea
    ? `👪 Grown-ups locked again, so nothing changed. Try again and enter your ${key} when asked.`
    : `Nothing changed — a grown-up needs to unlock this. Ask a grown-up to try again and enter their ${key}.`;
}

/** The locked refusal when nothing says where it happened. */
export const GROWN_UPS_LOCKED_MESSAGE = '👪 Grown-ups is locked, so nothing changed. Try again and enter your grown-up PIN or password when asked.';

/** A grown-up action the database refused because 👪 Grown-ups was shut — and the grown-up didn't open it again. `words` say so for the screen it happened on. */
export class GrownUpsLockedError extends Error {
  readonly code = 'grown_ups_locked';
  readonly words: string;
  constructor(words: string = GROWN_UPS_LOCKED_MESSAGE) {
    super('grown_ups_locked: 👪 Grown-ups is locked');
    this.name = 'GrownUpsLockedError';
    this.words = words;
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

/** The words for a locked refusal: its own when the store gave it some, else the plain ones. */
export function grownUpsLockedWords(err: unknown): string {
  return err instanceof GrownUpsLockedError ? err.words : GROWN_UPS_LOCKED_MESSAGE;
}

/** The dialog's title: "locked again" only in 👪 Grown-ups, where it was open (never on a setup screen). */
export function relockTitle(inArea: boolean): string {
  return inArea ? '👪 Grown-ups locked again' : "👪 Just checking it's a grown-up";
}

/** Which way into 👪 Grown-ups the gate is showing: the grown-up PIN, the PIN resting (locked for a while), or the password. */
export type GateWay = 'pin' | 'pin-resting' | 'password';

/** The dialog's one line under its title: what to do now, and that nothing on the page is lost (the gate's own subtitle isn't shown there). */
export function relockLead(way: GateWay, email: string): string {
  const what =
    way === 'pin'
      ? 'Type your grown-up PIN to carry on.'
      : way === 'pin-resting'
        ? 'Use your password for now.'
        : email
          ? `Enter the password for ${email} to carry on.`
          : 'Enter your password to carry on.';
  return `${what} Everything on this page stays as it was.`;
}

/**
 * Why `unlock_grown_ups` / `allow_password_change` said no (SQLSTATE HQ002,
 * migration 0024), from the error the app got back: `no_session` — the
 * sign-in it named has ended (a password change on another device signs the
 * others out; its token lives on for up to an hour) or this device's couldn't
 * be read; `password_changed` — the password was changed without the old one
 * and can't open 👪 Grown-ups until `until` (#167 review round 1);
 * `reauth_required` — not a password typed just now. Null for anything else.
 */
export interface UnlockRefusal {
  kind: 'no_session' | 'password_changed' | 'reauth_required';
  until: Date | null;
}

export function unlockRefusal(err: unknown): UnlockRefusal | null {
  if (typeof err !== 'object' || err === null) return null;
  const o = err as Record<string, unknown>;
  const m = typeof o.message === 'string' ? o.message.match(/^(no_session|password_changed|reauth_required)\b/) : null;
  if (!m) return null;
  const kind = m[1] as UnlockRefusal['kind'];
  const at = kind === 'password_changed' && typeof o.details === 'string' ? new Date(o.details) : null;
  return { kind, until: at && !Number.isNaN(at.getTime()) ? at : null };
}

/** "Wednesday at 3:40 PM" — when a wait ends, in the grown-up's own clock. */
function whenWords(until: Date | null): string {
  if (!until) return 'tomorrow';
  return until.toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' }).replace(/^(\w+),? /, '$1 at ');
}

/**
 * The password was changed without the old one, so for a day no password
 * opens 👪 Grown-ups (#167 review round 1): when it opens again, and the ways
 * that work now — the grown-up PIN, or a new password set from an emailed
 * reset link ("Forgot it?" on this page), which ends the wait at once.
 */
export function passwordWaitMessage(until: Date | null, { hasParentPin, changing = false }: { hasParentPin: boolean; changing?: boolean }): string {
  const lead = `Your password was changed recently without the old one being typed, so for safety it can't ${changing ? 'be changed here' : 'open 👪 Grown-ups'} until ${whenWords(until)}.`;
  const ways = changing
    ? 'Tap "Forgot it?" to set a new one from your email instead.'
    : hasParentPin
      ? 'Use your grown-up PIN, or tap "Forgot it?" to set a new password from your email — that works at once.'
      : 'Tap "Forgot it?" to set a new password from your email — that works at once.';
  return `${lead} ${ways}`;
}

/** This device's sign-in has ended (a password change elsewhere signs the others out): the words that go with "Sign in again". */
export const DEVICE_SIGNED_OUT_MESSAGE =
  "This device's sign-in has ended — maybe the password was changed on another device. Sign in again to carry on.";

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
