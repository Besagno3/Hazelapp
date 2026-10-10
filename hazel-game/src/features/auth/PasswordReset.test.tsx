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
    expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'kid@example.com' } });
    fireEvent.click(screen.getByText('Send reset link'));
    await screen.findByText(/If that email has an account/);
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('kid@example.com', {
      redirectTo: window.location.origin + window.location.pathname,
    });
  });

  it('shows the error when the request fails (e.g. rate limited)', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { message: 'Too many requests' } });
    render(<AuthPage />);
    fireEvent.click(screen.getByText('Forgot password?'));
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'kid@example.com' } });
    fireEvent.click(screen.getByText('Send reset link'));
    await screen.findByText('Too many requests');
  });
});

describe('show password (#117)', () => {
  it('sign in and sign up each have an eye; switching between them hides the password again', () => {
    render(<AuthPage />);
    const field = () => screen.getByPlaceholderText('Password') as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field().type).toBe('text');
    fireEvent.click(screen.getByText("Don't have an account? Sign up"));
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
