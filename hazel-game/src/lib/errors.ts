import { FunctionsHttpError } from '@supabase/supabase-js';

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
/** The service answered, but with its own trouble (a 5xx): nothing the grown-up's connection can fix. */
export const TROUBLE_MESSAGE = 'Hazel Quest is having trouble right now — please try again in a few minutes.';
/** Supabase couldn't send an email (its mail server refused, or isn't set up for this address). */
export const SEND_FAILED_MESSAGE = "We couldn't send the email just now. Please try again in a few minutes.";

/** The error's `code`, when it has one (a Supabase error does). */
function codeOf(err: unknown): string {
  const code = typeof err === 'object' && err !== null ? (err as Record<string, unknown>).code : undefined;
  return typeof code === 'string' ? code : '';
}

/** The error's `name` (an auth-js error class: `AuthApiError`, `AuthUnknownError`…). */
function nameOf(err: unknown): string {
  const name = typeof err === 'object' && err !== null ? (err as Record<string, unknown>).name : undefined;
  return typeof name === 'string' ? name : '';
}

/** The error's `status`, when it has a number for one. */
function statusOf(err: unknown): number {
  const status = typeof err === 'object' && err !== null ? (err as Record<string, unknown>).status : undefined;
  return typeof status === 'number' ? status : 0;
}

/**
 * The connection failed — offline, or a fetch that never reached the server —
 * or the service is down: supabase-js turns a 502/503/504 into an
 * `AuthRetryableFetchError` carrying that status (and a fetch that never got
 * an answer into one with status 0), and "check your internet" would be wrong.
 * Any other failed answer that isn't JSON — Cloudflare's 520/522/524 page, a
 * proxy's HTML 500 — becomes an `AuthUnknownError` holding the JSON parser's
 * words ("Unexpected token '<'…"): the service's trouble too.
 */
function networkTrouble(err: unknown): string | null {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return OFFLINE_MESSAGE;
  const name = nameOf(err);
  if (name === 'AuthRetryableFetchError') return statusOf(err) >= 500 ? TROUBLE_MESSAGE : NETWORK_MESSAGE;
  const words = ownWords(err);
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(words)) return NETWORK_MESSAGE;
  // (Chrome's, Firefox's and Safari's parser words.)
  if (name === 'AuthUnknownError' || /is not valid JSON|in JSON at position|unexpected end of JSON|JSON\.parse:|JSON Parse error/i.test(words)) return TROUBLE_MESSAGE;
  return null;
}

/**
 * A message for a kid's or grown-up's screen (#130 S6): the connection's or
 * the server's trouble in plain words, else the error's own words — never its
 * `[code]`, details or hint, which go to the console (`errorMessage`).
 */
export function friendlyMessage(err: unknown): string {
  return networkTrouble(err) ?? (statusOf(err) >= 500 ? TROUBLE_MESSAGE : ownWords(err));
}

/**
 * Where an auth error is shown — the screen, or the part of it that asked —
 * so its words only point at what's there, and an error nobody mapped still
 * says what didn't happen: the 👪 Grown-ups gate has no email field and its
 * link reads "Forgot it?"; sign-up hides "Forgot password?"; the reset page's
 * way back is its own button. `forgot` asks for a reset link (sign-in's
 * Forgot password, the gate's "Forgot it?"), `resend` sends a confirmation
 * link again, `link` is an email link that came back with an error.
 * `password` is what was typed, so a password rule can name what it's missing.
 */
export type AuthWhere = 'sign-in' | 'sign-up' | 'gate' | 'reset' | 'forgot' | 'resend' | 'link';
export interface AuthErrorContext {
  where?: AuthWhere;
  password?: string;
}

/** The sign-in itself ran out: words for any screen but the reset page (where it's the link that did). */
export const SIGNED_OUT_MESSAGE = 'Your sign-in ran out — please sign in again.';

/**
 * An error no mapping knows, by what was being done (#130 S6 review round 2):
 * the server's own words are often jargon ("invalid JWT: unable to parse…"),
 * and a bare "something went wrong" says nothing. The raw error goes to the
 * console (`errorMessage`).
 */
const NOT_DONE: Record<AuthWhere, string> = {
  'sign-in': "We couldn't sign you in just now. Please try again in a few minutes.",
  'sign-up': "We couldn't make your account just now. Please try again in a few minutes.",
  gate: "We couldn't check your password just now. Please try again in a few minutes.",
  reset: "We couldn't save your new password just now. Please try again in a few minutes.",
  forgot: "We couldn't send a reset link just now. Please try again in a few minutes.",
  resend: "We couldn't send the link again just now. Please try again in a few minutes.",
  link: 'That email link didn\'t work. Sign in to get a new one, or tap "Forgot password?".',
};

