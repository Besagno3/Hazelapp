import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const auth = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
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

  it('shows the error when the request fails (e.g. rate limited)', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { message: 'Too many requests' } });
    render(<AuthPage />);
    fireEvent.click(screen.getByText('Forgot password?'));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'kid@example.com' } });
    fireEvent.click(screen.getByText('Send reset link'));
    await screen.findByText('Too many requests');
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

  it('shows any other error as it is', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    signIn();
    await screen.findByText('Invalid login credentials');
  });
});

describe('AuthPage — opened from the public site (#143)', () => {
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

  it('stays in recovery mode and shows the error if saving fails', async () => {
    auth.updateUser.mockResolvedValue({ error: { message: 'Password is too weak' } });
    useAuthStore.setState({ passwordRecovery: true });
    render(<ResetPasswordPage />);
    fill('dragonfire', 'dragonfire');
    await screen.findByText('Password is too weak');
    expect(useAuthStore.getState().passwordRecovery).toBe(true);
  });
});
