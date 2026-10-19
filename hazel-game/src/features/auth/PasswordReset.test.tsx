import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const auth = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
}));
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));

const { default: AuthPage } = await import('./AuthPage');
const { default: ResetPasswordPage } = await import('./ResetPasswordPage');
const { isRecoveryUrl } = await import('./useAuthInit');
const { useAuthStore } = await import('../../store/authStore');
const { CONSENT_VERSION, MIN_PASSWORD_LENGTH } = await import('../../content/family');

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ passwordRecovery: false });
  // The raw errors go to the console (#130 S6); keep the test output quiet.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
});

describe('isRecoveryUrl', () => {
  it('spots a reset-email link in the hash or the query', () => {
    expect(isRecoveryUrl({ hash: '#access_token=x&type=recovery', search: '' })).toBe(true);
    expect(isRecoveryUrl({ hash: '', search: '?type=recovery' })).toBe(true);
  });
  it('ignores ordinary links', () => {
    expect(isRecoveryUrl({ hash: '#access_token=x&type=signup', search: '' })).toBe(false);
    expect(isRecoveryUrl({ hash: '', search: '' })).toBe(false);
  });
});

describe('AuthPage — forgot password', () => {
  it('sends a reset link back to this page and shows a neutral notice', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    render(<AuthPage />);
    fireEvent.click(screen.getByText('Forgot password?'));
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'kid@example.com' } });
    fireEvent.click(screen.getByText('Send reset link'));
    expect(await screen.findByText(/If that email has an account/)).toHaveClass('text-green-700');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('kid@example.com', {
      redirectTo: window.location.origin + window.location.pathname,
    });
  });

  it('says what went wrong in plain words when the request fails (e.g. rate limited, #130 S6)', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { message: 'Too many requests', status: 429 } });
    render(<AuthPage />);
    fireEvent.click(screen.getByText('Forgot password?'));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'kid@example.com' } });
    fireEvent.click(screen.getByText('Send reset link'));
    await screen.findByText('Too many tries for now. Please wait a minute, then try again.');
    // The raw error goes to the console for whoever fixes it.
    expect(console.warn).toHaveBeenCalledWith('Reset link failed:', 'Too many requests');
  });
});

