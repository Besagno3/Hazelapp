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
 * player's PIN) it never was, and the reader may be the parent setting up or
 * a kid, so one line serves both (review round 2): what the step needs, and
 * a nudge to fetch a grown-up for whoever isn't one. `GROWN_UPS_LOCKED_MESSAGE`
 * is for a refusal with no situation known (the database's own, passed on).
 */
export function grownUpsLockedMessage({ inArea, hasParentPin }: { inArea: boolean; hasParentPin: boolean }): string {
  if (inArea) {
    const key = hasParentPin ? 'grown-up PIN or password' : 'password';
    return `👪 Grown-ups locked again, so nothing changed. Try again and enter your ${key} when asked.`;
  }
  const key = hasParentPin ? "a grown-up's password or grown-up PIN" : "a grown-up's password";
  return `Nothing changed — this step needs ${key}. Not a grown-up? Please fetch one.`;
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

/**
 * Which way into 👪 Grown-ups the gate is showing: the grown-up PIN, the PIN
 * resting (locked for a while), the password — or, when the password can't
 * work, the reason (#167 review round 2): `password-wait`, the password was
 * changed without a check (the ways that do work, the PIN or a reset, come
 * first), or `signed-out`, this device's sign-in has ended (only signing in
 * again helps).
 */
export type GateWay = 'pin' | 'pin-resting' | 'password' | 'password-wait' | 'signed-out';

/** The gate's line under its title while the password can't open it (the area's subtitle, and the dialog's lead before "Everything…"). */
export function waitLead(hasParentPin: boolean): string {
  return hasParentPin ? 'Use your grown-up PIN for now.' : 'Reset your password to open it now.';
}

/** The gate's line under its title when this device's sign-in has ended. */
export const SIGNED_OUT_LEAD = 'Sign in again to carry on.';

/**
 * The dialog's one line under its title: what to do now, and that nothing on
 * the page is lost (the gate's own subtitle isn't shown there) — except when
 * the sign-in has ended, when signing in again can't keep the page.
 */
export function relockLead(way: GateWay, email: string, hasParentPin = false): string {
  if (way === 'signed-out') return "Sign in again to carry on — what you typed here won't be kept.";
  const what =
    way === 'pin'
      ? 'Type your grown-up PIN to carry on.'
      : way === 'pin-resting'
        ? 'Use your password for now.'
        : way === 'password-wait'
          ? waitLead(hasParentPin)
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

/**
 * When a wait ends, in the grown-up's own clock: "today at 3:40 PM",
 * "tomorrow at 9:05 AM" (a wait is never longer than a day), else the
 * weekday (#167 review round 2: "Wednesday" said on a Wednesday read like
 * next week).
 */
export function whenWords(until: Date | null, now: Date = new Date()): string {
  if (!until) return 'tomorrow';
  const time = until.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(until) - day(now)) / 86_400_000);
  if (days <= 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  return `${until.toLocaleDateString([], { weekday: 'long' })} at ${time}`;
}

/**
 * The password was changed in a way the database couldn't check, so for a
 * day no password opens 👪 Grown-ups or closes the account (#167 review
 * rounds 1–2). Short, calm and true for both readers — the grown-up who
 * changed it (an older tab, Supabase's own page) and one who didn't: what
 * happened, until when, what still works, and the way to end it now (a new
 * password from a reset email). `doing` is what the password can't do here:
 * open 👪 (the gate, whose own buttons are the PIN and the reset), change
 * the password, or close the account (both pages' "Forgot it?" sits under
 * the password box).
 */
export function passwordWaitMessage(
  until: Date | null,
  { hasParentPin = false, doing = 'open' }: { hasParentPin?: boolean; doing?: 'open' | 'change' | 'close' } = {},
): string {
  const what = doing === 'change' ? 'be changed here' : doing === 'close' ? 'close the account' : 'open 👪 Grown-ups';
  const lead = `Your password was changed recently, so for safety it can't ${what} until ${whenWords(until)}.`;
  if (doing === 'open') {
    return hasParentPin
      ? `${lead} Your grown-up PIN still works.`
      : `${lead} Didn't change it, or need it sooner? A new password from a reset email works at once.`;
  }
  const nothing = doing === 'close' ? ' Nothing was deleted.' : '';
  return `${lead}${nothing} Didn't change it, or need it sooner? Tap "Forgot it?" under the password box to reset it by email.`;
}

/** Why this device's sign-in can't be opened (a password change elsewhere signs the others out) — the gate's line beside its one "Sign in again" button. */
export const DEVICE_SIGNED_OUT_WHY = "This device's sign-in has ended — maybe the password was changed on another device.";

/** This device's sign-in has ended: the words that go with "Sign in again" where there's no lead line to say it. */
export const DEVICE_SIGNED_OUT_MESSAGE = `${DEVICE_SIGNED_OUT_WHY} Sign in again to carry on.`;

/**
 * A right grown-up PIN on a sign-in that has ended (`try_parent_pin` says
 * `signed_out`): thrown from the gate's PIN pad so the pad says it in the
 * same words as the password's refusal (`DEVICE_SIGNED_OUT_MESSAGE`, through
 * `plainErrorOr`) with its "Sign in again" — one wording for one thing
 * (#167 review round 2). Its code reads as a dead session (`sessionRanOut`).
 */
export class DeviceSignedOutError extends Error {
  readonly code = 'session_not_found';
  constructor() {
    super("session_not_found: this device's sign-in has ended");
    this.name = 'DeviceSignedOutError';
  }
}

/** Said (and shown on the gate) when 👪 Grown-ups goes back to its gate because its window ran out (#167 review round 2). */
export const LAPSED_NOTE = `👪 Grown-ups locked after ${GROWN_UP_UNLOCK_MINUTES} minutes.`;

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
