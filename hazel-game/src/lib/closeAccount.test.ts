import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
// ?raw: the files' TEXT, so the function's inline copy can be compared with
// the canonical one without resolving its Deno `npm:` imports.
import fnSource from '../../supabase/functions/delete-account/index.ts?raw';
import sharedSource from '../../supabase/functions/_shared/closeAccount.ts?raw';
import questionsFnSource from '../../supabase/functions/generate-questions/index.ts?raw';
import {
  CLOSE_ACCOUNT_ERRORS,
  CONFIRM_WORD,
  MAX_PASSWORD_LENGTH,
  passwordRefusal,
  readCloseRequest,
  refusal,
} from '../../supabase/functions/_shared/closeAccount';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } } }));

const {
  ACCOUNT_CLOSED_MESSAGE,
  CloseAccountFailure,
  closeAccountMessage,
  closeFailure,
  confirmTyped,
  noteAccountClosed,
  requestCloseAccount,
  takeAccountClosedNotice,
} = await import('./closeAccount');
const { NETWORK_MESSAGE, OFFLINE_MESSAGE, TROUBLE_MESSAGE } = await import('./errors');

const block = (src: string) => {
  const m = src.match(/\/\/ --- close-account:start[^\n]*\n([\s\S]*?)\/\/ --- close-account:end/);
  return m ? m[1] : null;
};

function httpError(status: number, body: unknown): FunctionsHttpError {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new FunctionsHttpError(new Response(text, { status }));
}

