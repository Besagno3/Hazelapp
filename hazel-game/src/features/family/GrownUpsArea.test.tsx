import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { Kid } from '../../types';
import type { PinVerdict } from '../../lib/pinLock';

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));
// The gate checks the password on a one-off client that keeps nothing (#124b review round 2).
const checkAuth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signOut: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth }, passwordCheckClient: () => ({ auth: checkAuth }) }));
const review = vi.hoisted(() => ({ isAdmin: vi.fn(), fetchReviewQueue: vi.fn() }));
vi.mock('../../lib/review', async (original) => ({
  ...(await original<typeof import('../../lib/review')>()),
  isAdmin: review.isAdmin,
  fetchReviewQueue: review.fetchReviewQueue,
}));

const { default: GrownUpsArea } = await import('./GrownUpsArea');
const { useFamilyStore } = await import('../../store/familyStore');
const { useAuthStore } = await import('../../store/authStore');
const { calcAge } = await import('../../lib/age');
const { forgetAllLocks, GROWN_UP_LOCKED_TEXT } = await import('../../lib/pinLock');

const sam: Kid = { id: 'kid-sam', name: 'Sam', icon: 'fox', hasPin: true, birthYear: 2017, birthMonth: 3 };
const old: Kid = { id: 'kid-old', name: null, icon: null, hasPin: false, birthYear: 2015, birthMonth: 1 };
const removeKid = vi.fn(async () => {});
const setGrownUpsOpen = vi.fn();
const verdict = (ok: boolean, triesLeft = 4, waitSeconds = 0): PinVerdict => ({ ok, triesLeft, waitSeconds, limited: true });
const checkParentPin = vi.fn(async (pin: string) => verdict(pin === '9090'));
const setParentPin = vi.fn(async () => {});
const updateKid = vi.fn(async () => {});
const pinLocks = vi.fn(async () => null as { kids: Record<string, number>; grownUp: number } | null);

async function type(pin: string) {
  for (const d of pin) await act(async () => fireEvent.click(screen.getByRole('button', { name: d })));
}

beforeEach(() => {
  vi.clearAllMocks();
  checkAuth.signOut.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
  review.isAdmin.mockResolvedValue(false);
  review.fetchReviewQueue.mockResolvedValue([]);
  useAuthStore.setState({ user: { id: 'grown-up-1', email: 'mum@example.com' } as never });
  useFamilyStore.setState({
    kids: [sam, old],
    consentAt: '2026-10-10T10:00:00Z',
    hasParentPin: false,
    removeKid,
    setGrownUpsOpen,
    checkParentPin,
    setParentPin,
    updateKid,
    pinLocks,
    userId: 'grown-up-1',
    reviewRequested: false,
  });
});

afterEach(() => {
  vi.useRealTimers();
  forgetAllLocks();
});

async function unlock() {
  checkAuth.signInWithPassword.mockResolvedValue({ error: null });
  render(<GrownUpsArea />);
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'right' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  await screen.findByText('Sam');
}

/** The page's own status line (the area's sr-only live region is another). */
const pageStatus = () => screen.getAllByRole('status').find((el) => !el.classList.contains('sr-only'))!;

