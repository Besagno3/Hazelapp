import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
// ?raw: the files' TEXT, so the function's inline copy can be compared with
// the canonical one without resolving its Deno `npm:` imports.
import fnSource from '../../supabase/functions/delete-account/index.ts?raw';
import sharedSource from '../../supabase/functions/_shared/closeAccount.ts?raw';
import questionsFnSource from '../../supabase/functions/generate-questions/index.ts?raw';
import {
  amrMissing,
  authCallRefused,
  callerSessionOf,
  CLOCK_SLACK_S,
  CLOSE_ACCOUNT_ERRORS,
  closeRequestRefusal,
  CONFIRM_WORD,
  closeSessionOf,
  dbCallRefused,
  functionMissingDb,
  grownUpsLockedDb,
  reauthRequiredDb,
  jwtClaims,
  loginGone,
  REAUTH_WINDOW_S,
  refusal,
  signedInFreshly,
} from '../../supabase/functions/_shared/closeAccount';

const invoke = vi.hoisted(() => vi.fn());
// The device's own client (its stored session) and the one-off client the password is checked on.
const auth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), getUser: vi.fn(), getSession: vi.fn() }));
const checkAuth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signOut: vi.fn() }));
// The check's token opens 👪 Grown-ups on the device's sign-in before the close (#167).
const checkRpc = vi.hoisted(() => vi.fn());
// A new client for each check (#167 review round 1): counted, so a close is seen to use one.
const makeCheck = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ supabase: { functions: { invoke }, auth }, passwordCheckClient: makeCheck }));

const {
  ACCOUNT_CLOSED_MESSAGE,
  CloseAccountFailure,
  closeAccountMessage,
  closeFailure,
  confirmTyped,
  noteAccountClosed,
  requestCloseAccount,
  signInFailure,
  takeAccountClosedNotice,
} = await import('./closeAccount');
const { NETWORK_MESSAGE, OFFLINE_MESSAGE, TROUBLE_MESSAGE } = await import('./errors');
const { DEVICE_SESSION, deviceSession } = await import('../test/grownUps');

const block = (src: string) => {
  const m = src.match(/\/\/ --- close-account:start[^\n]*\n([\s\S]*?)\/\/ --- close-account:end/);
  return m ? m[1] : null;
};

function httpError(status: number, body: unknown): FunctionsHttpError {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new FunctionsHttpError(new Response(text, { status }));
}

/** A token whose payload is `claims` (the signature isn't read: the auth service checks it first). */
function token(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
}

const signedIn = { data: { session: { access_token: 'fresh-token' }, user: { id: 'u1' } }, error: null };

