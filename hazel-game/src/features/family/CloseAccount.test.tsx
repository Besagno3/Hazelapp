import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import type { Kid } from '../../types';

// The Supabase client, mocked: sign-in for the gate, the edge function, sign-out.
const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
}));
const functions = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth, functions } }));
vi.mock('../../lib/review', async (original) => ({
  ...(await original<typeof import('../../lib/review')>()),
  isAdmin: vi.fn(async () => false),
}));

const { default: GrownUpsArea } = await import('./GrownUpsArea');
const { default: AuthPage } = await import('../auth/AuthPage');
const { useFamilyStore } = await import('../../store/familyStore');
const { useAuthStore } = await import('../../store/authStore');
const { saveKey } = await import('../../lib/save');
const { profileKey } = await import('../../lib/profile');

const sam: Kid = { id: 'kid-sam', name: 'Sam', icon: 'fox', hasPin: true, birthYear: 2017, birthMonth: 3 };
const kit: Kid = { id: 'kid-kit', name: 'Kit', icon: 'panda', hasPin: true, birthYear: 2019, birthMonth: 8 };

function refusedWith(status: number, body: unknown) {
  return { data: null, error: new FunctionsHttpError(new Response(JSON.stringify(body), { status })) };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
  useAuthStore.setState({ user: { id: 'grown-up-1', email: 'mum@example.com' } as never });
  useFamilyStore.setState({
    userId: 'grown-up-1',
    status: 'ready',
    kids: [sam, kit],
    consentAt: '2026-10-10T10:00:00Z',
    hasParentPin: false,
    reviewRequested: false,
  });
});

/** Open 👪 Grown-ups with the password, then Close account. */
async function openCloseAccount() {
  render(<GrownUpsArea />);
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'right' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  await screen.findByText('Sam');
  fireEvent.click(screen.getByRole('button', { name: 'Close account…' }));
  expect(screen.getByRole('heading', { name: 'Close your account?' })).toBeInTheDocument();
}

function fill(password: string, typed: string) {
  fireEvent.change(screen.getByLabelText('Your password (not your grown-up PIN)'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: typed } });
}

const submit = () => screen.getByRole('button', { name: /Close account for good|Closing your account/ });

describe('Close account in 👪 Grown-ups (#124b)', () => {
  it('sits at the bottom of Grown-ups, after Sign out', async () => {
    render(<GrownUpsArea />);
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'right' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByText('Sam');
    const section = screen.getByRole('region', { name: 'Close account' });
    const signOut = screen.getByRole('button', { name: 'Sign out' });
    expect(signOut.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Close account…' })).toBeInTheDocument();
  });

  it('says exactly what will be deleted; "Keep my account" goes back', async () => {
    await openCloseAccount();
    expect(screen.getByText(/mum@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/Every player on it — Sam and Kit — with their adventures, levels, XP, coins, items and saved games\./)).toBeInTheDocument();
    expect(screen.getByText('Their PINs and your grown-up PIN.')).toBeInTheDocument();
    expect(screen.getByText(/questions they've seen and any questions they reported/)).toBeInTheDocument();
    expect(screen.getByText('Your agreement to the privacy notice.')).toBeInTheDocument();
    expect(screen.getByText(/count of today's new questions, with no name or account on it, for one day/)).toBeInTheDocument();
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep my account' }));
    expect(screen.getByText('Sam')).toBeInTheDocument();
    expect(functions.invoke).not.toHaveBeenCalled();
  });

  it('asks for the password, then the word DELETE, before asking the server', async () => {
    await openCloseAccount();
    fireEvent.click(submit());
    expect(screen.getByRole('status')).toHaveTextContent('Enter your password to close your account.');
    fill('hunter22', 'delet');
    fireEvent.click(submit());
    expect(screen.getByRole('status')).toHaveTextContent('Type DELETE in the box to confirm.');
    expect(functions.invoke).not.toHaveBeenCalled();
  });

  it('a wrong password is said plainly; nothing is signed out', async () => {
    functions.invoke.mockResolvedValue(refusedWith(403, { error: 'wrong_password', detail: "That password isn't right." }));
    await openCloseAccount();
    fill('nope', 'DELETE');
    fireEvent.click(submit());
    expect(await screen.findByText("That password isn't right. Check it and try again. Nothing was deleted.")).toBeInTheDocument();
    expect(functions.invoke).toHaveBeenCalledWith('delete-account', { body: { password: 'nope', confirm: 'DELETE' } });
    expect(warn).toHaveBeenCalledWith('Closing the account failed:', "delete-account 403: wrong_password — That password isn't right.");
    expect(screen.queryByText(/wrong_password|403/)).toBeNull();
    expect(submit()).toHaveTextContent('Close account for good');
    expect(submit()).toHaveAttribute('aria-disabled', 'false');
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('the connection failing, or the login left behind, each say what to do', async () => {
    functions.invoke.mockResolvedValueOnce({ data: null, error: new FunctionsFetchError(new TypeError('Failed to fetch')) });
    await openCloseAccount();
    fill('hunter22', 'delete');
    fireEvent.click(submit());
    expect(await screen.findByText("We couldn't reach Hazel Quest. Check your internet connection, then try again.")).toBeInTheDocument();
    functions.invoke.mockResolvedValueOnce(refusedWith(500, { error: 'login_not_deleted' }));
    fireEvent.click(submit());
    expect(await screen.findByText(/players and their games are deleted, but the login itself is still here\. Tap "Close account for good" again to finish\./)).toBeInTheDocument();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('waits once, then signs out, clears this device, and the sign-in page says the account is gone', async () => {
    localStorage.setItem(saveKey('kid-sam'), '{}');
    localStorage.setItem(profileKey('kid-kit'), '{}');
    localStorage.setItem(saveKey('someone-else'), '{}');
    sessionStorage.setItem('hazel-active-kid-grown-up-1', 'kid-sam');
    let answer: (v: unknown) => void = () => {};
    functions.invoke.mockReturnValue(new Promise((r) => (answer = r)));
    await openCloseAccount();
    fill('hunter22', 'delete');
    const button = submit();
    button.focus();
    fireEvent.click(button);
    // Waiting with aria-disabled: the keyboard keeps its place, and a second tap does nothing.
    expect(button).toHaveTextContent('Closing your account…');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(functions.invoke).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Keep my account' })).toHaveAttribute('aria-disabled', 'true');

    await act(async () => answer({ data: { ok: true, kids: 2 }, error: null }));
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(localStorage.getItem(saveKey('kid-sam'))).toBeNull();
    expect(localStorage.getItem(profileKey('kid-kit'))).toBeNull();
    expect(localStorage.getItem(saveKey('someone-else'))).toBe('{}');
    expect(sessionStorage.getItem('hazel-active-kid-grown-up-1')).toBeNull();

    // The app shows the sign-in page once signed out: it says so, once.
    const first = render(<AuthPage />);
    expect(within(first.container).getByText('Your account and all its data are gone.')).toHaveClass('text-green-700');
    first.unmount();
    render(<AuthPage />);
    expect(screen.queryByText('Your account and all its data are gone.')).toBeNull();
  });
});
