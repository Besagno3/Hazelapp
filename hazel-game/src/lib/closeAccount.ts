import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { passwordCheckClient, supabase } from './supabase';
import { errorMessage, NETWORK_MESSAGE, OFFLINE_MESSAGE, TROUBLE_MESSAGE } from './errors';
import { PRIVACY_IS_DRAFT } from '../content/family';
import { deviceSessionId, openGrownUpsWith } from './grownUps';
import {
  CLOSE_ACCOUNT_ERRORS,
  CONFIRM_WORD,
  type CloseAccountError,
} from '../../supabase/functions/_shared/closeAccount';

/**
 * Closing a whole account from 👪 Grown-ups (#124b): the password checked by
 * signing in again from this browser, the request to the `delete-account`
 * edge function, what its refusals mean in plain words, and the line the
 * sign-in page shows afterwards. The function checks the confirm word and
 * that the password was typed just now (the fresh sign-in on the token it's
 * sent); this module never decides.
 */

export { CONFIRM_WORD };

/** The grown-up typed the confirm word (any case, spaces round it ignored). */
export function confirmTyped(typed: string): boolean {
  return typed.trim().toUpperCase() === CONFIRM_WORD;
}

/**
 * Why closing didn't happen: one of the function's refusals, the password
 * check's (`wrong_password` … `trouble`, nothing sent to the function yet),
 * or a request whose answer never came (`lost_touch`).
 */
export type CloseFailureCode =
  | CloseAccountError
  | 'password_required'
  | 'no_password_login'
  | 'wrong_password'
  | 'too_many_tries'
  | 'password_check_failed'
  | 'offline'
  | 'network'
  | 'trouble'
  | 'lost_touch';

/** Thrown by `requestCloseAccount`: `message` is what to show, `log` the whole story. */
export class CloseAccountFailure extends Error {
  readonly code: CloseFailureCode;
  readonly log: string;
  constructor(code: CloseFailureCode, log: string) {
    super(closeAccountMessage(code));
    this.name = 'CloseAccountFailure';
    this.code = code;
    this.log = log;
  }
}

const NOTHING_DELETED = 'Nothing was deleted.';
const SAFE_AGAIN = 'tap "Close account for good" again — it\'s safe to repeat.';

/**
 * What each refusal means for the grown-up, and what to do — plain and
 * specific, and true however it came about: "Nothing was deleted" only where
 * this try deleted nothing; a lost answer says we can't tell.
 */
export function closeAccountMessage(code: CloseFailureCode): string {
  switch (code) {
    case 'password_required':
      return 'Enter your password to close your account.';
    case 'confirm_required':
      return `Type ${CONFIRM_WORD} in the box to confirm.`;
    case 'wrong_password':
      return `That password isn't right. Check it and try again. ${NOTHING_DELETED}`;
    case 'too_many_tries':
      return `Too many password tries. Wait a few minutes, then try again. ${NOTHING_DELETED}`;
    case 'password_check_failed':
      return `We couldn't check your password just now. ${NOTHING_DELETED} Please try again in a few minutes.`;
    case 'no_password_login':
      // The notice's contact address is a placeholder while it's a draft (#124a): no pointing at it.
      return PRIVACY_IS_DRAFT
        ? `This account has no password to check, so it can't be closed here. ${NOTHING_DELETED}`
        : `This account has no password to check, so it can't be closed here. Email us (see the privacy notice) and we'll close it. ${NOTHING_DELETED}`;
    case 'offline':
      return `${OFFLINE_MESSAGE} ${NOTHING_DELETED}`;
    case 'network':
      return `${NETWORK_MESSAGE} ${NOTHING_DELETED}`;
    case 'trouble':
      return `${TROUBLE_MESSAGE} ${NOTHING_DELETED}`;
    case 'grown_ups_locked':
      return `Grown-ups locked again. Enter your PIN or password, then tap "Close account for good" again. ${NOTHING_DELETED}`;
    case 'not_signed_in':
    case 'reauth_required':
      return `We couldn't confirm it's you just now. Tap "Close account for good" to try again. ${NOTHING_DELETED}`;
    case 'lost_touch':
      return `We lost touch with Hazel Quest, so we can't tell if your account was closed. Check your internet, then ${SAFE_AGAIN}`;
    case 'outcome_unknown':
      return `We couldn't tell if your account was closed. To make sure, ${SAFE_AGAIN}`;
    case 'login_not_deleted':
      return 'Your players and their games are deleted, but the login itself is still here. Tap "Close account for good" again to finish.';
    case 'already_closed':
      return ACCOUNT_CLOSED_MESSAGE;
    default:
      // data_not_deleted, auth_unavailable, server_config, bad_request, method_not_allowed…
      return `We couldn't close your account just now. ${NOTHING_DELETED} Please try again in a few minutes.`;
  }
}

