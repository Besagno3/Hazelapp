// Supabase Edge Function: delete-account
// ----------------------------------------------------------------------------
// Closes a grown-up's whole account (#124b), from 👪 Grown-ups → Close account.
//
//   POST { confirm: 'DELETE' }   (with a sign-in token made by typing the
//                                 password moments ago — see step 3)
//   200  { ok: true, kids: <players removed> }
//   4xx / 5xx  { error: <code>, detail: <a plain sentence> } — the codes are
//   CLOSE_ACCOUNT_ERRORS below; the app turns them into its own words.
//
// Steps, each refusing with its own code:
//   1. Who's asking: the caller's token, checked by the auth service
//      (`auth.getUser`) — 401 `not_signed_in`; 410 `already_closed` when the
//      login is gone already (another tab finished first); 503
//      `auth_unavailable` when the auth service itself is down.
//   2. The body: the confirm word (400).
//   3. A password typed just now: the app signs in again with it from the
//      grown-up's own browser right before it asks, so that token's `amr`
//      claim says "password" at a time within REAUTH_WINDOW_S (403
//      `reauth_required` otherwise). The password never comes here, and the
//      auth service's sign-in limit counts that grown-up's device — a
//      sign-in from this function would share one limit with every family
//      (#124b review). Never a 4-digit grown-up PIN, which a kid may know.
//   4. The family's data: `delete_family` (migration 0023, service role) —
//      kids with their saves, seen questions, reports and PINs, the grown-up
//      PIN, consent and admin rows, all in one transaction; today's spent
//      question budget stays without a name, so it still counts for a day
//      (#152). 500 `data_not_deleted` if it refused (rolled back: nothing
//      deleted); 502 `outcome_unknown` if the reply was lost (it may have
//      run). On a project without 0023 it logs loudly and goes on: the
//      login's delete cascades the same tables.
//   5. The login: `auth.admin.deleteUser` (service role); already gone counts
//      as done. 500 `login_not_deleted` if it refused after the family went
//      (calling again finishes the job), `data_not_deleted` if nothing had
//      gone yet, `outcome_unknown` if the reply was lost.
//   Every answer is true whatever happened before it: "nothing deleted" only
//   when nothing was.
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

/**
 * How recently the caller must have typed their password (seconds). The app
 * signs in again with it right before it asks — from the grown-up's own
 * browser, so the auth service's sign-in limit counts that device, never
 * every family at once (#124b review) — and the function checks that fresh
 * sign-in on the token it's sent. It never sees the password.
 */
export const REAUTH_WINDOW_S = 300;
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

/** The request body, checked: just the confirm word (null when it's right). */
export function closeRequestRefusal(body: unknown): CloseAccountRefusal | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return refusal('bad_request');
  return (body as Record<string, unknown>).confirm === CONFIRM_WORD ? null : refusal('confirm_required');
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

/**
 * Whether the caller typed their password just now (within
 * `REAUTH_WINDOW_S`). Supabase lists how a session signed in under `amr` —
 * `[{ method: 'password', timestamp }]`, in seconds — and keeps it through
 * token refreshes, so a refreshed token still shows the sign-in's own time.
 * Another method (a magic link, a refresh of an old session) isn't a fresh
 * password. An auth service that sends no such list (none, or bare strings
 * from a custom hook) falls back to when the login last signed in
 * (`last_sign_in_at`). Never `iat`, which every refresh renews.
 */
export function signedInFreshly(
  claims: Record<string, unknown> | null,
  lastSignInAt: string | null | undefined,
  nowS: number,
): boolean {
  const fresh = (at: number) => at <= nowS + CLOCK_SLACK_S && nowS - at <= REAUTH_WINDOW_S;
  const amr = claims?.amr;
  const entries = (Array.isArray(amr) ? amr : []).filter(
    (e): e is Record<string, unknown> => typeof e === 'object' && e !== null && typeof (e as Record<string, unknown>).method === 'string',
  );
  if (entries.length > 0) {
    return entries.some((e) => e.method === 'password' && typeof e.timestamp === 'number' && fresh(e.timestamp));
  }
  const last = lastSignInAt ? Date.parse(lastSignInAt) / 1000 : NaN;
  return Number.isFinite(last) && fresh(last);
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

  // Set as the first delete is sent, so a crash after it never says "nothing was deleted".
  let deleting = false;
  try {
    // 1) Who's asking.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return refuse(refusal('not_signed_in'));
    const { data: who, error: whoErr } = await serverClient(url, anonKey).auth.getUser(token);
    const user = who?.user;
    if (whoErr || !user) {
      if (whoErr) {
        console.warn('delete-account: token check failed:', whoErr.status ?? '', whoErr.code ?? '', whoErr.message);
        if (loginGone(whoErr)) return refuse(refusal('already_closed'));
        if ((whoErr.status ?? 0) >= 500 || !whoErr.status) return refuse(refusal('auth_unavailable'));
      }
      return refuse(refusal('not_signed_in'));
    }

    // 2) What they sent.
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return refuse(refusal('bad_request'));
    }
    const bad = closeRequestRefusal(body);
    if (bad) return refuse(bad);

    // 3) A password typed just now, on this very login's token.
    const claims = jwtClaims(token);
    if (claims?.sub !== user.id) return refuse(refusal('not_signed_in'));
    if (!signedInFreshly(claims, user.last_sign_in_at, Date.now() / 1000)) return refuse(refusal('reauth_required'));

    // 4) The family's data, in one transaction.
    const admin = serverClient(url, serviceKey);
    let kids = 0;
    let familyGone = false;
    deleting = true;
    const { data: gone, error: famErr } = await admin.rpc('delete_family', { p_parent: user.id });
    if (famErr) {
      if (!FUNCTION_MISSING.includes(famErr.code ?? '')) {
        console.error('delete-account: delete_family failed:', famErr.code ?? '', famErr.message);
        return refuse(refusal(dbCallRefused(famErr) ? 'data_not_deleted' : 'outcome_unknown'));
      }
      console.error('DELETE_FAMILY MISSING (is migration 0023 applied?) — deleting the login alone; its cascades remove the family:', famErr.message);
    } else {
      familyGone = true;
      const n = Number((gone as { kids?: unknown } | null)?.kids);
      kids = Number.isFinite(n) ? n : 0;
    }

    // 5) The login (already gone — a second tab got there first — is done too).
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr && !loginGone(delErr)) {
      console.error('delete-account: deleting the login failed:', delErr.status ?? '', delErr.message);
      if (!authCallRefused(delErr)) return refuse(refusal('outcome_unknown'));
      return refuse(refusal(familyGone ? 'login_not_deleted' : 'data_not_deleted'));
    }

    // No email or id in the log: just that it happened.
    console.log(`delete-account: an account was closed (${kids} player${kids === 1 ? '' : 's'})`);
    return json({ ok: true, kids });
  } catch (e) {
    console.error('delete-account: unexpected error:', e instanceof Error ? e.message : String(e));
    return refuse(refusal(deleting ? 'outcome_unknown' : 'data_not_deleted'));
  }
});