beforeEach(() => {
  invoke.mockReset();
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

  it('checks the token, the password, then deletes the family and the login with the service role', () => {
    const at = (needle: string) => {
      const i = fnSource.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const steps = [
      at('.auth.getUser(token)'),
      at('readCloseRequest(body)'),
      at('.auth.signInWithPassword({'),
      at("admin.rpc('delete_family', { p_parent: user.id })"),
      at('admin.auth.admin.deleteUser(user.id)'),
    ];
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
    // The password is checked for the caller's own email, never one from the body.
    expect(fnSource).toMatch(/email: user\.email,\s+password: ask\.password/);
    expect(fnSource).toMatch(/serverClient\(url, serviceKey\)/);
  });

  it('answers CORS the way generate-questions does', () => {
    const cors = (src: string) => src.match(/const corsHeaders = \{[\s\S]*?\};/)?.[0];
    expect(cors(fnSource)).toBeTruthy();
    expect(cors(fnSource)).toBe(cors(questionsFnSource));
    expect(fnSource).toMatch(/if \(req\.method === 'OPTIONS'\) return new Response\('ok', \{ headers: corsHeaders \}\)/);
  });
});

describe('checking the request (shared with the function)', () => {
  it('wants the confirm word, then a password', () => {
    expect(readCloseRequest({ confirm: CONFIRM_WORD, password: 'hunter22' })).toEqual({ password: 'hunter22' });
    expect(readCloseRequest({ confirm: 'delete', password: 'x' })).toMatchObject({ error: 'confirm_required', status: 400 });
    expect(readCloseRequest({ password: 'x' })).toMatchObject({ error: 'confirm_required' });
    expect(readCloseRequest({ confirm: CONFIRM_WORD })).toMatchObject({ error: 'password_required', status: 400 });
    expect(readCloseRequest({ confirm: CONFIRM_WORD, password: '' })).toMatchObject({ error: 'password_required' });
    expect(readCloseRequest({ confirm: CONFIRM_WORD, password: 42 })).toMatchObject({ error: 'password_required' });
    expect(readCloseRequest({ confirm: CONFIRM_WORD, password: 'x'.repeat(MAX_PASSWORD_LENGTH + 1) })).toMatchObject({ error: 'bad_request' });
    for (const junk of [null, 'DELETE', [CONFIRM_WORD], 7]) expect(readCloseRequest(junk)).toMatchObject({ error: 'bad_request' });
  });

  it("reads the auth service's refusal of the password", () => {
    expect(passwordRefusal({ status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' })).toMatchObject({ error: 'wrong_password', status: 403 });
    expect(passwordRefusal({ status: 400, message: 'Invalid login credentials' })).toMatchObject({ error: 'wrong_password' });
    expect(passwordRefusal({ status: 429, code: 'over_request_rate_limit', message: 'Request rate limit reached' })).toMatchObject({ error: 'too_many_tries', status: 429 });
    expect(passwordRefusal({ status: 500, message: 'Database error' })).toMatchObject({ error: 'password_check_failed', status: 502 });
  });

  it('every refusal has a status and a sentence', () => {
    for (const code of CLOSE_ACCOUNT_ERRORS) {
      const r = refusal(code);
      expect(r.status, code).toBeGreaterThanOrEqual(400);
      expect(r.detail, code).toMatch(/\.$/);
    }
    expect(refusal('not_signed_in').status).toBe(401);
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

  it('sends the password and the confirm word to delete-account', async () => {
    invoke.mockResolvedValue({ data: { ok: true, kids: 2 }, error: null });
    await expect(requestCloseAccount('hunter22')).resolves.toEqual({ kids: 2 });
    expect(invoke).toHaveBeenCalledWith('delete-account', { body: { password: 'hunter22', confirm: CONFIRM_WORD } });
  });

  it("an answer without ok isn't a closed account", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await expect(requestCloseAccount('x')).rejects.toMatchObject({ code: 'unknown' });
  });

  it("turns the function's refusal into its own words", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(403, { error: 'wrong_password', detail: "That password isn't right." }) });
    const err = await requestCloseAccount('nope').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CloseAccountFailure);
    expect(err).toMatchObject({ code: 'wrong_password', message: "That password isn't right. Check it and try again. Nothing was deleted." });
    expect((err as InstanceType<typeof CloseAccountFailure>).log).toBe("delete-account 403: wrong_password — That password isn't right.");
  });

  it('reads every kind of failure', async () => {
    expect((await closeFailure(httpError(429, { error: 'too_many_tries' }))).code).toBe('too_many_tries');
    expect((await closeFailure(httpError(500, { error: 'login_not_deleted' }))).code).toBe('login_not_deleted');
    // The gateway's own refusal of a dead token.
    expect((await closeFailure(httpError(401, { code: 401, message: 'Invalid JWT' }))).code).toBe('not_signed_in');
    expect((await closeFailure(httpError(502, '<html>Bad gateway</html>'))).code).toBe('trouble');
    expect((await closeFailure(httpError(418, { error: 'teapot' }))).code).toBe('unknown');
    expect((await closeFailure(new FunctionsFetchError(new TypeError('Failed to fetch')))).code).toBe('network');
    expect((await closeFailure(new FunctionsRelayError({}))).code).toBe('trouble');
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    expect((await closeFailure(new FunctionsFetchError(new TypeError('Failed to fetch')))).code).toBe('offline');
  });

  it('says plainly what happened, and whether anything was deleted', () => {
    expect(closeAccountMessage('offline')).toBe(OFFLINE_MESSAGE);
    expect(closeAccountMessage('network')).toBe(NETWORK_MESSAGE);
    expect(closeAccountMessage('trouble')).toBe(TROUBLE_MESSAGE);
    for (const code of ['wrong_password', 'too_many_tries', 'not_signed_in', 'data_not_deleted', 'password_check_failed', 'unknown'] as const) {
      expect(closeAccountMessage(code), code).toMatch(/Nothing was deleted/);
    }
    expect(closeAccountMessage('login_not_deleted')).toMatch(/players and their games are deleted.*again to finish/);
    expect(closeAccountMessage('confirm_required')).toBe(`Type ${CONFIRM_WORD} in the box to confirm.`);
    // No code or jargon on screen.
    for (const code of [...CLOSE_ACCOUNT_ERRORS, 'unknown'] as const) expect(closeAccountMessage(code)).not.toMatch(/_|JWT|status/);
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