function isRefusal(x: unknown): x is CloseAccountError {
  return typeof x === 'string' && (CLOSE_ACCOUNT_ERRORS as readonly string[]).includes(x);
}

/** What went wrong signing in again: nothing has been sent to the function yet. */
export function signInFailure(err: unknown): CloseAccountFailure {
  const log = `signing in again: ${errorMessage(err)}`;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new CloseAccountFailure('offline', log);
  const o = (typeof err === 'object' && err !== null ? err : {}) as { name?: unknown; status?: unknown; code?: unknown; message?: unknown };
  const status = typeof o.status === 'number' ? o.status : 0;
  const words = `${typeof o.code === 'string' ? o.code : ''} ${typeof o.message === 'string' ? o.message : ''}`;
  if (o.name === 'AuthRetryableFetchError') return new CloseAccountFailure(status >= 500 ? 'trouble' : 'network', log);
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(words)) return new CloseAccountFailure('network', log);
  if (/invalid_credentials|invalid login credentials/i.test(words)) return new CloseAccountFailure('wrong_password', log);
  if (status === 429 || /rate limit|too many/i.test(words)) return new CloseAccountFailure('too_many_tries', log);
  if (status >= 500) return new CloseAccountFailure('trouble', log);
  return new CloseAccountFailure('password_check_failed', log);
}

/** What went wrong asking the function: its own refusal code when it sent one (read from its JSON body). */
export async function closeFailure(err: unknown): Promise<CloseAccountFailure> {
  if (err instanceof FunctionsHttpError) {
    const res = err.context as Response;
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      // Not JSON (a gateway page): judged by the status below.
    }
    const said = [body.error, body.detail ?? body.message].filter((v) => typeof v === 'string' && v).join(' — ');
    const log = `delete-account ${res.status}: ${said || errorMessage(err)}`;
    if (isRefusal(body.error)) return new CloseAccountFailure(body.error, log);
    // The gateway's own refusal of a dead token ({"code":401,"message":"Invalid JWT"}): the function never ran.
    if (res.status === 401) return new CloseAccountFailure('not_signed_in', log);
    // A gateway's 5xx may have come after the function ran; a 4xx means it never did.
    return new CloseAccountFailure(res.status >= 500 ? 'outcome_unknown' : 'bad_request', log);
  }
  // The request went out and no answer came back: it may have run.
  if (err instanceof FunctionsFetchError) return new CloseAccountFailure('lost_touch', errorMessage(err));
  return new CloseAccountFailure('outcome_unknown', errorMessage(err));
}

/**
 * After a refused password: is the login itself gone? A close that finished
 * on the server but whose answer was lost leaves this tab signed in to a
 * login that no longer exists, and signing in again then reads as a wrong
 * password — this tells the two apart.
 */
async function loginIsGone(): Promise<boolean> {
  try {
    const { error } = await supabase.auth.getUser();
    const o = (error ?? {}) as { code?: unknown; message?: unknown };
    return o.code === 'user_not_found' || /user from sub claim in jwt does not exist/i.test(String(o.message ?? ''));
  } catch {
    return false;
  }
}