describe('GrownUpsArea (#124)', () => {
  it("stays shut without the grown-up's password", async () => {
    checkAuth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    render(<GrownUpsArea />);
    expect(screen.getByText(/mum@example\.com/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'guess' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    // In plain words, not the raw error (#130 S6) — and only about what's here:
    // no email field, and the link reads "Forgot it?" (#130 S6 review).
    const status = pageStatus();
    await waitFor(() => expect(status).toHaveTextContent('That password isn\'t right. Try again, or tap "Forgot it?" below.'));
    expect(screen.queryByText('Invalid login credentials')).toBeNull();
    expect(checkAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'mum@example.com', password: 'guess' });
    expect(screen.queryByText('Sam')).not.toBeInTheDocument();
  });

  it('the password opens it without touching the device\'s own sign-in: checked on the one-off client, then signed out (#124b review round 2)', async () => {
    await unlock();
    expect(checkAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'mum@example.com', password: 'right' });
    // No fresh-password session left on the device that could close the account (#167).
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(checkAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('opens with its title focused (#124 review round 2)', () => {
    render(<GrownUpsArea />);
    expect(screen.getByRole('heading', { name: '👪 Grown-ups' })).toHaveFocus();
  });

  it('a forgotten password gets a reset link; Back returns to Who’s playing', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    render(<GrownUpsArea />);
    fireEvent.click(screen.getByRole('button', { name: /Forgot it/ }));
    expect(await screen.findByText(/reset link is on its way to mum@example\.com/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back to Who/ }));
    expect(setGrownUpsOpen).toHaveBeenCalledWith(false);
  });

  it('a reset link is sent once however often it is tapped, and its trouble is read out (#130 S6 review)', async () => {
    let send: (v: { error: unknown }) => void = () => {};
    auth.resetPasswordForEmail.mockReturnValue(new Promise((r) => (send = r)));
    render(<GrownUpsArea />);
    const link = screen.getByRole('button', { name: /Forgot it/ });
    link.focus();
    fireEvent.click(link);
    // Waiting, without going disabled under the keyboard's focus.
    expect(link).toHaveTextContent('Sending a reset link…');
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).not.toBeDisabled();
    fireEvent.click(link);
    expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    await act(async () => send({ error: { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded', status: 429 } }));
    expect(pageStatus()).toHaveTextContent(/try again in about an hour/);
    // Nothing was sent, so nothing to look for in spam (#159 review round 2).
    expect(pageStatus()).not.toHaveTextContent(/spam/);
    expect(link).toHaveFocus();
    expect(link).toHaveTextContent('Forgot it? Email me a reset link');
  });

  it('a refused reset link counts down the wait it named (#159 review round 2)', async () => {
    vi.useFakeTimers();
    auth.resetPasswordForEmail.mockResolvedValue({
      error: { code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 37 seconds.', status: 429 },
    });
    render(<GrownUpsArea />);
    const link = screen.getByRole('button', { name: /Forgot it/ });
    link.focus();
    fireEvent.click(link);
    await act(async () => {});
    expect(pageStatus()).toHaveTextContent('Too many tries for now. Please wait 37 seconds, then try again.');
    expect(link).toHaveAccessibleName('Email me a reset link in 37 seconds');
    expect(link).toHaveTextContent('Email me a reset link in 37s');
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).toHaveFocus();
    fireEvent.click(link);
    await act(async () => {});
    expect(auth.resetPasswordForEmail).toHaveBeenCalledOnce();
    act(() => {
      vi.advanceTimersByTime(37_000);
    });
    expect(link).toHaveAccessibleName('Forgot it? Email me a reset link');
    expect(link).toHaveAttribute('aria-disabled', 'false');
  });

  it('Open waits with aria-disabled, keeping focus; the gate\'s links are 44 px tap targets (#159 review round 2)', async () => {
    let answer: (v: { error: unknown }) => void = () => {};
    checkAuth.signInWithPassword.mockReturnValue(new Promise((r) => (answer = r)));
    render(<GrownUpsArea />);
    for (const name of [/Forgot it/, /Back to Who/]) expect(screen.getByRole('button', { name })).toHaveClass('min-h-11');
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'guess' } });
    const open = screen.getByRole('button', { name: 'Open' });
    open.focus();
    fireEvent.click(open);
    expect(open).toHaveTextContent('Checking…');
    expect(open).toHaveAttribute('aria-disabled', 'true');
    expect(open).not.toBeDisabled();
    expect(open).toHaveFocus();
    fireEvent.click(open);
    expect(checkAuth.signInWithPassword).toHaveBeenCalledOnce();
    await act(async () => answer({ error: { code: 'invalid_credentials', message: 'Invalid login credentials' } }));
    expect(open).toHaveTextContent('Open');
  });

  it('with a grown-up PIN, its links are 44 px tap targets too', () => {
    useFamilyStore.setState({ hasParentPin: true });
    render(<GrownUpsArea />);
    for (const name of ['Use my password instead', /Back to Who/]) expect(screen.getByRole('button', { name })).toHaveClass('min-h-11');
  });

  it('with a grown-up PIN: the PIN opens it, a wrong one does not, and the password still works', async () => {
    useFamilyStore.setState({ hasParentPin: true });
    render(<GrownUpsArea />);
    expect(screen.getByText('Type your grown-up PIN.')).toBeInTheDocument();
    await type('1111');
    expect(screen.queryByText('Sam')).not.toBeInTheDocument();
    expect(pageStatus()).toHaveTextContent(/Not quite/);
    fireEvent.click(screen.getByRole('button', { name: 'Use my password instead' }));
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use my grown-up PIN instead' }));
    await type('9090');
    expect(await screen.findByText('Sam')).toBeInTheDocument();
  });

  it('a locked grown-up PIN (#124c) says to use the password or wait — the password becomes the main button, and still opens it', async () => {
    vi.useFakeTimers();
    useFamilyStore.setState({ hasParentPin: true });
    checkParentPin.mockResolvedValueOnce(verdict(false, 0, 60));
    render(<GrownUpsArea />);
    expect(screen.getByRole('button', { name: 'Use my password instead' })).not.toHaveClass('bg-purple-600');
    await type('1111');
    expect(pageStatus()).toHaveTextContent(GROWN_UP_LOCKED_TEXT);
    expect(screen.getByTestId('pin-lock')).toHaveTextContent('Try again in 1 minute');
    // The subtitle stops asking for a PIN that can't be typed (#124c review round 2).
    expect(screen.getByText('Use your password for now.')).toBeInTheDocument();
    expect(screen.queryByText('Type your grown-up PIN.')).toBeNull();
    // It's the way in now: no longer a faint grey link.
    expect(screen.getByRole('button', { name: 'Use my password instead' })).toHaveClass('bg-purple-600');
    await type('9090');
    expect(checkParentPin).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    checkAuth.signInWithPassword.mockResolvedValue({ error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Use my password instead' }));
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'right' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByText('Sam')).toBeInTheDocument();
  });

  it('without a grown-up PIN it asks for the password, with no PIN option', () => {
    render(<GrownUpsArea />);
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /grown-up PIN instead/ })).not.toBeInTheDocument();
  });

  it('open: each kid with their age and whether their PIN is set', async () => {
    await unlock();
    expect(screen.getByText(`Age ${calcAge(2017, 3)} · PIN set`)).toBeInTheDocument();
    expect(screen.getByText('Player')).toBeInTheDocument();
    expect(screen.getByText(/no PIN yet/)).toBeInTheDocument();
    expect(screen.getByText(/You agreed to the privacy notice on/)).toBeInTheDocument();
  });

  it('removing a kid asks first, and Keep keeps them', async () => {
    await unlock();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.getByText('Remove Sam?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep Sam' }));
    expect(removeKid).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Sam for good' }));
    await waitFor(() => expect(removeKid).toHaveBeenCalledWith('kid-sam'));
  });

  it('Sign out lives here, behind the password', async () => {
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('Add a player opens the kid form; Cancel comes back', async () => {
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: /Add a player/ }));
    expect(screen.getByRole('textbox', { name: 'Nickname' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Sam')).toBeInTheDocument();
  });

  it('a PIN that won\'t save says so in plain words — the code and details go to the console', async () => {
    setParentPin.mockRejectedValueOnce({ message: 'Could not save the PIN', code: '42501', details: 'permission denied' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Set a PIN' }));
    fireEvent.change(screen.getByLabelText('Grown-up PIN'), { target: { value: '9090' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save PIN' }));
    // Never the database's own words (#130 S6 review): a plain line of this screen's own.
    expect(await screen.findByText("That PIN didn't save just now. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/Could not save the PIN|42501|permission denied/)).toBeNull();
    expect(warn).toHaveBeenCalledWith('Saving the grown-up PIN failed:', 'Could not save the PIN [42501] — permission denied');
    warn.mockRestore();
  });

  it("a player who won't remove says so in plain words, never the database's (#130 S6 review)", async () => {
    removeKid.mockRejectedValueOnce({ message: 'update or delete on table "profiles" violates foreign key constraint', code: '23503' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await unlock();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Sam for good' }));
    expect(await screen.findByText("We couldn't remove Sam just now. Please try again.")).toBeInTheDocument();
    expect(pageStatus()).toHaveTextContent("We couldn't remove Sam just now.");
    expect(screen.queryByText(/foreign key|23503/)).toBeNull();
    expect(warn).toHaveBeenCalledWith('Removing a player failed:', expect.stringContaining('23503'));
    warn.mockRestore();
  });

  it("a kid whose PIN is locked says so by their name, with how to unlock it; the list asks again after a Change (#124c review)", async () => {
    pinLocks.mockResolvedValue({ kids: { 'kid-sam': 300 }, grownUp: 0 });
    await unlock();
    const note = await screen.findByText(/PIN locked after too many tries\. Tap Change and type their PIN again — the same one is fine — to unlock it now\./);
    expect(note.closest('li')).toHaveTextContent('Sam');
    expect(screen.getAllByText(/PIN locked after too many tries/)).toHaveLength(1);
    // Sam's PIN typed again in Change: the database unlocks it, and the list asks again.
    pinLocks.mockResolvedValue({ kids: {}, grownUp: 0 });
    const calls = pinLocks.mock.calls.length;
    fireEvent.click(screen.getAllByRole('button', { name: 'Change' })[0]);
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '4821' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateKid).toHaveBeenCalledWith('kid-sam', expect.objectContaining({ pin: '4821' })));
    await screen.findByText('Sam');
    await waitFor(() => expect(pinLocks.mock.calls.length).toBeGreaterThan(calls));
    expect(screen.queryByText(/PIN locked after too many tries/)).toBeNull();
  });

  it('unlocking says so on the kid\'s row, read out, with focus back on their Change button (#124c review round 2)', async () => {
    pinLocks.mockResolvedValue({ kids: { 'kid-sam': 300 }, grownUp: 0 });
    await unlock();
    await screen.findByText(/PIN locked after too many tries/);
    fireEvent.click(screen.getAllByRole('button', { name: 'Change' })[0]);
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '4821' } });
    // The list's own re-ask hasn't answered yet: the 🔒 note goes at once anyway — the save unlocked it.
    pinLocks.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const note = (await screen.findAllByText('Sam can try their PIN again now.')).find((el) => el.closest('li'));
    expect(note?.closest('li')).toHaveTextContent('Sam');
    // Read out by the area's own live region, there all along — not one that appears with the words.
    const region = screen.getAllByRole('status').find((el) => el.textContent === 'Sam can try their PIN again now.');
    expect(region).toHaveClass('sr-only');
    expect(screen.queryByText(/PIN locked after too many tries/)).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Change' })[0]).toHaveFocus();
    // Gone once the list is left again.
    fireEvent.click(screen.getByRole('button', { name: /Add a player/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryAllByText('Sam can try their PIN again now.').filter((el) => el.closest('li'))).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Add a player/ })).toHaveFocus();
  });

  it('a Change that typed no PIN says nothing about unlocking', async () => {
    pinLocks.mockResolvedValue({ kids: { 'kid-sam': 300 }, grownUp: 0 });
    await unlock();
    await screen.findByText(/PIN locked after too many tries/);
    fireEvent.click(screen.getAllByRole('button', { name: 'Change' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateKid).toHaveBeenCalled());
    await screen.findByText('Sam');
    expect(screen.queryByText(/can try their PIN again now/)).toBeNull();
  });

  it('"Your sign-in ran out" on Remove and the grown-up PIN comes with the "Sign in again" button (#130 S6 review round 2)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dead = { message: 'JWT expired', code: 'PGRST301' };
    await unlock();
    removeKid.mockRejectedValueOnce(dead);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Sam for good' }));
    expect(await screen.findByText('Your sign-in ran out — please sign in again.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    await act(async () => {});
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    fireEvent.click(screen.getByRole('button', { name: 'Keep Sam' }));
    setParentPin.mockRejectedValueOnce(dead);
    fireEvent.click(screen.getByRole('button', { name: 'Set a PIN' }));
    fireEvent.change(screen.getByLabelText('Grown-up PIN'), { target: { value: '9090' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save PIN' }));
    expect(await screen.findByText('Your sign-in ran out — please sign in again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeInTheDocument();
    // Any other failure doesn't offer it.
    setParentPin.mockRejectedValueOnce(new Error('Failed to fetch'));
    fireEvent.click(screen.getByRole('button', { name: 'Save PIN' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sign in again' })).toBeNull());
    warn.mockRestore();
  });

  it('the Change form says typing the PIN again — even the same one — unlocks it', async () => {
    await unlock();
    fireEvent.click(screen.getAllByRole('button', { name: 'Change' })[0]);
    expect(screen.getByText('Locked out after too many tries? Type their PIN here — even the same one — and save to unlock it.')).toBeInTheDocument();
  });

  it('sets a grown-up PIN (4 numbers only)', async () => {
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Set a PIN' }));
    const field = screen.getByLabelText('Grown-up PIN');
    fireEvent.change(field, { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save PIN' }));
    expect(screen.getByText('A PIN is 4 numbers.')).toBeInTheDocument();
    fireEvent.change(field, { target: { value: '9090' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save PIN' }));
    expect(await screen.findByText('Grown-up PIN saved.')).toBeInTheDocument();
    expect(setParentPin).toHaveBeenCalledWith('9090');
  });

  it('the game’s owner sees 🛡️ Question review; a family doesn’t (#147)', async () => {
    await unlock();
    expect(screen.queryByRole('button', { name: '🛡️ Question review' })).not.toBeInTheDocument();
  });

  it('an admin opens the review page from Grown-ups, and comes back (#147)', async () => {
    review.isAdmin.mockResolvedValue(true);
    await unlock();
    fireEvent.click(await screen.findByRole('button', { name: '🛡️ Question review' }));
    expect(await screen.findByText(/Nothing waiting — all clear/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '← Back to Grown-ups' }));
    expect(await screen.findByText('Sam')).toBeInTheDocument();
  });

  it('a review link (?review) opens the review page once Grown-ups is unlocked, never before (#147)', async () => {
    useFamilyStore.setState({ reviewRequested: true });
    checkAuth.signInWithPassword.mockResolvedValue({ error: null });
    render(<GrownUpsArea />);
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(review.fetchReviewQueue).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'right' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByText('🛡️ Question review')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '← Back to Grown-ups' }));
    expect(useFamilyStore.getState().reviewRequested).toBe(false);
  });
});
