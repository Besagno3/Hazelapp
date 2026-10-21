import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The device's own client (its stored session, its database calls).
const auth = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn() }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ supabase: { auth, rpc } }));

const {
  allowPasswordChange,
  askForPasswordCheck,
  deviceSessionId,
  dropPasswordChange,
  lockGrownUps,
  noteDeviceSession,
  openForFirstRun,
  openGrownUpsWith,
  signInEmail,
} = await import('./grownUps');
const {
  DEVICE_SIGNED_OUT_MESSAGE,
  DEVICE_SIGNED_OUT_WHY,
  DeviceSignedOutError,
  LAPSED_NOTE,
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
  waitLead,
  whenWords,
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

  it('"locked again" only in 👪 Grown-ups; a setup screen says what the step needs, for the parent and a kid alike; the PIN only when there is one', () => {
    expect(grownUpsLockedMessage({ inArea: true, hasParentPin: true })).toBe(
      '👪 Grown-ups locked again, so nothing changed. Try again and enter your grown-up PIN or password when asked.',
    );
    expect(grownUpsLockedMessage({ inArea: true, hasParentPin: false })).toBe(
      '👪 Grown-ups locked again, so nothing changed. Try again and enter your password when asked.',
    );
    // Review round 2: the parent who just ticked "I'm 18 or older" isn't told to fetch a grown-up.
    expect(grownUpsLockedMessage({ inArea: false, hasParentPin: false })).toBe(
      "Nothing changed — this step needs a grown-up's password. Not a grown-up? Please fetch one.",
    );
    expect(grownUpsLockedMessage({ inArea: false, hasParentPin: true })).toBe(
      "Nothing changed — this step needs a grown-up's password or grown-up PIN. Not a grown-up? Please fetch one.",
    );
    for (const pin of [true, false]) expect(grownUpsLockedMessage({ inArea: false, hasParentPin: pin })).not.toMatch(/Ask a grown-up|again,/);
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

  it('while the password waits the lead names what works; signed out, it never promises the page stays (review round 2)', () => {
    expect(relockLead('password-wait', 'mum@example.com', true)).toBe(
      'Use your grown-up PIN for now. Everything on this page stays as it was.',
    );
    expect(relockLead('password-wait', 'mum@example.com', false)).toBe(
      'Reset your password to open it now. Everything on this page stays as it was.',
    );
    for (const pin of [true, false]) expect(relockLead('password-wait', 'mum@example.com', pin)).not.toMatch(/Enter the password/);
    expect(relockLead('signed-out', 'mum@example.com')).toBe("Sign in again to carry on — what you typed here won't be kept.");
    expect(relockLead('signed-out', 'mum@example.com')).not.toMatch(/stays as it was/);
    expect(waitLead(true)).toBe('Use your grown-up PIN for now.');
    expect(LAPSED_NOTE).toBe('👪 Grown-ups locked after 15 minutes.');
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

  it('the wait says calmly what happened, until when, what still works, and how to end it now (review round 2)', () => {
    const now = new Date(2026, 9, 21, 9, 0);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    try {
      const later = new Date(2026, 9, 21, 20, 24);
      const withPin = passwordWaitMessage(later, { hasParentPin: true });
      expect(withPin).toMatch(/^Your password was changed recently, so for safety it can't open 👪 Grown-ups until today at 8:24\sPM\. Your grown-up PIN still works\.$/);
      // True for whoever reads it: no claim the old one wasn't typed, nothing alarming.
      for (const pin of [true, false]) expect(passwordWaitMessage(later, { hasParentPin: pin })).not.toMatch(/without the old one|someone/);
      const noPin = passwordWaitMessage(later, { hasParentPin: false });
      expect(noPin).not.toMatch(/PIN/);
      expect(noPin).toMatch(/Didn't change it, or need it sooner\? A new password from a reset email works at once\.$/);
      expect(passwordWaitMessage(null, { hasParentPin: false })).toMatch(/until tomorrow\./);
      expect(passwordWaitMessage(new Date(2026, 9, 22, 8, 5), { doing: 'change' })).toMatch(
        /^Your password was changed recently, so for safety it can't be changed here until tomorrow at 8:05\sAM\. Didn't change it, or need it sooner\? Tap "Forgot it\?" under the password box to reset it by email\.$/,
      );
      expect(passwordWaitMessage(later, { doing: 'close' })).toMatch(/can't close the account until today at .* Nothing was deleted\. Didn't change it/);
    } finally {
      vi.useRealTimers();
    }
    expect(DEVICE_SIGNED_OUT_MESSAGE).toBe(`${DEVICE_SIGNED_OUT_WHY} Sign in again to carry on.`);
  });

  it('a wait ending today says "today", tomorrow "tomorrow" — never the weekday it is now (review round 2)', () => {
    const wed = new Date(2026, 9, 21, 9, 0); // a Wednesday
    expect(whenWords(new Date(2026, 9, 21, 20, 24), wed)).toMatch(/^today at 8:24\sPM$/);
    expect(whenWords(new Date(2026, 9, 22, 8, 24), wed)).toMatch(/^tomorrow at 8:24\sAM$/);
    expect(whenWords(new Date(2026, 9, 21, 23, 59), new Date(2026, 9, 21, 0, 1))).toMatch(/^today at/);
    // Past midnight it's tomorrow, even under 24 hours away.
    expect(whenWords(new Date(2026, 9, 22, 0, 30), new Date(2026, 9, 21, 23, 30))).toMatch(/^tomorrow at 12:30\sAM$/);
    expect(whenWords(new Date(2026, 9, 24, 10, 0), wed)).toMatch(/^Saturday at 10:00\sAM$/);
    expect(whenWords(null, wed)).toBe('tomorrow');
  });

  it('a right grown-up PIN on an ended sign-in is said in the same words as the password\'s refusal', () => {
    expect(plainErrorOr(new DeviceSignedOutError(), 'fallback')).toBe(DEVICE_SIGNED_OUT_MESSAGE);
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

  it('asks for a password check on this device\'s own sign-in first, and says which sign-in it is (review round 2)', async () => {
    await expect(askForPasswordCheck()).resolves.toBe(DEVICE_SESSION);
    expect(rpc).toHaveBeenCalledWith('ask_grown_up_check');
    // Never throws: a refusal or a lost connection is logged, and the check that follows says why.
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'HQ002', message: 'no_session: this sign-in has ended' } });
    await expect(askForPasswordCheck()).resolves.toBe(DEVICE_SESSION);
    expect(warn).toHaveBeenCalledWith('Asking for a password check failed:', expect.stringMatching(/no_session/));
    warn.mockClear();
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } });
    await askForPasswordCheck();
    expect(warn).not.toHaveBeenCalled();
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(askForPasswordCheck()).resolves.toBe(DEVICE_SESSION);
    // No sign-in to read: nothing to ask.
    rpc.mockClear();
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(askForPasswordCheck()).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('says a password change is coming for the sign-in named (or the reset link\'s own); the refusal comes back with its details', async () => {
    const ok = vi.fn(async () => ({ data: { allowed: true }, error: null }));
    await expect(allowPasswordChange({ rpc: ok } as never)).resolves.toBeNull();
    expect(ok).toHaveBeenCalledWith('allow_password_change', {});
    await allowPasswordChange({ rpc: ok } as never, DEVICE_SESSION);
    expect(ok).toHaveBeenLastCalledWith('allow_password_change', { p_session: DEVICE_SESSION });
    const missing = vi.fn(async () => ({ data: null, error: { code: 'PGRST202', message: 'missing' } }));
    await expect(allowPasswordChange({ rpc: missing } as never)).resolves.toBeNull();
    const waiting = vi.fn(async () => ({ data: null, error: { code: 'HQ002', message: 'password_changed: x', details: '2026-10-22T15:40:00Z' } }));
    await expect(allowPasswordChange({ rpc: waiting } as never)).resolves.toMatchObject({ code: 'HQ002', details: '2026-10-22T15:40:00Z' });
    const offline = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(allowPasswordChange({ rpc: offline } as never)).resolves.toBeInstanceOf(TypeError);
  });

  it('a failed change drops its allowance at once; never throws', async () => {
    await dropPasswordChange();
    expect(rpc).toHaveBeenCalledWith('drop_password_change');
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } });
    await dropPasswordChange();
    expect(warn).not.toHaveBeenCalled();
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(dropPasswordChange()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
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
