import { FunctionsHttpError } from '@supabase/supabase-js';
import { MIN_PASSWORD_LENGTH } from '../content/family';

/**
 * Best-effort human-readable message from any error value — `Error`, a
 * Supabase `PostgrestError` / `AuthError` ({ message, details, hint, code }),
 * a plain object, or a string. Synchronous; never throws.
 *
 * The whole story, code and details included — for the logs and for screens
 * that help fix things. Instead of a hardcoded "something went wrong". A kid's
 * or grown-up's screen shows `friendlyMessage` / `authErrorMessage` and logs
 * this (#130 S6).
 */
export function errorMessage(err: unknown): string {
  if (err == null) return 'Unknown error';
  if (typeof err === 'string') return err;

  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const base =
      (typeof o.message === 'string' && o.message) ||
      (typeof o.error === 'string' && o.error) ||
      '';
    const code = typeof o.code === 'string' && o.code ? ` [${o.code}]` : '';
    const extra = [o.details, o.hint]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' — ');
    if (base) return extra ? `${base}${code} — ${extra}` : `${base}${code}`;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }

  return String(err);
}

/**
 * Like `errorMessage`, but also unwraps a Supabase Edge Function HTTP error by
 * reading its response body — that body carries the function's real
 * `{ error, detail }` instead of the generic "non-2xx status code" message.
 * Async because reading the response body is async.
 */
export async function resolveErrorMessage(err: unknown): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = (await err.context.json()) as { error?: unknown; detail?: unknown };
      const detail =
        (typeof body.detail === 'string' && body.detail) ||
        (typeof body.error === 'string' && body.error) ||
        '';
      if (detail) return detail;
    } catch {
      // Body wasn't JSON (or was already consumed) — fall back below.
    }
  }
  return errorMessage(err);
}

/** The error's own words, without the code, details and hint `errorMessage` adds. */
function ownWords(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const o = err as Record<string, unknown>;
    const base = (typeof o.message === 'string' && o.message) || (typeof o.error === 'string' && o.error) || '';
    if (base) return base;
  }
  return errorMessage(err);
}

export const OFFLINE_MESSAGE = "You're offline. Check your internet connection, then try again.";
export const NETWORK_MESSAGE = "We couldn't reach Hazel Quest. Check your internet connection, then try again.";

/** The connection failed — offline, or a fetch that never reached the server. */
function networkTrouble(err: unknown): string | null {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return OFFLINE_MESSAGE;
  const o = (typeof err === 'object' && err !== null ? err : {}) as Record<string, unknown>;
  const words = ownWords(err);
  if (o.name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(words)) {
    return NETWORK_MESSAGE;
  }
  return null;
}

/**
 * A message for a kid's or grown-up's screen (#130 S6): the connection's
 * trouble in plain words, else the error's own words — never its `[code]`,
 * details or hint, which go to the console (`errorMessage`).
 */
export function friendlyMessage(err: unknown): string {
  return networkTrouble(err) ?? ownWords(err);
}

/**
 * What a Supabase sign-in, sign-up, reset or new password error means, in
 * words a grown-up can act on (#130 S6). Matched by the error's `code` first,
 * then its words (older servers send no code); anything else falls back to
 * `friendlyMessage`. Log `errorMessage(err)` beside it.
 */
export function authErrorMessage(err: unknown): string {
  const net = networkTrouble(err);
  if (net) return net;
  const o = (typeof err === 'object' && err !== null ? err : {}) as Record<string, unknown>;
  const code = typeof o.code === 'string' ? o.code : '';
  const words = ownWords(err);
  const is = (codes: string[], pattern: RegExp) => codes.includes(code) || pattern.test(words);

  if (is(['invalid_credentials'], /invalid login credentials/i)) {
    return "That email and password don't match. Check them and try again, or tap \"Forgot password?\".";
  }
  if (is(['email_not_confirmed'], /email not confirmed/i)) {
    return 'Please confirm your email first: tap the link we sent you. Can\'t find it? Look in your spam or junk folder.';
  }
  if (is(['user_already_exists', 'email_exists'], /already (been )?registered|already exists/i)) {
    return 'There\'s already an account with that email. Sign in instead, or tap "Forgot password?".';
  }
  if (is(['same_password'], /should be different from the old/i)) {
    return "That's the password you have now. Choose a new one.";
  }
  if (is(['weak_password'], /password should|password is too weak|weak password/i)) {
    return `That password is too easy to guess. Use at least ${MIN_PASSWORD_LENGTH} characters, with letters and numbers.`;
  }
  if (is(['over_email_send_rate_limit', 'over_request_rate_limit', 'over_sms_send_rate_limit'], /rate limit|too many requests|only request this after/i) || o.status === 429) {
    const secs = words.match(/after (\d+) seconds?/i)?.[1];
    return secs ? `Too many tries for now. Please wait ${secs} seconds, then try again.` : 'Too many tries for now. Please wait a minute, then try again.';
  }
  if (is(['email_address_invalid'], /invalid format|email address.*invalid|valid email/i)) {
    return "That email address doesn't look right. Check it and try again.";
  }
  if (is(['session_not_found', 'session_expired', 'otp_expired', 'flow_state_expired'], /session missing|expired/i)) {
    return 'That link has run out. Go back to sign in and ask for a new one.';
  }
  if (is(['signup_disabled'], /signups not allowed/i)) {
    return 'New accounts are paused right now. Please try again later.';
  }
  return friendlyMessage(err);
}
