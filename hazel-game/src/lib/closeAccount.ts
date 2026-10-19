import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { errorMessage, NETWORK_MESSAGE, OFFLINE_MESSAGE, TROUBLE_MESSAGE } from './errors';
import {
  CLOSE_ACCOUNT_ERRORS,
  CONFIRM_WORD,
  type CloseAccountError,
} from '../../supabase/functions/_shared/closeAccount';

/**
 * Closing a whole account from 👪 Grown-ups (#124b): the request to the
 * `delete-account` edge function, what its refusals mean in plain words, and
 * the line the sign-in page shows afterwards. The function checks the
 * password and the confirm word itself; this module never decides.
 */

export { CONFIRM_WORD };

/** The grown-up typed the confirm word (any case, spaces round it ignored). */
export function confirmTyped(typed: string): boolean {
  return typed.trim().toUpperCase() === CONFIRM_WORD;
}

/** Why closing didn't happen: one of the function's refusals, or the connection's. */
export type CloseFailureCode = CloseAccountError | 'offline' | 'network' | 'trouble' | 'unknown';

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

/** What each refusal means for the grown-up, and what to do — plain and specific. */
export function closeAccountMessage(code: CloseFailureCode): string {
  switch (code) {
    case 'wrong_password':
      return `That password isn't right. Check it and try again. ${NOTHING_DELETED}`;
    case 'too_many_tries':
      return `Too many password tries. Wait a minute, then try again. ${NOTHING_DELETED}`;
    case 'password_required':
      return 'Enter your password to close your account.';
    case 'confirm_required':
      return `Type ${CONFIRM_WORD} in the box to confirm.`;
    case 'not_signed_in':
      return `Your sign-in ran out. Sign in again, then come back here to close your account. ${NOTHING_DELETED}`;
    case 'no_password_login':
      return `This account has no password to check, so it can't be closed here. Email us (see the privacy notice) and we'll close it. ${NOTHING_DELETED}`;
    case 'login_not_deleted':
      return 'Your players and their games are deleted, but the login itself is still here. Tap "Close account for good" again to finish.';
    case 'offline':
      return OFFLINE_MESSAGE;
    case 'network':
      return NETWORK_MESSAGE;
    case 'trouble':
      return TROUBLE_MESSAGE;
    default:
      // data_not_deleted, password_check_failed, server_config, bad_request, unknown…
      return `We couldn't close your account just now. ${NOTHING_DELETED} Please try again in a few minutes.`;
  }
}

function isRefusal(x: unknown): x is CloseAccountError {
  return typeof x === 'string' && (CLOSE_ACCOUNT_ERRORS as readonly string[]).includes(x);
}

/** What went wrong with an invoke: the function's own refusal code when it sent one (read from its JSON body). */
export async function closeFailure(err: unknown): Promise<CloseAccountFailure> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new CloseAccountFailure('offline', errorMessage(err));
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
    // The gateway's own refusal of a dead token ({"code":401,"message":"Invalid JWT"}).
    if (res.status === 401) return new CloseAccountFailure('not_signed_in', log);
    return new CloseAccountFailure(res.status >= 500 ? 'trouble' : 'unknown', log);
  }
  if (err instanceof FunctionsFetchError) return new CloseAccountFailure('network', errorMessage(err));
  if (err instanceof FunctionsRelayError) return new CloseAccountFailure('trouble', errorMessage(err));
  return new CloseAccountFailure('unknown', errorMessage(err));
}

/**
 * Ask the server to close the signed-in grown-up's account. Resolves once the
 * family and the login are gone; throws a `CloseAccountFailure` otherwise.
 */
export async function requestCloseAccount(password: string): Promise<{ kids: number }> {
  let result: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    result = await supabase.functions.invoke('delete-account', { body: { password, confirm: CONFIRM_WORD } });
  } catch (err) {
    throw await closeFailure(err);
  }
  if (result.error) throw await closeFailure(result.error);
  const data = (result.data ?? {}) as { ok?: unknown; kids?: unknown };
  if (data.ok !== true) throw new CloseAccountFailure('unknown', `delete-account answered without ok: ${errorMessage(data)}`);
  return { kids: typeof data.kids === 'number' ? data.kids : 0 };
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