const RATE_LIMIT_CODES = ['over_email_send_rate_limit', 'over_request_rate_limit', 'over_sms_send_rate_limit'];

/** Too many requests: which limit, and how long it said to wait. Null when it isn't one. */
function rateLimit(err: unknown): { secs: number | null; emailCap: boolean } | null {
  const code = codeOf(err);
  const words = ownWords(err);
  if (!(RATE_LIMIT_CODES.includes(code) || /rate limit|too many requests|only request this after/i.test(words) || statusOf(err) === 429)) return null;
  const secs = words.match(/after (\d+) seconds?/i)?.[1];
  // No wait in it: the project's hourly email cap ("email rate limit exceeded";
  // Supabase's own mail server sends a few an hour), not one address's minute.
  // GoTrue rounds the wait down, so its last second reads "after 0 seconds":
  // at least 1, so the words and the countdown agree.
  if (secs !== undefined) return { secs: Math.max(1, Number(secs)), emailCap: false };
  return { secs: null, emailCap: code === 'over_email_send_rate_limit' || /email rate limit/i.test(words) };
}

/** "1 second", "12 seconds". */
function seconds(n: number): string {
  return `${n} ${n === 1 ? 'second' : 'seconds'}`;
}

/**
 * How many seconds before asking again can work, when an auth error is a rate
 * limit with a wait in it: the "after N seconds" it named, or a minute for a
 * request limit. Null for anything else — including the hourly email cap,
 * which a countdown would only promise falsely (#146 review).
 */
export function authRetryAfter(err: unknown): number | null {
  const limit = rateLimit(err);
  if (!limit || limit.emailCap) return null;
  return limit.secs ?? 60;
}

/**
 * The sign-in itself is gone: an access token that ran out or doesn't check
 * (`bad_jwt`), a refresh token used up or unknown, the session ended
 * (`session_not_found`, which supabase-js reports as "Auth session
 * missing!"). Not a wrong password, and not an email link.
 */
