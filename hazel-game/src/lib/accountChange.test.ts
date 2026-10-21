import { describe, it, expect, vi, beforeEach } from 'vitest';

// The device's own client (where the change is made) and the one-off client the current password is checked on.
const auth = vi.hoisted(() => ({ getSession: vi.fn(), updateUser: vi.fn(), reauthenticate: vi.fn() }));
const checkAuth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signOut: vi.fn(), updateUser: vi.fn() }));
const checkRpc = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ supabase: { auth }, passwordCheckClient: () => ({ auth: checkAuth, rpc: checkRpc }) }));

const { changePassword, checkCurrentPassword, looksLikeEmail, needsReauthCode, requestEmailChange, sendReauthCode } = await import('./accountChange');
const { DEVICE_SESSION, deviceSession } = await import('../test/grownUps');

beforeEach(() => {
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue(deviceSession);
  auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
  auth.reauthenticate.mockResolvedValue({ data: {}, error: null });
  checkAuth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: 'fresh' } }, error: null });
  checkAuth.signOut.mockResolvedValue({ error: null });
  checkRpc.mockResolvedValue({ data: { unlocked: true }, error: null });
});

describe('changing the login from 👪 Grown-ups (#124d)', () => {
  it('an email worth sending: something@something.something, no spaces', () => {
    for (const ok of ['mum@example.com', ' dad@x.co.uk ', 'a+b@c.io']) expect(looksLikeEmail(ok), ok).toBe(true);
    for (const bad of ['', 'mum', 'mum@', '@x.com', 'mum@x', 'm um@x.com', 'mum@x .com']) expect(looksLikeEmail(bad), bad).toBe(false);
  });

  it('the current password is checked on the one-off client, opens 👪 Grown-ups again, and is signed out before anything changes', async () => {
    await expect(checkCurrentPassword('mum@example.com', 'right')).resolves.toBeNull();
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

  it("sets the new password on the device's own sign-in (so it stays signed in), with the emailed code when there is one", async () => {
    await expect(changePassword('n3w-secret')).resolves.toBeNull();
    expect(auth.updateUser).toHaveBeenLastCalledWith({ password: 'n3w-secret' });
    await changePassword('n3w-secret', ' 123456 ');
    expect(auth.updateUser).toHaveBeenLastCalledWith({ password: 'n3w-secret', nonce: '123456' });
    expect(checkAuth.updateUser).not.toHaveBeenCalled();
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