beforeEach(() => {
  invoke.mockReset();
  auth.signInWithPassword.mockReset();
  checkAuth.signInWithPassword.mockReset().mockResolvedValue(signedIn);
  checkAuth.signOut.mockReset().mockResolvedValue({ error: null });
  auth.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  auth.getSession.mockReset().mockResolvedValue(deviceSession);
  checkRpc.mockReset().mockResolvedValue({ data: { unlocked: true, seconds: 900 }, error: null });
  makeCheck.mockReset().mockImplementation(() => ({ auth: checkAuth, rpc: checkRpc }));
  sessionStorage.clear();
  takeAccountClosedNotice();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the delete-account function (#124b)', () => {
  it('keeps the canonical request checks inline, word for word (single-file deploys)', () => {
    expect(block(sharedSource), 'markers missing in _shared/closeAccount.ts').not.toBeNull();
    expect(block(fnSource), 'markers missing in delete-account/index.ts').not.toBeNull();
    expect(block(fnSource)).toBe(block(sharedSource));
  });

  it('is one file: no sibling imports, supabase-js pinned like generate-questions', () => {
    expect(fnSource).not.toMatch(/from\s+['"]\.\.?\//);
    const pin = (src: string) => src.match(/from 'npm:@supabase\/supabase-js@([\d.]+)'/)?.[1];
    expect(pin(fnSource)).toBeTruthy();
    expect(pin(fnSource)).toBe(pin(questionsFnSource));
  });

  it('checks the token, the confirm word and a fresh password sign-in, then deletes the family and the login with the service role', () => {
    const at = (needle: string) => {
      const i = fnSource.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const steps = [
      at('.auth.getUser(token)'),
      at('closeRequestRefusal(body)'),
      at('signedInFreshly(claims, user.last_sign_in_at,'),
      at("admin.rpc('delete_family', {"),
      at('admin.auth.admin.deleteUser(user.id)'),
    ];
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
    // The family's data goes for the session the app names, asked by the token's own session (#167 review round 1).
    expect(fnSource).toMatch(/admin\.rpc\('delete_family', \{\s*p_parent: user\.id,\s*p_session: closeSessionOf\(body\),\s*p_caller: callerSessionOf\(claims\),\s*\}\)/);
    // The token's claims are this very login's, and the function never signs in itself.
    expect(fnSource).toMatch(/claims\?\.sub !== user\.id/);
    // A token with no amr is refused AND logged loudly (an auth set-up to fix, #124b review round 2).
    expect(fnSource).toMatch(/if \(amrMissing\(claims\)\) \{\s*console\.error\(/);
    expect(fnSource).not.toMatch(/signInWithPassword/);
    expect(fnSource).toMatch(/serverClient\(url, serviceKey\)/);
  });

  it('names the device\'s sign-in to delete_family and answers its "👪 Grown-ups is shut" as grown_ups_locked, before any other database refusal (#167)', () => {
    const locked = fnSource.indexOf('if (grownUpsLockedDb(famErr)) return refuse(refusal(\'grown_ups_locked\'));');
    const reauth = fnSource.indexOf('if (reauthRequiredDb(famErr)) return refuse(refusal(\'reauth_required\'));');
    const missing = fnSource.indexOf('if (functionMissingDb(famErr)) {');
    expect(locked).toBeGreaterThan(-1);
    expect(reauth).toBeGreaterThan(locked);
    expect(missing).toBeGreaterThan(reauth);
    expect(missing).toBeLessThan(fnSource.indexOf("refuse(refusal(dbCallRefused(famErr) ? 'data_not_deleted' : 'outcome_unknown'))"));
    expect(locked).toBeLessThan(fnSource.indexOf('admin.auth.admin.deleteUser(user.id)'));
  });

  it('on a database older than it, refuses — never deletes the login alone, which would skip the 👪 check (#167 review round 1)', () => {
    const missing = fnSource.slice(fnSource.indexOf('if (functionMissingDb(famErr)) {'));
    expect(missing).toMatch(/^if \(functionMissingDb\(famErr\)\) \{\s*console\.error\([\s\S]*?\);\s*return refuse\(refusal\('database_out_of_date'\)\);/);
    expect(fnSource).not.toMatch(/deleting the login alone/);
    expect(refusal('database_out_of_date')).toMatchObject({ status: 503, detail: expect.stringMatching(/migrations 0023 \+ 0024.*Nothing was deleted\./) });
    expect(functionMissingDb({ code: 'PGRST202' })).toBe(true);
    expect(functionMissingDb({ code: '42883' })).toBe(true);
    expect(functionMissingDb({ code: 'HQ001' })).toBe(false);
  });

  it("tells delete_family the token's own session, and knows its \"not a password check\" refusal (#167 review round 1)", () => {
    expect(callerSessionOf({ session_id: DEVICE_SESSION })).toBe(DEVICE_SESSION);
    for (const bad of [{}, { session_id: 'nope' }, { session_id: 7 }, null]) expect(callerSessionOf(bad), JSON.stringify(bad)).toBeNull();
    expect(reauthRequiredDb({ code: 'HQ002' })).toBe(true);
    expect(reauthRequiredDb({ code: 'HQ001' })).toBe(false);
    expect(grownUpsLockedDb({ code: 'HQ002' })).toBe(false);
  });

  it('answers CORS the way generate-questions does', () => {
    const cors = (src: string) => src.match(/const corsHeaders = \{[\s\S]*?\};/)?.[0];
    expect(cors(fnSource)).toBeTruthy();
    expect(cors(fnSource)).toBe(cors(questionsFnSource));
    expect(fnSource).toMatch(/if \(req\.method === 'OPTIONS'\) return new Response\('ok', \{ headers: corsHeaders \}\)/);
  });
});

describe('checking the request (shared with the function)', () => {
  it('wants the confirm word, exactly — and no password at all', () => {
    expect(closeRequestRefusal({ confirm: CONFIRM_WORD })).toBeNull();
    expect(closeRequestRefusal({ confirm: 'delete' })).toMatchObject({ error: 'confirm_required', status: 400 });
    expect(closeRequestRefusal({})).toMatchObject({ error: 'confirm_required' });
    for (const junk of [null, 'DELETE', [CONFIRM_WORD], 7]) expect(closeRequestRefusal(junk)).toMatchObject({ error: 'bad_request' });
  });

  it('reads a token\'s claims (base64url, any padding) and nothing that isn\'t one', () => {
    expect(jwtClaims(token({ sub: 'u1', amr: [{ method: 'password', timestamp: 1 }] }))).toEqual({ sub: 'u1', amr: [{ method: 'password', timestamp: 1 }] });
    expect(jwtClaims(token({ sub: 'ü?>' }))?.sub).toBeTypeOf('string');
    for (const junk of ['', 'abc', 'a.!!!.c', `a.${btoa('[1,2]')}.c`]) expect(jwtClaims(junk)).toBeNull();
  });

  it('a password typed in the last minute, by the token\'s own amr — a refresh or another method isn\'t one', () => {
    const now = 1_800_000_000;
    const amr = (method: string, ago: number) => ({ amr: [{ method, timestamp: now - ago }] });
    // A minute at most: any other password sign-in on the device (a grown-up
    // signing in) mustn't be able to close the account for long (#124b review round 2).
    expect(REAUTH_WINDOW_S).toBeLessThanOrEqual(60);
    expect(signedInFreshly(amr('password', 240), undefined, now)).toBe(false);
    expect(signedInFreshly(amr('password', 61), undefined, now)).toBe(false);
    expect(signedInFreshly(amr('password', 10), undefined, now)).toBe(true);
    expect(signedInFreshly(amr('password', REAUTH_WINDOW_S), undefined, now)).toBe(true);
    expect(signedInFreshly(amr('password', REAUTH_WINDOW_S + 1), undefined, now)).toBe(false);
    expect(signedInFreshly(amr('password', -CLOCK_SLACK_S), undefined, now)).toBe(true);
    expect(signedInFreshly(amr('password', -CLOCK_SLACK_S - 1), undefined, now)).toBe(false);
    expect(signedInFreshly(amr('otp', 10), undefined, now)).toBe(false);
    expect(signedInFreshly(amr('magiclink', 0), new Date(now * 1000).toISOString(), now)).toBe(false);
    // An older password entry and a fresh one: the fresh one counts.
    expect(signedInFreshly({ amr: [{ method: 'password', timestamp: now - 9000 }, { method: 'password', timestamp: now - 5 }] }, undefined, now)).toBe(true);
  });

  it('bare method names (a custom hook) must name a password, then the last sign-in must be just now; no amr at all is refused — never iat', () => {
    const now = 1_800_000_000;
    const recent = new Date((now - 30) * 1000).toISOString();
    const old = new Date((now - 3600) * 1000).toISOString();
    expect(signedInFreshly({ amr: ['password'] }, recent, now)).toBe(true);
    expect(signedInFreshly({ amr: ['pwd', 'mfa'] }, recent, now)).toBe(true);
    expect(signedInFreshly({ amr: ['password'] }, old, now)).toBe(false);
    // Another method, signed in a moment ago (a magic link, maybe on another device): not a password.
    expect(signedInFreshly({ amr: ['otp'] }, recent, now)).toBe(false);
    // Nothing says how this token signed in: refused, however recent the login's last sign-in (#124b review round 2).
    expect(signedInFreshly({}, recent, now)).toBe(false);
    expect(signedInFreshly({ amr: [] }, recent, now)).toBe(false);
    expect(signedInFreshly({ amr: 'password' }, recent, now)).toBe(false);
    expect(signedInFreshly({ iat: now }, old, now)).toBe(false);
    expect(signedInFreshly(null, recent, now)).toBe(false);
    expect(signedInFreshly({ amr: ['password'] }, 'not a date', now)).toBe(false);
    // …and the function can tell that case apart, to log it loudly.
    expect(amrMissing({})).toBe(true);
    expect(amrMissing({ amr: [] })).toBe(true);
    expect(amrMissing(null)).toBe(true);
    expect(amrMissing({ amr: ['otp'] })).toBe(false);
    expect(amrMissing({ amr: [{ method: 'password', timestamp: now }] })).toBe(false);
  });

  it("the device's sign-in, when named, is a session id; anything else is a bad request (#167)", () => {
    const id = '0f3c6f8e-1b2a-4c5d-9e8f-001122334455';
    expect(closeRequestRefusal({ confirm: CONFIRM_WORD, session: id })).toBeNull();
    expect(closeRequestRefusal({ confirm: CONFIRM_WORD, session: null })).toBeNull();
    for (const junk of ['', 'not-a-uuid', 42, [id], { id }]) {
      expect(closeRequestRefusal({ confirm: CONFIRM_WORD, session: junk }), JSON.stringify(junk)).toMatchObject({ error: 'bad_request' });
    }
    expect(closeSessionOf({ confirm: CONFIRM_WORD, session: id })).toBe(id);
    expect(closeSessionOf({ confirm: CONFIRM_WORD })).toBeNull();
    expect(closeSessionOf({ session: 'nope' })).toBeNull();
    expect(closeSessionOf(null)).toBeNull();
    // delete_family's "shut" refusal, and only that.
    expect(grownUpsLockedDb({ code: 'HQ001' })).toBe(true);
    for (const code of ['42501', 'P0001', 'PGRST202', '', null]) expect(grownUpsLockedDb({ code }), String(code)).toBe(false);
    expect(refusal('grown_ups_locked')).toMatchObject({ status: 403, detail: expect.stringMatching(/Nothing was deleted\.$/) });
    // …and a locked refusal deleted nothing (it raised first).
    expect(dbCallRefused({ code: 'HQ001' })).toBe(true);
  });

  it('tells a refusal (nothing done) from a lost reply (maybe done)', () => {
    for (const code of ['XX000', '57014', '23503', 'P0001', 'PGRST202', 'PGRST301']) expect(dbCallRefused({ code }), code).toBe(true);
    for (const code of ['', undefined, null, 'oops']) expect(dbCallRefused({ code }), String(code)).toBe(false);
    for (const status of [400, 403, 422, 500, 501]) expect(authCallRefused({ status }), String(status)).toBe(true);
    for (const status of [0, undefined, 502, 503, 504]) expect(authCallRefused({ status }), String(status)).toBe(false);
    expect(loginGone({ status: 404 })).toBe(true);
    expect(loginGone({ status: 403, code: 'user_not_found' })).toBe(true);
    expect(loginGone({ status: 403, code: 'bad_jwt' })).toBe(false);
  });

  it('every refusal has a status and a sentence', () => {
    for (const code of CLOSE_ACCOUNT_ERRORS) {
      const r = refusal(code);
      expect(r.status, code).toBeGreaterThanOrEqual(400);
      expect(r.detail, code).toMatch(/\.$/);
    }
    expect(refusal('not_signed_in').status).toBe(401);
    expect(refusal('already_closed').status).toBe(410);
    expect(refusal('reauth_required').status).toBe(403);
    expect(refusal('login_not_deleted').status).toBe(500);
  });
});

describe('closing an account from the app', () => {
  it('the confirm word: any case, spaces round it ignored', () => {
    expect(confirmTyped('DELETE')).toBe(true);
    expect(confirmTyped(' delete ')).toBe(true);
    expect(confirmTyped('Delete')).toBe(true);
    expect(confirmTyped('DELET')).toBe(false);
    expect(confirmTyped('')).toBe(false);
    expect(confirmTyped('DELETE IT')).toBe(false);
  });

  it('signs in again with the password on the one-off client, then sends only the confirm word with that fresh token', async () => {
    invoke.mockResolvedValue({ data: { ok: true, kids: 2 }, error: null });
    await expect(requestCloseAccount('mum@example.com', 'hunter22')).resolves.toEqual({ kids: 2, alreadyClosed: false });
    expect(checkAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'mum@example.com', password: 'hunter22' });
    // Never the device's own client: its storage (and other tabs) never get a fresh-password session (#124b review round 2).
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('delete-account', {
      body: { confirm: CONFIRM_WORD, session: DEVICE_SESSION },
      headers: { Authorization: 'Bearer fresh-token' },
    });
    expect(checkAuth.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[0]);
    // Closed: the login and its sessions are gone, nothing to sign out.
    expect(checkAuth.signOut).not.toHaveBeenCalled();
  });

  it("the password typed just now opens 👪 Grown-ups on this device's sign-in first, and the function is told which sign-in that is (#167)", async () => {
    invoke.mockResolvedValue({ data: { ok: true, kids: 1 }, error: null });
    await requestCloseAccount('mum@example.com', 'hunter22');
    expect(checkRpc).toHaveBeenCalledWith('unlock_grown_ups', { p_session: DEVICE_SESSION });
    expect(checkRpc.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[0]);
    // Opening it is best effort: if it fails, the close is still asked (the function says if it's shut).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    checkRpc.mockResolvedValueOnce({ data: null, error: { code: 'HQ002', message: 'no' } });
    invoke.mockClear();
    await requestCloseAccount('mum@example.com', 'hunter22');
    expect(invoke).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('one check, one client: its sign-in, opening 👪 Grown-ups and its sign-out (#167 review round 1)', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: httpError(403, { error: 'reauth_required' }) });
    await expect(requestCloseAccount('m@e.com', 'x')).rejects.toMatchObject({ code: 'reauth_required' });
    expect(makeCheck).toHaveBeenCalledTimes(1);
  });

  it("this device's sign-in can't be read, or has ended: said at once, with nothing asked of the function — never the gate again (#167 review round 1)", async () => {
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(requestCloseAccount('m@e.com', 'x')).rejects.toMatchObject({ code: 'device_signed_out' });
    expect(invoke).not.toHaveBeenCalled();
    expect(checkAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    checkRpc.mockResolvedValueOnce({ data: null, error: { code: 'HQ002', message: "no_session: that sign-in isn't a live one of yours" } });
    const failure = await requestCloseAccount('m@e.com', 'x').catch((e: unknown) => e);
    expect(failure).toMatchObject({ code: 'device_signed_out' });
    expect(invoke).not.toHaveBeenCalled();
    expect(closeAccountMessage('device_signed_out')).toMatch(/sign-in has ended.*Sign in again to carry on\. Nothing was deleted\.$/);
  });

  it('"Grown-ups locked again" from the function is its own refusal: nothing was deleted', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: httpError(403, { error: 'grown_ups_locked', detail: 'x' }) });
    await expect(requestCloseAccount('m@e.com', 'x')).rejects.toMatchObject({ code: 'grown_ups_locked' });
    expect(closeAccountMessage('grown_ups_locked')).toBe('Grown-ups locked again. Enter your PIN or password, then tap "Close account for good" again. Nothing was deleted.');
  });

  it('a close that didn\'t go through signs the check\'s sign-in out at once — it isn\'t kept for anything else', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: httpError(403, { error: 'reauth_required' }) });
    await expect(requestCloseAccount('m@e.com', 'x')).rejects.toMatchObject({ code: 'reauth_required' });
    expect(checkAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    checkAuth.signOut.mockClear();
    invoke.mockResolvedValueOnce({ data: null, error: new FunctionsFetchError(new TypeError('Failed to fetch')) });
    await expect(requestCloseAccount('m@e.com', 'x')).rejects.toMatchObject({ code: 'lost_touch' });
    expect(checkAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    // A sign-out that fails is only logged: the refusal is what the grown-up hears.
    checkAuth.signOut.mockClear().mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    invoke.mockResolvedValueOnce({ data: null, error: httpError(500, { error: 'data_not_deleted' }) });
    await expect(requestCloseAccount('m@e.com', 'x')).rejects.toMatchObject({ code: 'data_not_deleted' });
    await Promise.resolve();
    expect(warn).toHaveBeenCalledWith('Signing out the password check:', expect.stringContaining('Failed to fetch'));
    warn.mockRestore();
  });

  it('a login with no email has no password to check', async () => {
    await expect(requestCloseAccount('', 'x')).rejects.toMatchObject({ code: 'no_password_login' });
    expect(checkAuth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("the password check's refusals never reach the function", async () => {
    checkAuth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' } });
    await expect(requestCloseAccount('m@e.com', 'nope')).rejects.toMatchObject({ code: 'wrong_password' });
    checkAuth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { name: 'AuthApiError', status: 429, code: 'over_request_rate_limit', message: 'Request rate limit reached' } });
    await expect(requestCloseAccount('m@e.com', 'x')).rejects.toMatchObject({ code: 'too_many_tries' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('a refused password on a login that no longer exists was a close whose answer got lost: done', async () => {
    checkAuth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' } });
    auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 403, code: 'user_not_found', message: 'User from sub claim in JWT does not exist' } });
    await expect(requestCloseAccount('m@e.com', 'right')).resolves.toEqual({ kids: 0, alreadyClosed: true });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('the function saying it was already closed is done too', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(410, { error: 'already_closed' }) });
    await expect(requestCloseAccount('m@e.com', 'right')).resolves.toEqual({ kids: 0, alreadyClosed: true });
  });

  it("an answer without ok can't be called closed — or not closed", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await expect(requestCloseAccount('m@e.com', 'x')).rejects.toMatchObject({ code: 'outcome_unknown' });
  });

  it("turns the function's refusal into its own words", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(403, { error: 'reauth_required', detail: 'Type your password again, just before closing the account.' }) });
    const err = await requestCloseAccount('m@e.com', 'x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CloseAccountFailure);
    expect(err).toMatchObject({ code: 'reauth_required', message: `We couldn't confirm it's you just now. Tap "Close account for good" to try again. Nothing was deleted.` });
    expect((err as InstanceType<typeof CloseAccountFailure>).log).toBe('delete-account 403: reauth_required — Type your password again, just before closing the account.');
  });

  it("reads every kind of failure — a reply that never came is 'can't tell', not 'nothing deleted'", async () => {
    expect((await closeFailure(httpError(500, { error: 'login_not_deleted' }))).code).toBe('login_not_deleted');
    expect((await closeFailure(httpError(502, { error: 'outcome_unknown' }))).code).toBe('outcome_unknown');
    // The gateway's own refusal of a dead token: the function never ran.
    expect((await closeFailure(httpError(401, { code: 401, message: 'Invalid JWT' }))).code).toBe('not_signed_in');
    expect((await closeFailure(httpError(502, '<html>Bad gateway</html>'))).code).toBe('outcome_unknown');
    expect((await closeFailure(httpError(404, { message: 'Function not found' }))).code).toBe('bad_request');
    expect((await closeFailure(new FunctionsFetchError(new TypeError('Failed to fetch')))).code).toBe('lost_touch');
    expect((await closeFailure(new FunctionsRelayError({}))).code).toBe('outcome_unknown');
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    expect((await closeFailure(new FunctionsFetchError(new TypeError('Failed to fetch')))).code).toBe('lost_touch');
  });

  it("reads the password check's failures (nothing sent yet)", () => {
    expect(signInFailure({ name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' }).code).toBe('wrong_password');
    expect(signInFailure({ status: 400, message: 'Invalid login credentials' }).code).toBe('wrong_password');
    expect(signInFailure({ status: 429, message: 'Request rate limit reached' }).code).toBe('too_many_tries');
    expect(signInFailure({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }).code).toBe('network');
    expect(signInFailure({ name: 'AuthRetryableFetchError', status: 503, message: '' }).code).toBe('trouble');
    expect(signInFailure({ name: 'AuthApiError', status: 500, message: 'Database error' }).code).toBe('trouble');
    expect(signInFailure({ name: 'AuthApiError', status: 400, code: 'email_not_confirmed', message: 'Email not confirmed' }).code).toBe('password_check_failed');
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    expect(signInFailure(new TypeError('Failed to fetch')).code).toBe('offline');
  });

  it('says plainly what happened — "Nothing was deleted" only where this try deleted nothing', () => {
    expect(closeAccountMessage('offline')).toBe(`${OFFLINE_MESSAGE} Nothing was deleted.`);
    expect(closeAccountMessage('network')).toBe(`${NETWORK_MESSAGE} Nothing was deleted.`);
    expect(closeAccountMessage('trouble')).toBe(`${TROUBLE_MESSAGE} Nothing was deleted.`);
    for (const code of ['wrong_password', 'too_many_tries', 'password_check_failed', 'not_signed_in', 'reauth_required', 'auth_unavailable', 'data_not_deleted', 'bad_request'] as const) {
      expect(closeAccountMessage(code), code).toMatch(/Nothing was deleted/);
    }
    // Where it can't know, it says so — and never that nothing was deleted, or that the data is gone.
    for (const code of ['outcome_unknown', 'lost_touch'] as const) {
      expect(closeAccountMessage(code), code).toMatch(/can't tell if your account was closed|couldn't tell if your account was closed/);
      expect(closeAccountMessage(code), code).not.toMatch(/Nothing was deleted|are deleted/);
      expect(closeAccountMessage(code), code).toMatch(/safe to repeat/);
    }
    expect(closeAccountMessage('login_not_deleted')).toMatch(/players and their games are deleted.*again to finish/);
    expect(closeAccountMessage('confirm_required')).toBe(`Type ${CONFIRM_WORD} in the box to confirm.`);
    // While the privacy notice is a draft, no pointing at its placeholder address.
    expect(closeAccountMessage('no_password_login')).not.toMatch(/email us|privacy notice/i);
    // No code or jargon on screen.
    const all: Parameters<typeof closeAccountMessage>[0][] = [...CLOSE_ACCOUNT_ERRORS, 'password_required', 'no_password_login', 'wrong_password', 'too_many_tries', 'password_check_failed', 'offline', 'network', 'trouble', 'lost_touch'];
    for (const code of all) expect(closeAccountMessage(code)).not.toMatch(/_|JWT|status|amr/);
  });

  it('the sign-in page hears once that the account is gone', () => {
    expect(takeAccountClosedNotice()).toBeNull();
    noteAccountClosed();
    expect(sessionStorage.getItem('hazel-account-closed')).toBe('1');
    expect(takeAccountClosedNotice()).toBe(ACCOUNT_CLOSED_MESSAGE);
    expect(ACCOUNT_CLOSED_MESSAGE).toBe('Your account and all its data are gone.');
    expect(takeAccountClosedNotice()).toBeNull();
    // After a reload in the same tab (the page's memory is gone, the tab's isn't).
    sessionStorage.setItem('hazel-account-closed', '1');
    expect(takeAccountClosedNotice()).toBe(ACCOUNT_CLOSED_MESSAGE);
  });
});
