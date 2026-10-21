import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The device's own client (its stored session, its database calls).
const auth = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn() }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ supabase: { auth, rpc } }));

const { deviceSessionId, lockGrownUps, openForFirstRun, openGrownUpsWith, signInEmail } = await import('./grownUps');
const { GROWN_UP_UNLOCK_MINUTES, GROWN_UPS_LOCKED_MESSAGE, GrownUpsLockedError, grownUpsLocked, relockLead, relockTitle, sessionIdOf } =
  await import('./grownUpsGate');
const { plainErrorOr } = await import('./familyErrors');
const { DEVICE_SESSION, deviceSession, tokenWith } = await import('../test/grownUps');

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue(deviceSession);
  rpc.mockResolvedValue({ data: null, error: null });
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('👪 Grown-ups locked (#167): telling the refusal', () => {
  it("knows the database's code, its words, the close function's refusal and the store's own error", () => {
    expect(grownUpsLocked({ code: 'HQ001', message: 'grown_ups_locked: open 👪 Grown-ups…' })).toBe(true);
    expect(grownUpsLocked({ code: 'P0001', message: 'grown_ups_locked: open 👪 Grown-ups…' })).toBe(true);
    expect(grownUpsLocked({ code: 'grown_ups_locked' })).toBe(true);
    expect(grownUpsLocked(new GrownUpsLockedError())).toBe(true);
  });

  it('and nothing else: not an admin, a PIN rule, a dead sign-in, junk', () => {
    for (const err of [
      { code: '42501', message: 'not an admin' },
      { code: 'P0001', message: 'pin_format: a PIN is 4 digits' },
      { code: 'HQ002', message: 'reauth_required: …' },
      { message: 'the word grown_ups_locked mid-sentence' },
      new Error('Failed to fetch'),
      null,
      'grown_ups_locked',
    ]) {
      expect(grownUpsLocked(err), JSON.stringify(err)).toBe(false);
    }
  });

  it('family screens say it plainly — and true whichever button it was', () => {
    expect(plainErrorOr({ code: 'HQ001', message: 'grown_ups_locked: x' }, 'fallback')).toBe(GROWN_UPS_LOCKED_MESSAGE);
    expect(plainErrorOr(new GrownUpsLockedError(), 'fallback')).toBe(GROWN_UPS_LOCKED_MESSAGE);
    expect(GROWN_UPS_LOCKED_MESSAGE).toBe('Grown-ups locked again, so nothing changed. Try again and enter your PIN or password when asked.');
  });

  it("the dialog's words: \"again\" only once it's been open; the PIN only when there is one", () => {
    expect(relockTitle(true)).toBe('👪 Grown-ups locked again');
    expect(relockTitle(false)).toBe("👪 Just checking it's a grown-up");
    expect(relockLead(true)).toBe('Enter your grown-up PIN or password to carry on. Everything on this page stays as it was.');
    expect(relockLead(false)).toBe('Enter your password to carry on. Everything on this page stays as it was.');
    expect(GROWN_UP_UNLOCK_MINUTES).toBe(15);
  });
});

describe('the sign-in this device holds', () => {
  it("reads a token's session_id (base64url, any padding) and nothing that isn't one", () => {
    expect(sessionIdOf(tokenWith({ session_id: DEVICE_SESSION }))).toBe(DEVICE_SESSION);
    expect(sessionIdOf(tokenWith({ session_id: DEVICE_SESSION, pad: 'xx' }))).toBe(DEVICE_SESSION);
    expect(sessionIdOf(tokenWith({ sub: 'u1' }))).toBeNull();
    expect(sessionIdOf(tokenWith({ session_id: 42 }))).toBeNull();
    expect(sessionIdOf(tokenWith({ session_id: 'not a uuid' }))).toBeNull();
    for (const junk of ['', 'abc', 'a.%%%.c', null, undefined]) expect(sessionIdOf(junk)).toBeNull();
  });

  it("is the main client's session, or null when there's none", async () => {
    await expect(deviceSessionId()).resolves.toBe(DEVICE_SESSION);
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(deviceSessionId()).resolves.toBeNull();
    auth.getSession.mockRejectedValueOnce(new Error('storage'));
    await expect(deviceSessionId()).resolves.toBeNull();
  });

  it("signs in with the login's email as the auth service has it now (a change confirmed elsewhere), else the device's", async () => {
    auth.getUser.mockResolvedValueOnce({ data: { user: { email: 'new@example.com' } }, error: null });
    await expect(signInEmail('old@example.com')).resolves.toBe('new@example.com');
    auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'offline' } });
    await expect(signInEmail('old@example.com')).resolves.toBe('old@example.com');
    auth.getUser.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(signInEmail('old@example.com')).resolves.toBe('old@example.com');
  });
});

describe('opening and shutting it on the server', () => {
  it("a password check's token opens the device's own sign-in, by name", async () => {
    const checkRpc = vi.fn(async () => ({ data: { unlocked: true, seconds: 900 }, error: null }));
    await expect(openGrownUpsWith({ rpc: checkRpc } as never)).resolves.toBe('open');
    expect(checkRpc).toHaveBeenCalledWith('unlock_grown_ups', { p_session: DEVICE_SESSION });
    // A session already read is used as it is.
    await openGrownUpsWith({ rpc: checkRpc } as never, 'aaaaaaaa-0000-4000-8000-000000000001');
    expect(checkRpc).toHaveBeenLastCalledWith('unlock_grown_ups', { p_session: 'aaaaaaaa-0000-4000-8000-000000000001' });
  });

  it('a database from before 0024 has nothing to open; a refusal or no sign-in to name is an error', async () => {
    const missing = vi.fn(async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }));
    await expect(openGrownUpsWith({ rpc: missing } as never)).resolves.toBe('no-gate');
    const refused = vi.fn(async () => ({ data: null, error: { code: 'HQ002', message: 'reauth_required: x' } }));
    await expect(openGrownUpsWith({ rpc: refused } as never)).rejects.toMatchObject({ code: 'HQ002' });
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    const never = vi.fn();
    await expect(openGrownUpsWith({ rpc: never } as never)).rejects.toThrow(/no_session/);
    expect(never).not.toHaveBeenCalled();
  });

  it('the first run asks with no session named (the fresh sign-in opens itself) and is quiet when the database says no', async () => {
    await expect(openForFirstRun()).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('unlock_grown_ups');
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'HQ002', message: 'reauth_required: x' } });
    await expect(openForFirstRun()).resolves.toBe(false);
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } });
    await expect(openForFirstRun()).resolves.toBe(false);
    expect(warn).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'boom' } });
    await expect(openForFirstRun()).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith('Opening 👪 Grown-ups for the first run failed:', 'boom [XX000]');
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(openForFirstRun()).resolves.toBe(false);
  });

  it('locking never throws, and a database from before 0024 is silent', async () => {
    await lockGrownUps();
    expect(rpc).toHaveBeenCalledWith('lock_grown_ups');
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } });
    await lockGrownUps();
    expect(warn).not.toHaveBeenCalled();
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(lockGrownUps()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