/**
 * Close the signed-in grown-up's account: sign in again with `password`
 * (from this browser, so the auth service's sign-in limit is this device's
 * own), then ask the function with that fresh sign-in. The sign-in is made
 * on `passwordCheckClient`, which keeps nothing — it never lands in this
 * device's storage or other tabs, so no try leaves a session that could
 * close the account later — and it's signed out again unless the close went
 * through, when the login and its sessions are gone anyway (#124b review
 * round 2). Resolves once the family and the login are gone —
 * `alreadyClosed` when they already were — and throws a
 * `CloseAccountFailure` otherwise.
 */
export async function requestCloseAccount(email: string, password: string): Promise<{ kids: number; alreadyClosed: boolean }> {
  if (!email) throw new CloseAccountFailure('no_password_login', 'this login has no email to sign in with');
  const check = passwordCheckClient().auth;
  let signedIn: Awaited<ReturnType<typeof check.signInWithPassword>>;
  try {
    signedIn = await check.signInWithPassword({ email, password });
  } catch (err) {
    throw signInFailure(err);
  }
  if (signedIn.error) {
    const failure = signInFailure(signedIn.error);
    if (failure.code === 'wrong_password' && (await loginIsGone())) return { kids: 0, alreadyClosed: true };
    throw failure;
  }
  const token = signedIn.data.session?.access_token;
  let closed = false;
  try {
    if (!token) throw new CloseAccountFailure('password_check_failed', 'signing in again gave no session');
    // The function deletes nothing unless 👪 Grown-ups is open on this
    // device's sign-in (#167): name it, and — the password having just been
    // typed — open it for the window first (best effort: if this fails, the
    // function's refusal says so and the gate is asked for).
    const session = await deviceSessionId();
    try {
      if (session) await openGrownUpsWith(passwordCheckClient(), session);
    } catch (err) {
      console.warn('Opening 👪 Grown-ups before closing:', errorMessage(err));
    }
    let result: Awaited<ReturnType<typeof supabase.functions.invoke>>;
    try {
      result = await supabase.functions.invoke('delete-account', {
        body: { confirm: CONFIRM_WORD, session },
        // This sign-in's own token: its `amr` says the password was typed just now.
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      throw await closeFailure(err);
    }
    if (result.error) {
      const failure = await closeFailure(result.error);
      if (failure.code === 'already_closed') {
        closed = true;
        return { kids: 0, alreadyClosed: true };
      }
      throw failure;
    }
    const data = (result.data ?? {}) as { ok?: unknown; kids?: unknown };
    if (data.ok !== true) throw new CloseAccountFailure('outcome_unknown', `delete-account answered without ok: ${errorMessage(data)}`);
    closed = true;
    return { kids: typeof data.kids === 'number' ? data.kids : 0, alreadyClosed: false };
  } finally {
    // Not kept a moment longer than it's needed (and never waited on: the answer is what matters).
    if (!closed) {
      void check.signOut({ scope: 'local' }).then(
        ({ error }) => error && console.warn('Signing out the password check:', errorMessage(error)),
        (err: unknown) => console.warn('Signing out the password check:', errorMessage(err)),
      );
    }
  }
}

/** The line the sign-in page shows once the account is closed. */
export const ACCOUNT_CLOSED_MESSAGE = 'Your account and all its data are gone.';

const CLOSED_KEY = 'hazel-account-closed';
let closedHere = false;

/** The account was just closed: the sign-in page says so, once. */
export function noteAccountClosed(): void {
  closedHere = true;
  try {
    sessionStorage.setItem(CLOSED_KEY, '1');
  } catch {
    // Private mode: this page still remembers.
  }
}

/** The sign-in page's line after closing an account, once (null any other time). */
export function takeAccountClosedNotice(): string | null {
  let stored = false;
  try {
    stored = sessionStorage.getItem(CLOSED_KEY) === '1';
    sessionStorage.removeItem(CLOSED_KEY);
  } catch {
    // Storage unavailable — the page's own memory is enough.
  }
  const was = closedHere || stored;
  closedHere = false;
  return was ? ACCOUNT_CLOSED_MESSAGE : null;
}
