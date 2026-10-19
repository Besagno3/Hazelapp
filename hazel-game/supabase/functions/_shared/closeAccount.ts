/**
 * Closing a whole account (#124b): the request the app sends and the refusals
 * the `delete-account` function answers with. The canonical, tested copy of
 * the block between the markers below; `delete-account/index.ts` keeps an
 * identical copy INLINE (edge functions stay single-file, #67), and
 * `src/lib/closeAccount.test.ts` fails if the two ever differ. The app
 * imports `CONFIRM_WORD` and the refusal codes from here.
 *
 * Deliberately dependency-free: imported by vitest through this file.
 */

// --- close-account:start (identical in delete-account/index.ts)
/** The word the grown-up types to confirm. The app asks for it; the function checks it too. */
export const CONFIRM_WORD = 'DELETE';

/** Longest password the function will pass on to the auth service. */
export const MAX_PASSWORD_LENGTH = 1024;

/** Why the function didn't close the account: the `error` in its JSON answer. */
export const CLOSE_ACCOUNT_ERRORS = [
  'method_not_allowed',
  'server_config',
  'not_signed_in',
  'bad_request',
  'confirm_required',
  'password_required',
  'no_password_login',
  'wrong_password',
  'too_many_tries',
  'password_check_failed',
  'data_not_deleted',
  'login_not_deleted',
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
  bad_request: { status: 400, detail: 'The request was not understood.' },
  confirm_required: { status: 400, detail: `Type ${CONFIRM_WORD} to confirm.` },
  password_required: { status: 400, detail: 'Enter your password to close your account.' },
  no_password_login: { status: 400, detail: 'This login has no email and password to check.' },
  wrong_password: { status: 403, detail: "That password isn't right." },
  too_many_tries: { status: 429, detail: 'Too many password tries. Wait a minute, then try again.' },
  password_check_failed: { status: 502, detail: "The password couldn't be checked just now." },
  data_not_deleted: { status: 500, detail: 'Nothing was deleted: the family data could not be removed.' },
  login_not_deleted: {
    status: 500,
    detail: "The family's data is gone, but the login could not be removed. Try again to finish.",
  },
};

export function refusal(error: CloseAccountError): CloseAccountRefusal {
  return { error, ...REFUSALS[error] };
}

/** The request body, checked: the confirm word, then a password to check again. */
export function readCloseRequest(body: unknown): { password: string } | CloseAccountRefusal {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return refusal('bad_request');
  const b = body as Record<string, unknown>;
  if (b.confirm !== CONFIRM_WORD) return refusal('confirm_required');
  if (typeof b.password !== 'string' || b.password.length === 0) return refusal('password_required');
  if (b.password.length > MAX_PASSWORD_LENGTH) return refusal('bad_request');
  return { password: b.password };
}

/**
 * Why checking the password again failed, from the auth service's error: a
 * wrong password (`invalid_credentials`, or its words from an older server),
 * too many tries (429), or the service's own trouble.
 */
export function passwordRefusal(err: { status?: number; code?: string; message?: string }): CloseAccountRefusal {
  const code = err.code ?? '';
  const words = err.message ?? '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(words)) return refusal('wrong_password');
  if (err.status === 429 || /rate limit|too many/i.test(`${code} ${words}`)) return refusal('too_many_tries');
  return refusal('password_check_failed');
}
// --- close-account:end
