import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The device's own client (its stored session, its database calls).
const auth = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn() }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ supabase: { auth, rpc } }));

const { allowPasswordChange, deviceSessionId, lockGrownUps, noteDeviceSession, openForFirstRun, openGrownUpsWith, signInEmail } =
  await import('./grownUps');
const {
  DEVICE_SIGNED_OUT_MESSAGE,
  GROWN_UP_UNLOCK_MINUTES,
  GROWN_UPS_LOCKED_MESSAGE,
  GrownUpsLockedError,
  grownUpsLocked,
  grownUpsLockedMessage,
  passwordWaitMessage,
  relockLead,
  relockTitle,
  sessionIdOf,
  unlockRefusal,
} = await import('./grownUpsGate');
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

  it('family screens say it plainly — in the words chosen for where it happened (#167 review round 1)', () => {
    // No situation known (the database's own refusal): plain, with no "again".
    expect(plainErrorOr({ code: 'HQ001', message: 'grown_ups_locked: x' }, 'fallback')).toBe(GROWN_UPS_LOCKED_MESSAGE);
    expect(plainErrorOr(new GrownUpsLockedError(), 'fallback')).toBe(GROWN_UPS_LOCKED_MESSAGE);
    expect(GROWN_UPS_LOCKED_MESSAGE).not.toMatch(/again,/);
    // The store's error carries the dialog's words for its page.
    expect(plainErrorOr(new GrownUpsLockedError('words for here'), 'fallback')).toBe('words for here');
  });

  it('"locked again" only in 👪 Grown-ups; a setup screen asks for a grown-up; the PIN only when there is one', () => {
    expect(grownUpsLockedMessage({ inArea: true, hasParentPin: true })).toBe(
      '👪 Grown-ups locked again, so nothing changed. Try again and enter your grown-up PIN or password when asked.',
    );
    expect(grownUpsLockedMessage({ inArea: true, hasParentPin: false })).toBe(
      '👪 Grown-ups locked again, so nothing changed. Try again and enter your password when asked.',
    );
    expect(grownUpsLockedMessage({ inArea: false, hasParentPin: false })).toBe(
      'Nothing changed — a grown-up needs to unlock this. Ask a grown-up to try again and enter their password.',
    );
    expect(grownUpsLockedMessage({ inArea: false, hasParentPin: true })).not.toMatch(/again,|your PIN/);
  });

  it("the dialog's words: \"again\" only in 👪 Grown-ups; one line saying what to do for the way in shown", () => {
    expect(relockTitle(true)).toBe('👪 Grown-ups locked again');
    expect(relockTitle(false)).toBe("👪 Just checking it's a grown-up");
    expect(relockLead('pin', 'mum@example.com')).toBe('Type your grown-up PIN to carry on. Everything on this page stays as it was.');
    expect(relockLead('pin-resting', 'mum@example.com')).toBe('Use your password for now. Everything on this page stays as it was.');
    expect(relockLead('password', 'mum@example.com')).toBe(
      'Enter the password for mum@example.com to carry on. Everything on this page stays as it was.',
    );
    expect(relockLead('password', '')).toBe('Enter your password to carry on. Everything on this page stays as it was.');
    // One "Enter…", never two.
    for (const way of ['pin', 'pin-resting', 'password'] as const) expect(relockLead(way, 'mum@example.com').match(/Enter/g)?.length ?? 0).toBeLessThan(2);
    expect(GROWN_UP_UNLOCK_MINUTES).toBe(15);
  });

  it("reads the unlock's refusals: a sign-in that ended, a password changed without the old one (and when the wait ends), not fresh", () => {
    expect(unlockRefusal({ code: 'HQ002', message: "no_session: that sign-in isn't a live one of yours" })).toEqual({ kind: 'no_session', until: null });
    expect(unlockRefusal(new Error("no_session: this device's sign-in couldn't be read"))).toEqual({ kind: 'no_session', until: null });
    const wait = unlockRefusal({ code: 'HQ002', message: 'password_changed: …', details: '2026-10-22T15:40:00Z' });
    expect(wait?.kind).toBe('password_changed');
    expect(wait?.until?.toISOString()).toBe('2026-10-22T15:40:00.000Z');
    expect(unlockRefusal({ code: 'HQ002', message: 'password_changed: …', details: 'junk' })).toEqual({ kind: 'password_changed', until: null });
    expect(unlockRefusal({ code: 'HQ002', message: 'reauth_required: x' })?.kind).toBe('reauth_required');
    for (const other of [{ code: 'HQ001', message: 'grown_ups_locked: x' }, new Error('Failed to fetch'), null, 'no_session']) {
      expect(unlockRefusal(other), JSON.stringify(other)).toBeNull();
    }
  });

  it('the wait says when it ends and the ways that work now; a signed-out device says so', () => {
    const until = new Date('2026-10-22T15:40:00Z');
    const withPin = passwordWaitMessage(until, { hasParentPin: true });
    expect(withPin).toMatch(/^Your password was changed recently without the old one being typed, so for safety it can't open 👪 Grown-ups until \w+ at /);
    expect(withPin).toMatch(/Use your grown-up PIN, or tap "Forgot it\?"/);
    expect(passwordWaitMessage(until, { hasParentPin: false })).not.toMatch(/PIN/);
    expect(passwordWaitMessage(null, { hasParentPin: false })).toMatch(/until tomorrow\./);
    expect(passwordWaitMessage(until, { hasParentPin: true, changing: true })).toMatch(/can't be changed here until .* Tap "Forgot it\?" to set a new one from your email instead\.$/);
    expect(DEVICE_SIGNED_OUT_MESSAGE).toMatch(/Sign in again/);
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

  it("notes this device's sign-in (never throws; silent on a database from before it)", async () => {
    await noteDeviceSession();
    expect(rpc).toHaveBeenCalledWith('note_device_session');
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } });
    await noteDeviceSession();
    expect(warn).not.toHaveBeenCalled();
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(noteDeviceSession()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('says a password change is coming from the given sign-in; the refusal comes back with its details', async () => {
    const ok = vi.fn(async () => ({ data: { allowed: true }, error: null }));
    await expect(allowPasswordChange({ rpc: ok } as never)).resolves.toBeNull();
    expect(ok).toHaveBeenCalledWith('allow_password_change');
    const missing = vi.fn(async () => ({ data: null, error: { code: 'PGRST202', message: 'missing' } }));
    await expect(allowPasswordChange({ rpc: missing } as never)).resolves.toBeNull();
    const waiting = vi.fn(async () => ({ data: null, error: { code: 'HQ002', message: 'password_changed: x', details: '2026-10-22T15:40:00Z' } }));
    await expect(allowPasswordChange({ rpc: waiting } as never)).resolves.toMatchObject({ code: 'HQ002', details: '2026-10-22T15:40:00Z' });
    const offline = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(allowPasswordChange({ rpc: offline } as never)).resolves.toBeInstanceOf(TypeError);
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
