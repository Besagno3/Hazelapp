import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { Kid } from '../../types';

// The device's own client (the change is made on it) and the one-off client the password is checked on.
const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  reauthenticate: vi.fn(),
}));
const rpc = vi.hoisted(() => vi.fn());
const checkAuth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signOut: vi.fn() }));
const checkRpc = vi.hoisted(() => vi.fn());
vi.mock('../../lib/supabase', () => ({ supabase: { auth, rpc }, passwordCheckClient: () => ({ auth: checkAuth, rpc: checkRpc }) }));
vi.mock('../../lib/review', async (original) => ({
  ...(await original<typeof import('../../lib/review')>()),
  isAdmin: vi.fn(async () => false),
}));

const { default: GrownUpsArea } = await import('./GrownUpsArea');
const { useFamilyStore } = await import('../../store/familyStore');
const { useAuthStore } = await import('../../store/authStore');
const { DEVICE_SESSION, deviceSession } = await import('../../test/grownUps');

const sam: Kid = { id: 'kid-sam', name: 'Sam', icon: 'fox', hasPin: true, birthYear: 2017, birthMonth: 3 };
const wrongPassword = { data: { session: null }, error: { name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' } };
const pageStatus = () => screen.getAllByRole('status').find((el) => !el.classList.contains('sr-only'))!;

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  auth.getSession.mockResolvedValue(deviceSession);
  auth.getUser.mockResolvedValue({ data: { user: { email: 'mum@example.com' } }, error: null });
  auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
  auth.reauthenticate.mockResolvedValue({ data: {}, error: null });
  auth.signOut.mockResolvedValue({ error: null });
  rpc.mockResolvedValue({ data: { kids: {}, grown_up: 0 }, error: null });
  checkAuth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: 'fresh' } }, error: null });
  checkAuth.signOut.mockResolvedValue({ error: null });
  checkRpc.mockResolvedValue({ data: { unlocked: true, seconds: 900 }, error: null });
  useAuthStore.setState({ user: { id: 'grown-up-1', email: 'mum@example.com' } as never });
  useFamilyStore.setState({ userId: 'grown-up-1', status: 'ready', kids: [sam], consentAt: '2026-10-10T10:00:00Z', hasParentPin: false, reviewRequested: false });
});
afterEach(() => {
  warn.mockRestore();
  vi.useRealTimers();
});

/** Open 👪 Grown-ups with the password, then one of "Your sign-in"'s buttons. */
async function open(button: 'Change email…' | 'Change password…') {
  render(<GrownUpsArea />);
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'right' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  await screen.findByText('Sam');
  vi.clearAllMocks();
  checkRpc.mockResolvedValue({ data: { unlocked: true, seconds: 900 }, error: null });
  checkAuth.signOut.mockResolvedValue({ error: null });
  checkAuth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: 'fresh' } }, error: null });
  fireEvent.click(screen.getByRole('button', { name: button }));
}

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('Your sign-in in 👪 Grown-ups (#124d)', () => {
  it('shows the email it signs in with, a change waiting for its link, and both ways to change it', async () => {
    useAuthStore.setState({ user: { id: 'grown-up-1', email: 'mum@example.com', new_email: 'mum@new.example' } as never });
    render(<GrownUpsArea />);
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'right' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const section = (await screen.findByRole('heading', { name: 'Your sign-in' })).closest('section')!;
    expect(section).toHaveTextContent('mum@example.com');
    expect(section).toHaveTextContent('Waiting for you to tap the link we emailed to change it to mum@new.example.');
    for (const name of ['Change email…', 'Change password…']) expect(screen.getByRole('button', { name })).toHaveClass('min-h-11');
  });
});

