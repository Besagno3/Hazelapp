/**
 * Closing a whole account (#124b): the request the app sends and the refusals
 * the `delete-account` function answers with, plus the checks it runs on the
 * caller's token. The canonical, tested copy of the block between the markers
 * below; `delete-account/index.ts` keeps an identical copy INLINE (edge
 * functions stay single-file, #67), and `src/lib/closeAccount.test.ts` fails
 * if the two ever differ. The app imports `CONFIRM_WORD` and the refusal
 * codes from here.
 *
 * Deliberately dependency-free: imported by vitest through this file.
 */

// --- close-account:start (identical in delete-account/index.ts)
/** The word the grown-up types to confirm. The app asks for it; the function checks it too. */
export const CONFIRM_WORD = 'DELETE';

/**
 * How recently the caller must have typed their password (seconds). The app
 * signs in again with it right before it asks — from the grown-up's own
 * browser, so the auth service's sign-in limit counts that device, never
 * every family at once (#124b review), and on a client that keeps nothing,
 * so that sign-in never lands on the device — and the function checks that
 * fresh sign-in on the token it's sent. It never sees the password. A minute:
 * the app asks within a second of signing in. A grown-up's ordinary sign-in
 * on the family device is fresh for that minute too, but `delete_family`
 * takes only a password check the database itself recorded opening the
 * named session (`callerSessionOf`, #167 review rounds 1–2).
 */
export const REAUTH_WINDOW_S = 60;
/** Clock drift allowed between the auth service and the function (seconds). */
export const CLOCK_SLACK_S = 60;

/** Why the function didn't close the account: the `error` in its JSON answer. */
export const CLOSE_ACCOUNT_ERRORS = [
  'method_not_allowed',
  'server_config',
  'not_signed_in',
  'auth_unavailable',
  'already_closed',
  'bad_request',
  'confirm_required',
  'reauth_required',
  'grown_ups_locked',
  'password_changed',
  'database_out_of_date',
  'data_not_deleted',
  'login_not_deleted',
  'outcome_unknown',
] as const;
export type CloseAccountError = (typeof CLOSE_ACCOUNT_ERRORS)[number];

/** A refusal: the HTTP status, the code, and a plain sentence for the logs. */
export interface CloseAccountRefusal {
  status: number;
  error: CloseAccountError;
  detail: string;
}

const REFUSALS: Record<CloseAccountError, Omit<CloseAccountRefusal, 'error'>> = {
  method_not_allowed: { status: 405, detail: 'Only POST closes an account.' },
  server_config: { status: 500, detail: 'The server is missing its Supabase settings.' },
  not_signed_in: { status: 401, detail: 'Sign in to close your account.' },
  auth_unavailable: { status: 503, detail: "The sign-in couldn't be checked just now. Nothing was deleted." },
  already_closed: { status: 410, detail: 'This account is already closed.' },
  bad_request: { status: 400, detail: 'The request was not understood.' },
  confirm_required: { status: 400, detail: `Type ${CONFIRM_WORD} to confirm.` },
  reauth_required: { status: 403, detail: 'Type your password again, just before closing the account.' },
  grown_ups_locked: {
    status: 403,
    detail: 'Open 👪 Grown-ups again with your grown-up PIN or password, then close the account. Nothing was deleted.',
  },
  password_changed: {
    status: 403,
    detail:
      "The password was changed recently without a check, so it can't close the account until the wait ends (`until`). Nothing was deleted.",
  },
  database_out_of_date: {
    status: 503,
    detail: 'The database needs updating (migrations 0023 + 0024) before an account can be closed. Nothing was deleted.',
  },
  data_not_deleted: { status: 500, detail: 'Nothing was deleted: the family data could not be removed.' },
  login_not_deleted: {
    status: 500,
    detail: "The family's data is gone, but the login could not be removed. Try again to finish.",
  },
  outcome_unknown: { status: 502, detail: 'A reply was lost, so the close may or may not have finished. Try again to finish.' },
};

export function refusal(error: CloseAccountError): CloseAccountRefusal {
  return { error, ...REFUSALS[error] };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The request body, checked: the confirm word, and — when it names one — the
 * device's sign-in as a session id (null when it's all right).
 */
export function closeRequestRefusal(body: unknown): CloseAccountRefusal | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return refusal('bad_request');
  const b = body as Record<string, unknown>;
  if (b.session !== undefined && b.session !== null && !(typeof b.session === 'string' && UUID_RE.test(b.session))) {
    return refusal('bad_request');
  }
  return b.confirm === CONFIRM_WORD ? null : refusal('confirm_required');
}

/**
 * The sign-in (session id) the app says has 👪 Grown-ups open — the family
 * device's, where Close account was asked for. `delete_family` deletes
 * nothing unless it's open (migration 0024, #167); null when none is named,
 * which it refuses too.
 */
export function closeSessionOf(body: unknown): string | null {
  const s = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).session : null;
  return typeof s === 'string' && UUID_RE.test(s) ? s : null;
}

/** The database's "👪 Grown-ups is shut" (SQLSTATE HQ001, migration 0024): nothing was deleted. */
export const GROWN_UPS_LOCKED_SQLSTATE = 'HQ001';