describe('AuthPage — a grown-up signs up (#124)', () => {
  function signUpWith(email: string, password: string) {
    fireEvent.click(screen.getByText('New here? Grown-ups sign up'));
    fireEvent.change(screen.getByLabelText("Grown-up's email"), { target: { value: email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  }

  it('asks no birth date, and needs the grown-up to agree first', () => {
    render(<AuthPage />);
    signUpWith('mum@example.com', 'dragonfire');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Create family account'));
    expect(screen.getByText(/tick the box/)).toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('sends the version of the notice they agreed to', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    render(<AuthPage />);
    signUpWith('mum@example.com', 'dragonfire');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Create family account'));
    await screen.findByRole('heading', { name: 'Check your inbox' });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'mum@example.com',
      password: 'dragonfire',
      options: { data: { consent_version: CONSENT_VERSION } },
    });
  });

  it('says the password rule up front, and the field holds to it', () => {
    render(<AuthPage />);
    fireEvent.click(screen.getByText('New here? Grown-ups sign up'));
    const field = screen.getByLabelText('Password');
    expect(field).toHaveAccessibleDescription(`At least ${MIN_PASSWORD_LENGTH} characters.`);
    expect(field).toHaveAttribute('minlength', String(MIN_PASSWORD_LENGTH));
    // Sign in takes whatever password the account already has.
    fireEvent.click(screen.getByText('Already have an account? Sign in'));
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('minlength');
    expect(screen.queryByText(/At least \d+ characters/)).not.toBeInTheDocument();
  });

  it('shows its messages in a live region, in colours that are easy to read', () => {
    render(<AuthPage />);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    signUpWith('mum@example.com', 'dragonfire');
    fireEvent.click(screen.getByText('Create family account'));
    expect(region).toHaveTextContent(/tick the box/);
    expect(screen.getByText(/tick the box/)).toHaveClass('text-red-700');
  });

  it('then says which inbox to check, and goes back to sign in with the email kept', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    render(<AuthPage />);
    signUpWith('mum@example.com', 'dragonfire');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Create family account'));
    const heading = await screen.findByRole('heading', { name: 'Check your inbox' });
    expect(heading).toHaveFocus();
    expect(screen.getByText('mum@example.com')).toBeInTheDocument();
    expect(screen.getByText(/spam or junk/)).toBeInTheDocument();
    // The form is gone until they go back.
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('mum@example.com');
    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('signing up with an email that has an account says to sign in — "Forgot password?" is hidden on sign-up', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: { code: 'user_already_exists', message: 'User already registered', status: 422 } });
    render(<AuthPage />);
    fireEvent.click(screen.getByText('New here? Grown-ups sign up'));
    fireEvent.change(screen.getByLabelText("Grown-up's email"), { target: { value: 'mum@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'dragonfire' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Create family account'));
    await screen.findByText('There\'s already an account with that email. Tap "Sign in" below instead.');
    expect(screen.queryByText('Forgot password?')).toBeNull();
    expect(screen.getByRole('button', { name: /Sign in$/ })).toBeInTheDocument();
  });

  it('a stricter password rule on sign-up names what the typed password is missing', async () => {
    auth.signUp.mockResolvedValue({
      data: { session: null },
      error: {
        code: 'weak_password',
        message: 'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.',
        reasons: ['characters'],
        status: 422,
      },
    });
    render(<AuthPage />);
    fireEvent.click(screen.getByText('New here? Grown-ups sign up'));
    fireEvent.change(screen.getByLabelText("Grown-up's email"), { target: { value: 'mum@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'dragon7fire' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Create family account'));
    // It has small letters and a number: only the capital is missing.
    await screen.findByText('That password needs a capital letter.');
  });
});

describe('AuthPage — signing in before confirming', () => {
  function signIn() {
    render(<AuthPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'mum@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'dragonfire' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
  }

  it('says to tap the link, naming the email, instead of a raw error', async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: { code: 'email_not_confirmed', message: 'Email not confirmed', name: 'AuthApiError' },
    });
    signIn();
    const message = await screen.findByText(/Please confirm your email first/);
    expect(message).toHaveTextContent('tap the link we sent to mum@example.com');
    expect(message).not.toHaveTextContent('[email_not_confirmed]');
  });

  it('spots it by its message too (older Supabase replies carry no code)', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Email not confirmed' } });
    signIn();
    await screen.findByText(/Please confirm your email first/);
  });

  it('a wrong email or password says so in plain words, not the raw error (#130 S6)', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'Invalid login credentials', name: 'AuthApiError' } });
    signIn();
    await screen.findByText(/That email and password don't match/);
    expect(screen.queryByText('Invalid login credentials')).toBeNull();
    // Only an unconfirmed email offers the link again.
    expect(screen.queryByRole('button', { name: /Send the link again/ })).toBeNull();
  });

  it('offline, it says to check the connection', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 } });
    signIn();
    await screen.findByText(/couldn't reach Hazel Quest\. Check your internet connection/);
  });

  it('offers the link again, and sends it (#146)', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: 'email_not_confirmed', message: 'Email not confirmed' } });
    auth.resend.mockResolvedValue({ data: {}, error: null });
    signIn();
    fireEvent.click(await screen.findByRole('button', { name: '📨 Send the link again' }));
    await screen.findByRole('heading', { name: 'Check your inbox' });
    expect(auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'mum@example.com' });
    expect(screen.getByText(/Sent! A new link is on its way to mum@example\.com/)).toHaveClass('text-green-700');
    // It just went: the button waits before another.
    expect(screen.getByRole('button', { name: /Send the link again in \d+ seconds/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('the offer goes with its message (Forgot password? clears both)', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: 'email_not_confirmed', message: 'Email not confirmed' } });
    signIn();
    await screen.findByRole('button', { name: '📨 Send the link again' });
    fireEvent.click(screen.getByText('Forgot password?'));
    expect(screen.queryByText(/Please confirm your email first/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Send the link again/ })).toBeNull();
  });
});

