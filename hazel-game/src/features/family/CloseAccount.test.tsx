import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import type { Kid } from '../../types';

// The Supabase client, mocked: sign-in (the gate, and again to close), the edge function, sign-out.
const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  getUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
}));
const functions = vi.hoisted(() => ({ invoke: vi.fn() }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../../lib/supabase', () => ({ supabase: { auth, functions, rpc } }));
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

/** Signing in again works and makes a fresh token. */
const signedIn = { data: { session: { access_token: 'fresh-token' }, user: { id: 'grown-up-1' } }, error: null };
const wrongPassword = { data: { session: null, user: null }, error: { name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' } };

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  auth.signInWithPassword.mockResolvedValue(signedIn);
  auth.signOut.mockResolvedValue({ error: null });
  auth.getUser.mockResolvedValue({ data: { user: { id: 'grown-up-1' } }, error: null });
  rpc.mockResolvedValue({ data: { kids: {}, grown_up: 0 }, error: null });
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

  it('opens at the top with its title focused; "Keep my account" puts focus back on "Close account…" (#124b review)', async () => {
    const scrolled = vi.fn();
    const root = document.scrollingElement ?? document.documentElement;
    Object.defineProperty(root, 'scrollTop', { configurable: true, get: () => 0, set: scrolled });
    try {
      await openCloseAccount();
      expect(screen.getByRole('heading', { name: 'Close your account?' })).toHaveFocus();
      expect(scrolled).toHaveBeenCalledWith(0);
      fireEvent.click(screen.getByRole('button', { name: 'Keep my account' }));
      expect(screen.getByRole('button', { name: 'Close account…' })).toHaveFocus();
    } finally {
      delete (root as { scrollTop?: unknown }).scrollTop;
    }
  });

  it('asks for the password, then the word DELETE, before asking the server — and marks the box it means', async () => {
    await openCloseAccount();
    const password = screen.getByLabelText('Your password (not your grown-up PIN)');
    const confirm = screen.getByLabelText('Type DELETE to confirm');
    fireEvent.click(submit());
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Enter your password to close your account.');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAttribute('aria-describedby', status.id);
    expect(password).toHaveFocus();
    fill('hunter22', 'delet');
    fireEvent.click(submit());
    expect(status).toHaveTextContent('Type DELETE in the box to confirm.');
    expect(confirm).toHaveAttribute('aria-invalid', 'true');
    expect(confirm).toHaveAttribute('aria-describedby', status.id);
    expect(confirm).toHaveFocus();
    expect(password).toHaveAttribute('aria-invalid', 'false');
    expect(functions.invoke).not.toHaveBeenCalled();
  });

  it('labels read like sign-in\'s, not small grey print', async () => {
    await openCloseAccount();
    expect(screen.getByText('Your password (not your grown-up PIN)')).toHaveClass('text-sm', 'font-medium', 'text-gray-700');
    expect(screen.getByText('Type DELETE to confirm')).toHaveClass('text-sm', 'font-medium', 'text-gray-700');
  });

  it('checks the password by signing in again from this browser; the function gets that fresh sign-in, never the password (#124b review)', async () => {
    functions.invoke.mockReturnValue(new Promise(() => {}));
    await openCloseAccount();
    auth.signInWithPassword.mockClear();
    fill('hunter22', 'delete');
    fireEvent.click(submit());
    await act(async () => {});
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'mum@example.com', password: 'hunter22' });
    expect(functions.invoke).toHaveBeenCalledWith('delete-account', {
      body: { confirm: 'DELETE' },
      headers: { Authorization: 'Bearer fresh-token' },
    });
  });

  it('a wrong password is said plainly, the box is marked and selected, and nothing is sent or signed out', async () => {
    await openCloseAccount();
    auth.signInWithPassword.mockResolvedValueOnce(wrongPassword);
    fill('nope', 'DELETE');
    fireEvent.click(submit());
    expect(await screen.findByText("That password isn't right. Check it and try again. Nothing was deleted.")).toBeInTheDocument();
    expect(functions.invoke).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('Closing the account failed:', 'signing in again: Invalid login credentials [invalid_credentials]');
    expect(screen.queryByText(/invalid_credentials|400/)).toBeNull();
    const password = screen.getByLabelText('Your password (not your grown-up PIN)');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveFocus();
    expect(submit()).toHaveTextContent('Close account for good');
    expect(submit()).toHaveAttribute('aria-disabled', 'false');
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('never says "nothing was deleted" when it can\'t know: a lost answer says so, and "safe to repeat"', async () => {
    functions.invoke.mockResolvedValueOnce({ data: null, error: new FunctionsFetchError(new TypeError('Failed to fetch')) });
    await openCloseAccount();
    fill('hunter22', 'delete');
    fireEvent.click(submit());
    const lost = await screen.findByText(/We lost touch with Hazel Quest, so we can't tell if your account was closed\./);
    expect(lost).not.toHaveTextContent(/Nothing was deleted/);
    functions.invoke.mockResolvedValueOnce(refusedWith(502, { error: 'outcome_unknown' }));
    fireEvent.click(submit());
    expect(await screen.findByText(/We couldn't tell if your account was closed\. To make sure, tap "Close account for good" again/)).toBeInTheDocument();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('a sign-in that couldn\'t reach the server says so — nothing was sent, so nothing was deleted', async () => {
    await openCloseAccount();
    auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null, user: null }, error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' } });
    fill('hunter22', 'delete');
    fireEvent.click(submit());
    expect(await screen.findByText("We couldn't reach Hazel Quest. Check your internet connection, then try again. Nothing was deleted.")).toBeInTheDocument();
    expect(functions.invoke).not.toHaveBeenCalled();
  });

  it("the login left behind: the family's copies on this device go and Grown-ups lists no players (#124b review)", async () => {
    localStorage.setItem(saveKey('kid-sam'), '{}');
    localStorage.setItem(profileKey('kid-kit'), '{}');
    sessionStorage.setItem('hazel-active-kid-grown-up-1', 'kid-sam');
    functions.invoke.mockResolvedValueOnce(refusedWith(500, { error: 'login_not_deleted' }));
    await openCloseAccount();
    fill('hunter22', 'delete');
    fireEvent.click(submit());
    expect(await screen.findByText(/players and their games are deleted, but the login itself is still here\. Tap "Close account for good" again to finish\./)).toBeInTheDocument();
    expect(localStorage.getItem(saveKey('kid-sam'))).toBeNull();
    expect(localStorage.getItem(profileKey('kid-kit'))).toBeNull();
    expect(sessionStorage.getItem('hazel-active-kid-grown-up-1')).toBeNull();
    expect(useFamilyStore.getState().kids).toEqual([]);
    expect(useFamilyStore.getState().consentAt).toBe('2026-10-10T10:00:00Z');
    expect(auth.signOut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep my account' }));
    expect(screen.queryByText('Sam')).toBeNull();
    expect(screen.queryByText('Kit')).toBeNull();
  });

  it('an account a lost answer already closed: the retry finds the login gone and finishes as closed', async () => {
    await openCloseAccount();
    auth.signInWithPassword.mockResolvedValueOnce(wrongPassword);
    auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: { name: 'AuthApiError', status: 403, code: 'user_not_found', message: 'User from sub claim in JWT does not exist' } });
    fill('hunter22', 'delete');
    fireEvent.click(submit());
    await act(async () => {});
    expect(functions.invoke).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    render(<AuthPage />);
    expect(screen.getByRole('heading', { name: /Your account and all its data are gone\./ })).toBeInTheDocument();
  });

  it('waits once, then signs out, clears this device, and the sign-in page says the account is gone — a banner, focused', async () => {
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
    await act(async () => {});
    expect(functions.invoke).toHaveBeenCalledTimes(1);
    // "Keep my account" waits too, and looks it.
    const keep = screen.getByRole('button', { name: 'Keep my account' });
    expect(keep).toHaveAttribute('aria-disabled', 'true');
    expect(keep).toHaveClass('aria-disabled:opacity-50');

    await act(async () => answer({ data: { ok: true, kids: 2 }, error: null }));
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(localStorage.getItem(saveKey('kid-sam'))).toBeNull();
    expect(localStorage.getItem(profileKey('kid-kit'))).toBeNull();
    expect(localStorage.getItem(saveKey('someone-else'))).toBe('{}');
    expect(sessionStorage.getItem('hazel-active-kid-grown-up-1')).toBeNull();

    // The app shows the sign-in page once signed out: a banner at the top, focused so it's heard, once.
    const first = render(<AuthPage />);
    const banner = within(first.container).getByRole('heading', { name: /Your account and all its data are gone\./ });
    expect(banner).toHaveFocus();
    expect(within(first.container).queryAllByRole('status').some((s) => /gone/.test(s.textContent ?? ''))).toBe(false);
    first.unmount();
    render(<AuthPage />);
    expect(screen.queryByText(/Your account and all its data are gone\./)).toBeNull();
  });
});