export function sessionRanOut(err: unknown): boolean {
  return (
    ['bad_jwt', 'no_authorization', 'refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'session_expired'].includes(codeOf(err)) ||
    ['AuthSessionMissingError', 'AuthInvalidJwtError'].includes(nameOf(err)) ||
    /invalid jwt|jwt expired|token is expired|invalid refresh token|refresh token not found|auth session missing|session expired/i.test(ownWords(err))
  );
}

/**
 * The link in an email ran out (or was used already): ask for a new one. On
 * the reset page (`where: 'reset'`) the session the reset link signed in with
 * running out is that too.
 */
export function isExpiredLink(err: unknown, { where }: AuthErrorContext = {}): boolean {
  // Not any "expired": a JWT's "token is expired" isn't a link that ran out.
  return (
    ['otp_expired', 'flow_state_expired'].includes(codeOf(err)) ||
    /email link is invalid or has expired|token has expired or is invalid/i.test(ownWords(err)) ||
    (where === 'reset' && sessionRanOut(err))
  );
}

/** "a, b and c". */
function andList(items: string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The character kinds a password rule asks for ("Password should contain at
 * least one character of each: abc…z, ABC…Z, 0123456789, !@#…"), as words —
 * only the ones `password` is missing, when it's known.
 */
function missingKinds(words: string, password?: string): string[] {
  const list = words.match(/at least one character of each:\s*(.*)$/i)?.[1];
  if (!list) return [];
  // Up to the next sentence (a leaked-password line can follow), less the full stop.
  const sets = list.split(/\.\s+(?=[A-Z])/)[0].replace(/\.$/, '').split(', ').filter(Boolean);
  const kinds = sets.map((set) => ({
    set,
    kind: /[a-z]/.test(set) && /[A-Z]/.test(set)
      ? 'a letter'
      : /[a-z]/.test(set)
        ? 'a small letter'
        : /[A-Z]/.test(set)
          ? 'a capital letter'
          : /[0-9]/.test(set)
            ? 'a number'
            : 'a symbol (like ! or ?)',
  }));
  const missing = password === undefined ? kinds : kinds.filter(({ set }) => ![...set].some((ch) => password.includes(ch)));
  return (missing.length > 0 ? missing : kinds).map((k) => k.kind);
}

/**
 * Why the server refused a password, in words that say what to change
 * (#130 S6 review): the form already holds to `MIN_PASSWORD_LENGTH`, so this
 * only comes back when the project's rule is stricter — a longer minimum,
 * kinds of character, or a password known from a data leak.
 */
function weakPasswordMessage(err: unknown, password?: string): string {
  const o = (typeof err === 'object' && err !== null ? err : {}) as Record<string, unknown>;
  const words = ownWords(err);
  const reasons = Array.isArray(o.reasons) ? o.reasons : [];
  const length = words.match(/at least (\d+) characters/i)?.[1];
  const needs = andList(missingKinds(words, password));
  const pwned = reasons.includes('pwned') || /known to be weak|pwned|data leak|breach/i.test(words);
  const rule = length && needs ? `Use at least ${length} characters, with ${needs}.` : length ? `Use at least ${length} characters.` : needs ? `It needs ${needs}.` : '';
  if (pwned) return ['That password has shown up in a data leak. Choose a different one.', rule].filter(Boolean).join(' ');
  if (length && needs) return `That password is too easy to guess. ${rule}`;
  if (length) return `That password is too short. ${rule}`;
  if (needs) return `That password needs ${needs}.`;
  // A rule we don't know (a custom password check): its own words, tidied.
  const own = words.trim().replace(/^\w/, (c) => c.toUpperCase());
  return own ? (/[.!?]$/.test(own) ? own : `${own}.`) : 'That password is too easy to guess. Choose a different one.';
}

/**
 * What a Supabase sign-in, sign-up, reset or new password error means, in
 * words a grown-up can act on (#130 S6), pointing only at what `where` has on
 * screen. Matched by the error's `code` first, then its words (older servers
 * send no code); anything else says what couldn't be done (`NOT_DONE`). Log
 * `errorMessage(err)` beside it.
 */
export function authErrorMessage(err: unknown, { where = 'sign-in', password }: AuthErrorContext = {}): string {
  const net = networkTrouble(err);
  if (net) return net;
  const code = codeOf(err);
  const words = ownWords(err);
  const is = (codes: string[], pattern: RegExp) => codes.includes(code) || pattern.test(words);

  if (is(['invalid_credentials'], /invalid login credentials/i)) {
    return where === 'gate'
      ? 'That password isn\'t right. Try again, or tap "Forgot it?" below.'
      : "That email and password don't match. Check them and try again, or tap \"Forgot password?\".";
  }
  if (is(['email_not_confirmed'], /email not confirmed/i)) {
    return 'Please confirm your email first: tap the link we sent you. Can\'t find it? Look in your spam or junk folder.';
  }
  if (is(['user_already_exists', 'email_exists'], /already (been )?registered|already exists/i)) {
    return where === 'sign-up'
      ? 'There\'s already an account with that email. Tap "Sign in" below instead.'
      : 'There\'s already an account with that email. Sign in instead, or tap "Forgot password?".';
  }
  if (is(['same_password'], /should be different from the old/i)) {
    return "That's the password you have now. Choose a new one.";
  }
  if (is(['weak_password'], /password should|password is too weak|weak password|known to be weak/i)) {
    return weakPasswordMessage(err, password);
  }
  const limit = rateLimit(err);
  if (limit) {
    if (limit.secs !== null) return `Too many tries for now. Please wait ${seconds(limit.secs)}, then try again.`;
    // Only a resend has sent a link before; sign-up and a reset link's first ask have sent nothing.
    if (limit.emailCap) {
      return where === 'resend'
        ? "We've sent a lot of emails just now. Please try again in about an hour (and check spam for the last one)."
        : "We can't send more emails right now. Please try again in about an hour.";
    }
    return 'Too many tries for now. Please wait a minute, then try again.';
  }
  if (is(['email_address_invalid'], /invalid format|email address.*invalid|valid email/i)) {
    return "That email address doesn't look right. Check it and try again.";
  }
  if (isExpiredLink(err, { where })) {
    return where === 'reset'
      ? 'That link has run out. Tap "Back to sign in", then "Forgot password?" for a new one.'
      : 'That email link has run out. Sign in to get a new one, or tap "Forgot password?".';
  }
  if (sessionRanOut(err)) return SIGNED_OUT_MESSAGE;
  if (is(['signup_disabled'], /signups not allowed/i)) {
    return 'New accounts are paused right now. Please try again later.';
  }
  // The mail server refused ("Error sending confirmation email", or an address
  // Supabase's own mail server won't send to).
  if (is(['email_address_not_authorized'], /error sending .*email|cannot be used as it is not authorized/i)) {
    return SEND_FAILED_MESSAGE;
  }
  // Supabase's own failure ("Database error saving new user"): not the grown-up's to fix.
  if (code === 'unexpected_failure' || statusOf(err) >= 500) return TROUBLE_MESSAGE;
  return NOT_DONE[where];
}