describe('AuthPage — send the link again (#146)', () => {
  async function signUp() {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    render(<AuthPage />);
    fireEvent.click(screen.getByText('New here? Grown-ups sign up'));
    fireEvent.change(screen.getByLabelText("Grown-up's email"), { target: { value: 'mum@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'dragonfire' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Create family account'));
    await act(async () => {});
  }
  const tick = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  it('waits a minute after sign-up, counting down, then sends a new link', async () => {
    vi.useFakeTimers();
    auth.resend.mockResolvedValue({ data: {}, error: null });
    await signUp();
    expect(screen.getByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    // The sign-up email only just went: Supabase would refuse another yet.
    // The wait in words ("60s" can be read as "sixties"); on screen, short.
    const wait = screen.getByRole('button', { name: 'Send the link again in 60 seconds' });
    expect(wait).toHaveTextContent('Send the link again in 60s');
    expect(wait).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(wait);
    expect(auth.resend).not.toHaveBeenCalled();
    tick(20_000);
    expect(screen.getByRole('button', { name: 'Send the link again in 40 seconds' })).toHaveAttribute('aria-disabled', 'true');
    tick(40_000);
    const again = screen.getByRole('button', { name: '📨 Send the link again' });
    expect(again).toHaveAttribute('aria-disabled', 'false');
    fireEvent.click(again);
    await act(async () => {});
    expect(auth.resend).toHaveBeenCalledOnce();
    expect(auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'mum@example.com' });
    // Said where screen readers hear it, and the wait starts again.
    expect(screen.getAllByRole('status').some((r) => /Sent! A new link is on its way to mum@example\.com/.test(r.textContent ?? ''))).toBe(true);
    expect(screen.getByRole('button', { name: 'Send the link again in 60 seconds' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps the keyboard where it was: the button waits without going disabled under the focus (#146 review)', async () => {
    vi.useFakeTimers();
    auth.resend.mockResolvedValue({ data: {}, error: null });
    await signUp();
    tick(60_000);
    const again = screen.getByRole('button', { name: '📨 Send the link again' });
    again.focus();
    fireEvent.click(again);
    // Sending…, then counting down: never `disabled`, which drops focus to the page.
    expect(again).toHaveTextContent('Sending…');
    expect(again).not.toBeDisabled();
    await act(async () => {});
    expect(again).toHaveAccessibleName('Send the link again in 60 seconds');
    expect(again).not.toBeDisabled();
    expect(again).toHaveFocus();
  });

  it('a refused resend says why in plain words, and counts down the wait it named (#146 review)', async () => {
    vi.useFakeTimers();
    auth.resend.mockResolvedValue({
      data: {},
      error: { code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 12 seconds.', status: 429 },
    });
    await signUp();
    tick(60_000);
    fireEvent.click(screen.getByRole('button', { name: '📨 Send the link again' }));
    await act(async () => {});
    expect(screen.getByText('Too many tries for now. Please wait 12 seconds, then try again.')).toHaveClass('text-red-700');
    // The button and the words agree: not another tap the server would refuse.
    const wait = screen.getByRole('button', { name: 'Send the link again in 12 seconds' });
    expect(wait).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(wait);
    expect(auth.resend).toHaveBeenCalledOnce();
    tick(12_000);
    expect(screen.getByRole('button', { name: '📨 Send the link again' })).toHaveAttribute('aria-disabled', 'false');
  });

  it('the hourly email cap says about an hour — and no countdown promising a minute', async () => {
    vi.useFakeTimers();
    auth.resend.mockResolvedValue({ data: {}, error: { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded', status: 429 } });
    await signUp();
    tick(60_000);
    fireEvent.click(screen.getByRole('button', { name: '📨 Send the link again' }));
    await act(async () => {});
    expect(screen.getByText(/try again in about an hour \(and check spam for the last one\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '📨 Send the link again' })).toBeInTheDocument();
  });

  it('says what to do if they already had an account (a confirmed address gets no new email, and no error)', async () => {
    vi.useFakeTimers();
    await signUp();
    expect(screen.getByText('Already have an account? Go back and sign in, or reset your password.')).toBeInTheDocument();
  });

  it('going back to sign in clears the note', async () => {
    vi.useFakeTimers();
    auth.resend.mockResolvedValue({ data: {}, error: null });
    await signUp();
    tick(60_000);
    fireEvent.click(screen.getByRole('button', { name: '📨 Send the link again' }));
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.queryByText(/Sent! A new link/)).toBeNull();
  });
});

describe('AuthPage — opened from the public site (#146)', () => {
  function at(address: string, test: () => void) {
    window.history.replaceState(null, '', address);
    try { test(); } finally { window.history.replaceState(null, '', '/'); }
  }

  it('?signup opens on the sign-up form, and leaves the address', () => {
    at('/play/?signup&keep=1#top', () => {
      render(<AuthPage />);
      expect(screen.getByRole('button', { name: 'Create family account' })).toBeInTheDocument();
      expect(screen.getByLabelText("Grown-up's email")).toBeInTheDocument();
      // Only ?signup goes: anything else in the address stays.
      expect(window.location.pathname + window.location.search + window.location.hash).toBe('/play/?keep=1#top');
    });
  });

  it('without it, opens on Sign in', () => {
    at('/play/', () => {
      render(<AuthPage />);
      expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
      expect(screen.getByText('New here? Grown-ups sign up')).toBeInTheDocument();
    });
  });
});

describe('show password (#123)', () => {
  it('sign in and sign up each have an eye; switching between them hides the password again', () => {
    render(<AuthPage />);
    const field = () => screen.getByLabelText('Password') as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field().type).toBe('text');
    fireEvent.click(screen.getByText('New here? Grown-ups sign up'));
    expect(field().type).toBe('password');
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
  });

  it('both new-password fields have their own eye', () => {
    render(<ResetPasswordPage />);
    const eyes = screen.getAllByRole('button', { name: 'Show password' });
    expect(eyes).toHaveLength(2);
    fireEvent.click(eyes[1]);
    expect((screen.getByPlaceholderText('New password') as HTMLInputElement).type).toBe('password');
    expect((screen.getByPlaceholderText('Type it again') as HTMLInputElement).type).toBe('text');
  });
});

describe('ResetPasswordPage', () => {
  function fill(a: string, b: string) {
    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: a } });
    fireEvent.change(screen.getByPlaceholderText('Type it again'), { target: { value: b } });
    fireEvent.click(screen.getByText('Save new password'));
  }

  it('rejects mismatched or too-short passwords without calling Supabase', () => {
    render(<ResetPasswordPage />);
    fill('abc', 'abc');
    expect(screen.getByText(/at least 6/)).toBeInTheDocument();
    fill('abcdefg', 'abcdefh');
    expect(screen.getByText(/don't match/)).toBeInTheDocument();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('saves the new password and leaves recovery mode', async () => {
    auth.updateUser.mockResolvedValue({ error: null });
    useAuthStore.setState({ passwordRecovery: true });
    render(<ResetPasswordPage />);
    fill('dragonfire', 'dragonfire');
    await waitFor(() => expect(useAuthStore.getState().passwordRecovery).toBe(false));
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'dragonfire' });
  });

  it('stays in recovery mode and says what went wrong in plain words if saving fails (#130 S6)', async () => {
    auth.updateUser.mockResolvedValue({
      error: { code: 'weak_password', message: 'Password is known to be weak and easy to guess, please choose a different one.', reasons: ['pwned'] },
    });
    useAuthStore.setState({ passwordRecovery: true });
    render(<ResetPasswordPage />);
    fill('dragonfire', 'dragonfire');
    // Read out as it appears (#130 S6 review).
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('That password has shown up in a data leak. Choose a different one.'));
    expect(screen.queryByText(/known to be weak/)).toBeNull();
    expect(useAuthStore.getState().passwordRecovery).toBe(true);
  });

  it('a stricter password rule names what this password is missing', async () => {
    auth.updateUser.mockResolvedValue({
      error: {
        code: 'weak_password',
        message: 'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.',
        reasons: ['characters'],
      },
    });
    render(<ResetPasswordPage />);
    fill('dragonfire', 'dragonfire');
    await screen.findByText('That password needs a capital letter and a number.');
  });

  it('a link that has run out: its words and its button agree on the way back (#88 review)', async () => {
    auth.updateUser.mockResolvedValue({ error: { name: 'AuthSessionMissingError', message: 'Auth session missing!', status: 400 } });
    render(<ResetPasswordPage />);
    expect(screen.getByRole('button', { name: 'Cancel and sign out' })).toBeInTheDocument();
    fill('dragonfire', 'dragonfire');
    await screen.findByText('That link has run out. Tap "Back to sign in", then "Forgot password?" for a new one.');
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(auth.signOut).toHaveBeenCalled();
  });
});
