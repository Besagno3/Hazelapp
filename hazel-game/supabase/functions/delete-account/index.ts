// Supabase Edge Function: delete-account
// ----------------------------------------------------------------------------
// Closes a grown-up's whole account (#124b), from 👪 Grown-ups → Close account.
//
//   POST { password, confirm: 'DELETE' }   (with the caller's own sign-in token)
//   200  { ok: true, kids: <players removed> }
//   4xx / 5xx  { error: <code>, detail: <a plain sentence> } — the codes are
//   CLOSE_ACCOUNT_ERRORS below; the app turns them into its own words.
//
// Steps, each refusing with its own code:
//   1. Who's asking: the caller's token, checked by the auth service
//      (`auth.getUser`) — 401 `not_signed_in` without a good one.
//   2. The body: the confirm word, then the password (400s).
//   3. The password, checked HERE (`signInWithPassword` for the caller's own
//      email on a throwaway client) — never the app's word for it, and never a
//      4-digit grown-up PIN, which a kid may know: 403 `wrong_password`, 429
//      `too_many_tries`.
//   4. The family's data: `delete_family` (migration 0023, service role) —
//      kids with their saves, seen questions, reports and PINs, the grown-up
//      PIN, consent and admin rows, all in one transaction; today's spent
//      question budget stays without a name, so it still counts for a day
//      (#152). 500 `data_not_deleted` if it fails (nothing was deleted). On a
//      project without 0023 it logs loudly and goes on: the login's delete
//      cascades the same tables.
//   5. The login: `auth.admin.deleteUser` (service role). 500
//      `login_not_deleted` if it fails — the data is gone, and calling again
//      finishes the job.
//
// Single file on purpose: edge functions stay single-file so every deploy path
// (CLI, dashboard, API) bundles them (#67). The request checks and refusals are
// an identical copy of `_shared/closeAccount.ts` (canonical, tested), checked
// word for word by `src/lib/closeAccount.test.ts`. The supabase-js import is
// pinned to the app's exact version, as in generate-questions
// (`src/lib/edgeImports.test.ts`).
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected by
// Supabase; no other secret is needed.
//
// Deploy:  supabase functions deploy delete-account
// ----------------------------------------------------------------------------

import { createClient } from 'npm:@supabase/supabase-js@2.101.1';

// --- close-account:start (identical in _shared/closeAccount.ts)
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function refuse(r: CloseAccountRefusal): Response {
  return json({ error: r.error, detail: r.detail }, r.status);
}

/** A missing function: the migration isn't applied (PostgREST's code, or Postgres's). */
const FUNCTION_MISSING = ['PGRST202', '42883'];

/** A server-side client: no session kept, nothing refreshed, nothing read from a URL. */
function serverClient(url: string, key: string) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return refuse(refusal('method_not_allowed'));

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) {
    console.error('delete-account: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY missing');
    return refuse(refusal('server_config'));
  }

  // Set once the family's data is gone, so a crash after it says so.
  let familyGone = false;
  try {
    // 1) Who's asking.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return refuse(refusal('not_signed_in'));
    const { data: who, error: whoErr } = await serverClient(url, anonKey).auth.getUser(token);
    const user = who?.user;
    if (whoErr || !user) {
      if (whoErr) console.warn('delete-account: token check failed:', whoErr.status ?? '', whoErr.message);
      return refuse(refusal('not_signed_in'));
    }

    // 2) What they sent.
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return refuse(refusal('bad_request'));
    }
    const ask = readCloseRequest(body);
    if ('error' in ask) return refuse(ask);
    if (!user.email) return refuse(refusal('no_password_login'));

    // 3) Their password, checked here. The session this makes goes with the login.
    const { data: again, error: pwErr } = await serverClient(url, anonKey).auth.signInWithPassword({
      email: user.email,
      password: ask.password,
    });
    if (pwErr) {
      const r = passwordRefusal(pwErr);
      if (r.error === 'password_check_failed') console.error('delete-account: password check failed:', pwErr.status ?? '', pwErr.code ?? '', pwErr.message);
      return refuse(r);
    }
    if (again.user?.id !== user.id) return refuse(refusal('wrong_password'));

    // 4) The family's data, in one transaction.
    const admin = serverClient(url, serviceKey);
    let kids = 0;
    const { data: gone, error: famErr } = await admin.rpc('delete_family', { p_parent: user.id });
    if (famErr) {
      if (!FUNCTION_MISSING.includes(famErr.code ?? '')) {
        console.error('delete-account: delete_family failed:', famErr.code ?? '', famErr.message);
        return refuse(refusal('data_not_deleted'));
      }
      console.error('DELETE_FAMILY MISSING (is migration 0023 applied?) — deleting the login alone; its cascades remove the family:', famErr.message);
    } else {
      const n = Number((gone as { kids?: unknown } | null)?.kids);
      kids = Number.isFinite(n) ? n : 0;
    }
    familyGone = true;

    // 5) The login.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.error('delete-account: deleting the login failed:', delErr.status ?? '', delErr.message);
      return refuse(refusal('login_not_deleted'));
    }

    // No email or id in the log: just that it happened.
    console.log(`delete-account: an account was closed (${kids} player${kids === 1 ? '' : 's'})`);
    return json({ ok: true, kids });
  } catch (e) {
    console.error('delete-account: unexpected error:', e instanceof Error ? e.message : String(e));
    return refuse(refusal(familyGone ? 'login_not_deleted' : 'data_not_deleted'));
  }
});
