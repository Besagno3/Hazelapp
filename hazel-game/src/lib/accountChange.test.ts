import { describe, it, expect, vi, beforeEach } from 'vitest';

// The device's own client (where the change is made) and the one-off client the current password is checked on.
const auth = vi.hoisted(() => ({ getSession: vi.fn(), updateUser: vi.fn(), reauthenticate: vi.fn() }));
const checkAuth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signOut: vi.fn(), updateUser: vi.fn() }));
const checkRpc = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ supabase: { auth, rpc }, passwordCheckClient: () => ({ auth: checkAuth, rpc: checkRpc }) }));

const {
  changePassword,
  checkCurrentPassword,
  currentPasswordRefused,
  currentPasswordWrong,
  looksLikeEmail,
  needsReauthCode,
  pendingEmailLine,
  requestEmailChange,
  sendReauthCode,
} = await import('./accountChange');
const { DEVICE_SESSION, deviceSession } = await import('../test/grownUps');

beforeEach(() => {
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue(deviceSession);
  auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
  auth.reauthenticate.mockResolvedValue({ data: {}, error: null });
  checkAuth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: 'fresh' } }, error: null });
  checkAuth.signOut.mockResolvedValue({ error: null });
  checkRpc.mockResolvedValue({ data: { unlocked: true }, error: null });
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('changing the login from 👪 Grown-ups (#124d)', () => {
  it('an email worth sending: something@something.something, no spaces', () => {
    for (const ok of ['mum@example.com', ' dad@x.co.uk ', 'a+b@c.io']) expect(looksLikeEmail(ok), ok).toBe(true);
    for (const bad of ['', 'mum', 'mum@', '@x.com', 'mum@x', 'm um@x.com', 'mum@x .com']) expect(looksLikeEmail(bad), bad).toBe(false);
  });

  it('the current password is checked on the one-off client, opens 👪 Grown-ups again, and is signed out before anything changes', async () => {
    await expect(checkCurrentPassword('mum@example.com', 'right')).resolves.toBeNull();
    // The device asks the database for the check before it signs in (#167 review round 2).
    expect(rpc).toHaveBeenCalledWith('ask_grown_up_check');
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(checkAuth.signInWithPassword.mock.invocationCallOrder[0]);
    expect(checkAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'mum@example.com', password: 'right' });
    expect(checkRpc).toHaveBeenCalledWith('unlock_grown_ups', { p_session: DEVICE_SESSION });
    expect(checkAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(checkRpc.mock.invocationCallOrder[0]).toBeLessThan(checkAuth.signOut.mock.invocationCallOrder[0]);
  });

  it('a wrong password comes back as the error; nothing is opened or signed out', async () => {
    const wrong = { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 };
    checkAuth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: wrong });
    await expect(checkCurrentPassword('mum@example.com', 'nope')).resolves.toBe(wrong);
    expect(checkRpc).not.toHaveBeenCalled();
    expect(checkAuth.signOut).not.toHaveBeenCalled();
  });

  it("opening 👪 Grown-ups again is a bonus: if it fails, the check still counts", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    checkRpc.mockResolvedValueOnce({ data: null, error: { code: 'HQ002', message: 'no' } });
    await expect(checkCurrentPassword('mum@example.com', 'right')).resolves.toBeNull();
    expect(checkAuth.signOut).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("asks for the new email on the device's own sign-in, with the link coming back to the game", async () => {
    await expect(requestEmailChange('  new@example.com ')).resolves.toBeNull();
    expect(auth.updateUser).toHaveBeenCalledWith(
      { email: 'new@example.com' },
      { emailRedirectTo: window.location.origin + window.location.pathname },
    );
    expect(checkAuth.updateUser).not.toHaveBeenCalled();
    const taken = { code: 'email_exists', message: 'A user with this email address has already been registered', status: 422 };
    auth.updateUser.mockResolvedValueOnce({ data: { user: null }, error: taken });
    await expect(requestEmailChange('taken@example.com')).resolves.toBe(taken);
  });

  it("sets the new password on the device's own sign-in (so it stays signed in), always with the current one (#167 review round 1), and the emailed code when there is one", async () => {
    await expect(changePassword('n3w-secret', 'old-one')).resolves.toBeNull();
    expect(auth.updateUser).toHaveBeenLastCalledWith({ password: 'n3w-secret', current_password: 'old-one' });
    await changePassword('n3w-secret', 'old-one', ' 123456 ');
    expect(auth.updateUser).toHaveBeenLastCalledWith({ password: 'n3w-secret', current_password: 'old-one', nonce: '123456' });
    expect(checkAuth.updateUser).not.toHaveBeenCalled();
    expect(currentPasswordRefused({ code: 'current_password_mismatch', message: 'Current password required when setting new password.' })).toBe(true);
    expect(currentPasswordRefused({ code: 'current_password_required' })).toBe(true);
    expect(currentPasswordRefused({ code: 'weak_password' })).toBe(false);
  });

  it('for a password change, the check also says the change is coming — and its refusal comes back (#167 review round 1)', async () => {
    await expect(checkCurrentPassword('mum@example.com', 'right', { forPasswordChange: true })).resolves.toBeNull();
    expect(checkRpc).toHaveBeenNthCalledWith(1, 'unlock_grown_ups', { p_session: DEVICE_SESSION });
    // …for this device's sign-in, which that check has just opened (review round 2).
    expect(checkRpc).toHaveBeenNthCalledWith(2, 'allow_password_change', { p_session: DEVICE_SESSION });
    expect(checkRpc.mock.invocationCallOrder[1]).toBeLessThan(checkAuth.signOut.mock.invocationCallOrder[0]);
    // Changed without the old one: the database says so, and so does the check.
    const wait = { code: 'HQ002', message: 'password_changed: x', details: '2026-10-22T15:40:00Z' };
    checkRpc.mockReset().mockResolvedValue({ data: null, error: wait });
    await expect(checkCurrentPassword('mum@example.com', 'right', { forPasswordChange: true })).resolves.toMatchObject({ code: 'HQ002', details: wait.details });
    expect(checkRpc).toHaveBeenCalledTimes(1);
    // This device's sign-in has ended: said, nothing more asked.
    checkRpc.mockReset().mockResolvedValue({ data: null, error: { code: 'HQ002', message: "no_session: that sign-in isn't a live one of yours" } });
    await expect(checkCurrentPassword('mum@example.com', 'right', { forPasswordChange: true })).resolves.toMatchObject({ message: /^no_session/ });
    // An email change needs neither: the check counts whatever opening said.
    checkRpc.mockReset().mockResolvedValue({ data: null, error: wait });
    await expect(checkCurrentPassword('mum@example.com', 'right')).resolves.toBeNull();
    expect(checkRpc).toHaveBeenCalledTimes(1);
  });

  it('only the sign-in\'s "invalid login credentials" is a wrong current password — never a refusal or a lost connection (review round 2)', async () => {
    expect(currentPasswordWrong({ code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 })).toBe(true);
    expect(currentPasswordWrong({ message: 'Invalid login credentials' })).toBe(true);
    for (const other of [
      new TypeError('Failed to fetch'),
      { code: 'HQ002', message: 'reauth_required: x' },
      { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' },
      null,
    ]) {
      expect(currentPasswordWrong(other), JSON.stringify(other)).toBe(false);
    }
    // Announcing the change failing on the network comes back as that failure (not a wrong password).
    checkRpc.mockResolvedValueOnce({ data: { unlocked: true }, error: null }).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const lost = await checkCurrentPassword('mum@example.com', 'right', { forPasswordChange: true });
    expect(lost).toBeInstanceOf(TypeError);
    expect(currentPasswordWrong(lost)).toBe(false);
  });

  it('the waiting-email line: links still to tap within a day, else no longer working (#167 review round 1)', () => {
    const now = Date.parse('2026-10-21T12:00:00Z');
    expect(pendingEmailLine('mum@example.com', '', null, now)).toBeNull();
    expect(pendingEmailLine('mum@example.com', 'MUM@example.com', '2026-10-21T11:00:00Z', now)).toBeNull();
    expect(pendingEmailLine('mum@example.com', 'new@example.com', '2026-10-21T11:00:00Z', now)).toBe(
      'Waiting for you to tap the link in each email we sent, to change it to new@example.com.',
    );
    expect(pendingEmailLine('mum@example.com', 'new@example.com', '2026-10-19T11:00:00Z', now)).toMatch(/don't work any more\. Tap "Change email…"/);
    // A password change clears when they were sent (it cancels them).
    expect(pendingEmailLine('mum@example.com', 'new@example.com', null, now)).toMatch(/don't work any more/);
  });

  it('knows when Supabase wants the emailed code first, and sends it', async () => {
    expect(needsReauthCode({ code: 'reauthentication_needed', message: 'Password update requires reauthentication' })).toBe(true);
    expect(needsReauthCode({ message: 'Password update requires reauthentication' })).toBe(true);
    expect(needsReauthCode({ code: 'weak_password', message: 'Password should be at least 8 characters' })).toBe(false);
    expect(needsReauthCode(null)).toBe(false);
    await expect(sendReauthCode()).resolves.toBeNull();
    expect(auth.reauthenticate).toHaveBeenCalled();
    const limit = { code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 42 seconds.', status: 429 };
    auth.reauthenticate.mockResolvedValueOnce({ data: null, error: limit });
    await expect(sendReauthCode()).resolves.toBe(limit);
  });
});