describe('Change email (#124d)', () => {
  it('opens with its title focused; Cancel goes back with focus on "Change email…"', async () => {
    await open('Change email…');
    expect(screen.getByRole('heading', { name: 'Change your sign-in email' })).toHaveFocus();
    expect(screen.getByText(/You sign in with/)).toHaveTextContent('You sign in with mum@example.com.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'Change email…' })).toHaveFocus();
  });

  it('checks the address and the password before asking anyone — the box it means is marked', async () => {
    await open('Change email…');
    const submit = screen.getByRole('button', { name: 'Change email' });
    type('New email', 'not-an-email');
    fireEvent.click(submit);
    expect(pageStatus()).toHaveTextContent("That email address doesn't look right. Check it and try again.");
    expect(screen.getByLabelText('New email')).toHaveAttribute('aria-invalid', 'true');
    type('New email', 'MUM@example.com');
    fireEvent.click(submit);
    expect(pageStatus()).toHaveTextContent("That's the email you sign in with now.");
    type('New email', 'new@example.com');
    fireEvent.click(submit);
    expect(pageStatus()).toHaveTextContent('Enter your password to change your email.');
    expect(screen.getByLabelText(/Your password now/)).toHaveAttribute('aria-invalid', 'true');
    expect(checkAuth.signInWithPassword).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('a wrong password is said plainly, the box marked and selected; nothing is changed', async () => {
    await open('Change email…');
    checkAuth.signInWithPassword.mockResolvedValue(wrongPassword);
    type('New email', 'new@example.com');
    type(/Your password now/, 'nope');
    fireEvent.click(screen.getByRole('button', { name: 'Change email' }));
    await waitFor(() => expect(pageStatus()).toHaveTextContent('That password isn\'t right. Try again, or tap "Forgot it?" below.'));
    expect(screen.getByLabelText(/Your password now/)).toHaveFocus();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(screen.queryByText(/Invalid login credentials/)).toBeNull();
  });

  it("checks the password on the one-off client, asks for the change on this device's sign-in, then says exactly what happens next", async () => {
    await open('Change email…');
    type('New email', ' new@example.com ');
    type(/Your password now/, 'right');
    const submit = screen.getByRole('button', { name: 'Change email' });
    fireEvent.click(submit);
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    expect(await screen.findByRole('heading', { name: '📬 Check your email' })).toHaveFocus();
    expect(checkAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'mum@example.com', password: 'right' });
    expect(checkRpc).toHaveBeenCalledWith('unlock_grown_ups', { p_session: DEVICE_SESSION });
    expect(checkAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(auth.updateUser).toHaveBeenCalledWith({ email: 'new@example.com' }, { emailRedirectTo: expect.any(String) });
    expect(checkAuth.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(auth.updateUser.mock.invocationCallOrder[0]);
    const page = screen.getByRole('heading', { name: '📬 Check your email' }).parentElement!;
    expect(page).toHaveTextContent("We've sent a confirmation link to new@example.com. We may also send one to mum@example.com, to make sure the change is yours — tap the link in each email you get.");
    expect(page).toHaveTextContent("Your sign-in email changes once that's done. Until then, keep signing in with mum@example.com.");
    expect(page).toHaveTextContent('Devices already signed in stay signed in.');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('button', { name: 'Change email…' })).toHaveFocus();
  });

  it('an address that already has an account says to choose another, and marks the box', async () => {
    auth.updateUser.mockResolvedValue({ data: { user: null }, error: { code: 'email_exists', status: 422, message: 'A user with this email address has already been registered' } });
    await open('Change email…');
    type('New email', 'taken@example.com');
    type(/Your password now/, 'right');
    fireEvent.click(screen.getByRole('button', { name: 'Change email' }));
    await waitFor(() => expect(pageStatus()).toHaveTextContent("There's already an account with that email address. Choose a different one."));
    expect(screen.getByLabelText('New email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('a rate limit counts its wait down on the button; the email cap says an hour', async () => {
    auth.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { code: 'over_email_send_rate_limit', status: 429, message: 'For security purposes, you can only request this after 42 seconds.' },
    });
    await open('Change email…');
    type('New email', 'new@example.com');
    type(/Your password now/, 'right');
    fireEvent.click(screen.getByRole('button', { name: 'Change email' }));
    await waitFor(() => expect(pageStatus()).toHaveTextContent('Too many tries for now. Please wait 42 seconds, then try again.'));
    const waiting = screen.getByRole('button', { name: 'Change email in 42 seconds' });
    expect(waiting).toHaveAttribute('aria-disabled', 'true');
    expect(waiting).toHaveTextContent('Change email in 42s');
  });

  it('a sign-in that ran out offers "Sign in again"', async () => {
    auth.updateUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthSessionMissingError', message: 'Auth session missing!', status: 400 } });
    await open('Change email…');
    type('New email', 'new@example.com');
    type(/Your password now/, 'right');
    fireEvent.click(screen.getByRole('button', { name: 'Change email' }));
    await waitFor(() => expect(pageStatus()).toHaveTextContent('Your sign-in ran out — please sign in again.'));
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeInTheDocument();
  });
});

describe('Change password (#124d)', () => {
  it('holds to the sign-up rules before asking anyone', async () => {
    await open('Change password…');
    expect(screen.getByRole('heading', { name: 'Change your password' })).toHaveFocus();
    const submit = screen.getByRole('button', { name: 'Change password' });
    fireEvent.click(submit);
    expect(pageStatus()).toHaveTextContent('Enter the password you have now.');
    type(/Your password now/, 'old-secret');
    type('New password', 'short');
    fireEvent.click(submit);
    expect(pageStatus()).toHaveTextContent('Use at least 6 characters.');
    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true');
    type('New password', 'longer-one');
    type('New password again', 'longer-two');
    fireEvent.click(submit);
    expect(pageStatus()).toHaveTextContent("The two new passwords don't match.");
    type('New password', 'old-secret');
    type('New password again', 'old-secret');
    fireEvent.click(submit);
    expect(pageStatus()).toHaveTextContent("That's the password you have now. Choose a new one.");
    expect(checkAuth.signInWithPassword).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  async function fillAndSave(current = 'old-secret', next = 'n3w-secret!') {
    type(/Your password now/, current);
    type('New password', next);
    type('New password again', next);
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  }

  it("checks the current one on the one-off client, sets the new one on this device's sign-in, and says who stays signed in", async () => {
    await open('Change password…');
    await fillAndSave();
    expect(await screen.findByRole('heading', { name: '🔑 Password changed' })).toHaveFocus();
    expect(checkAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'mum@example.com', password: 'old-secret' });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'n3w-secret!' });
    expect(checkAuth.signOut.mock.invocationCallOrder[0]).toBeLessThan(auth.updateUser.mock.invocationCallOrder[0]);
    const page = screen.getByRole('heading', { name: '🔑 Password changed' }).parentElement!;
    expect(page).toHaveTextContent('Use your new password from now on.');
    expect(page).toHaveTextContent('This device stays signed in. Other phones, tablets and computers signed in to this account are signed out within about an hour, and need the new password to sign in again.');
  });

  it('a wrong current password changes nothing', async () => {
    await open('Change password…');
    checkAuth.signInWithPassword.mockResolvedValue(wrongPassword);
    await fillAndSave('nope');
    await waitFor(() => expect(pageStatus()).toHaveTextContent('That password isn\'t right. Try again, or tap "Forgot it?" below.'));
    expect(screen.getByLabelText(/Your password now/)).toHaveAttribute('aria-invalid', 'true');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("the server's own password rules are said in words, on the new password's box", async () => {
    auth.updateUser.mockResolvedValue({ data: { user: null }, error: { code: 'weak_password', status: 422, message: 'Password is known to be weak and easy to guess, please choose a different one.', reasons: ['pwned'] } });
    await open('Change password…');
    await fillAndSave('old-secret', 'password1');
    await waitFor(() => expect(pageStatus()).toHaveTextContent('That password has shown up in a data leak. Choose a different one.'));
    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('when Supabase wants a code first, it is emailed and asked for; the code saves the new password', async () => {
    auth.updateUser
      .mockResolvedValueOnce({ data: { user: null }, error: { code: 'reauthentication_needed', status: 400, message: 'Password update requires reauthentication' } })
      .mockResolvedValueOnce({ data: { user: null }, error: { code: 'reauthentication_not_valid', status: 400, message: 'Nonce has expired or is invalid' } })
      .mockResolvedValueOnce({ data: { user: {} }, error: null });
    await open('Change password…');
    await fillAndSave();
    expect(await screen.findByRole('heading', { name: 'Enter the code we emailed' })).toHaveFocus();
    expect(auth.reauthenticate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(pageStatus()).toHaveTextContent('A 6-digit code is on its way to mum@example.com.'));
    const save = screen.getByRole('button', { name: 'Save new password' });
    type('Code from the email', '12');
    fireEvent.click(save);
    expect(pageStatus()).toHaveTextContent('The code is the 6 numbers in the email.');
    type('Code from the email', '11 11 11');
    expect(screen.getByLabelText('Code from the email')).toHaveValue('111111');
    fireEvent.click(save);
    await waitFor(() => expect(pageStatus()).toHaveTextContent('That code isn\'t right, or it has run out. Check the newest email, or tap "Send a new code".'));
    expect(auth.updateUser).toHaveBeenLastCalledWith({ password: 'n3w-secret!', nonce: '111111' });
    type('Code from the email', '123456');
    fireEvent.click(save);
    expect(await screen.findByRole('heading', { name: '🔑 Password changed' })).toBeInTheDocument();
    expect(auth.updateUser).toHaveBeenLastCalledWith({ password: 'n3w-secret!', nonce: '123456' });
  });

  it('"Send a new code" waits a minute after one went out, and counts a refusal\'s wait', async () => {
    auth.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'reauthentication_needed', status: 400, message: 'Password update requires reauthentication' } });
    await open('Change password…');
    await fillAndSave();
    await screen.findByRole('heading', { name: 'Enter the code we emailed' });
    const again = await screen.findByRole('button', { name: /Send a new code in/ });
    expect(again).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(again);
    expect(auth.reauthenticate).toHaveBeenCalledTimes(1);
    await act(async () => {});
  });
});