export function grownUpsLockedDb(err: { code?: string | null }): boolean {
  return err.code === GROWN_UPS_LOCKED_SQLSTATE;
}

/**
 * The database's "that wasn't a password typed just now" (SQLSTATE HQ002,
 * migration 0024): `delete_family` refuses a close asked by any sign-in it
 * didn't record as the password check that opened the named session — the
 * family device's own, however fresh its token, included (#167 review
 * rounds 1–2). Nothing was deleted.
 */
export const GROWN_UPS_REAUTH_SQLSTATE = 'HQ002';

export function reauthRequiredDb(err: { code?: string | null }): boolean {
  return err.code === GROWN_UPS_REAUTH_SQLSTATE;
}

/**
 * The database's "the password was changed without a check" (HQ002 with
 * `password_changed`, migration 0024, #167 review round 2): for a day that
 * password can't close the account. Its DETAIL is when the wait ends (an ISO
 * time). Nothing was deleted.
 */
export function passwordWaitDb(err: { code?: string | null; message?: string | null }): boolean {
  return err.code === GROWN_UPS_REAUTH_SQLSTATE && /^password_changed\b/.test(err.message ?? '');
}

/**
 * The sign-in (session id) the caller's token belongs to — the password
 * check the app made just now. `delete_family` takes only one it recorded
 * opening the named session (`p_caller`), so the device's own fresh sign-in
 * can't close the account; null when the token names none, which it refuses
 * too.
 */
export function callerSessionOf(claims: Record<string, unknown> | null): string | null {
  const s = claims?.session_id;
  return typeof s === 'string' && UUID_RE.test(s) ? s : null;
}

/** The database is older than this function: `delete_family(p_parent, p_session, p_caller)` isn't there (PostgREST's code, or Postgres's). */
export function functionMissingDb(err: { code?: string | null; message?: string | null }): boolean {
  return err.code === 'PGRST202' || err.code === '42883';
}

/**
 * The claims in a sign-in token, read without checking its signature — call
 * it only on a token the auth service has just accepted (`auth.getUser`).
 */
export function jwtClaims(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json: unknown = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Method names that mean a password: Supabase's own, and RFC 8176's. */
const PASSWORD_METHODS = ['password', 'pwd'];

/**
 * Whether the caller typed their password just now (within
 * `REAUTH_WINDOW_S`). Supabase lists how a session signed in under `amr` —
 * `[{ method: 'password', timestamp }]`, in seconds — and keeps it through
 * token refreshes, so a refreshed token still shows the sign-in's own time.
 * Another method (a magic link, a refresh of an old session) isn't a fresh
 * password. A custom hook that sends bare method names must name a password,
 * and then the login's last sign-in (`last_sign_in_at`) must be just now; a
 * token with no `amr` at all says nothing about how it signed in, so it's
 * refused (#124b review round 2). Never `iat`, which every refresh renews.
 */
export function signedInFreshly(
  claims: Record<string, unknown> | null,
  lastSignInAt: string | null | undefined,
  nowS: number,
): boolean {
  const fresh = (at: number) => at <= nowS + CLOCK_SLACK_S && nowS - at <= REAUTH_WINDOW_S;
  const amr = claims?.amr;
  // No list at all: nothing says how this token signed in.
  if (!Array.isArray(amr) || amr.length === 0) return false;
  const entries = amr.filter(
    (e): e is Record<string, unknown> => typeof e === 'object' && e !== null && typeof (e as Record<string, unknown>).method === 'string',
  );
  if (entries.length > 0) {
    return entries.some((e) => e.method === 'password' && typeof e.timestamp === 'number' && fresh(e.timestamp));
  }
  if (!amr.some((m) => typeof m === 'string' && PASSWORD_METHODS.includes(m))) return false;
  const last = lastSignInAt ? Date.parse(lastSignInAt) / 1000 : NaN;
  return Number.isFinite(last) && fresh(last);
}

/** The token says nothing about how it signed in (no `amr` list, or an empty one): an auth set-up to log loudly. */
export function amrMissing(claims: Record<string, unknown> | null): boolean {
  const amr = claims?.amr;
  return !Array.isArray(amr) || amr.length === 0;
}

/**
 * A database call that failed WITH an answer — a Postgres error code (five
 * characters) or PostgREST's own (`PGRST…`) — was rolled back whole. No code
 * means the reply was lost: it may have run.
 */
export function dbCallRefused(err: { code?: string | null }): boolean {
  const code = err.code ?? '';
  return /^[0-9A-Z]{5}$/.test(code) || code.startsWith('PGRST');
}

/**
 * The auth service answered no, so it didn't do it: a 4xx, or a 500 / 501
 * of its own. A lost reply (no status) or a gateway's 502 / 503 / 504 may
 * have done it.
 */
export function authCallRefused(err: { status?: number }): boolean {
  const s = err.status ?? 0;
  return s >= 400 && s < 600 && ![502, 503, 504].includes(s);
}

/** The login doesn't exist (any more): another tab, or a reply that was lost, finished the close. */
export function loginGone(err: { status?: number; code?: string }): boolean {
  return err.status === 404 || err.code === 'user_not_found';
}
// --- close-account:end
