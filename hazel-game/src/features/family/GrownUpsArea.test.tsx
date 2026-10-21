import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import type { Kid } from '../../types';
import type { PinVerdict } from '../../lib/pinLock';

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getSession: vi.fn(),
}));
const rpc = vi.hoisted(() => vi.fn());
// The gate checks the password on a one-off client that keeps nothing (#124b review round 2),
// whose token then opens 👪 Grown-ups on the device's sign-in (#167).
const checkAuth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signOut: vi.fn() }));
const checkRpc = vi.hoisted(() => vi.fn());
vi.mock('../../lib/supabase', () => ({ supabase: { auth, rpc }, passwordCheckClient: () => ({ auth: checkAuth, rpc: checkRpc }) }));
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
const { DEVICE_SESSION, deviceSession } = await import('../../test/grownUps');
const { KidAddedWithoutPin } = await import('../../store/familyStore');
const { GrownUpsLockedError } = await import('../../lib/grownUpsGate');
const { useGrownUpsStore, resetGrownUps } = await import('../../store/grownUpsStore');

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
  resetGrownUps();
  checkAuth.signOut.mockResolvedValue({ error: null });
  checkRpc.mockResolvedValue({ data: { unlocked: true, seconds: 900 }, error: null });
  rpc.mockResolvedValue({ data: null, error: null });
  auth.getSession.mockResolvedValue(deviceSession);
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
    // That check's token opens 👪 Grown-ups on the device's own sign-in, which it names (#167).
    expect(checkRpc).toHaveBeenCalledWith('unlock_grown_ups', { p_session: DEVICE_SESSION });
    expect(checkRpc.mock.invocationCallOrder[0]).toBeLessThan(checkAuth.signOut.mock.invocationCallOrder[0]);
    // …once the device has asked the database for that check, before it signed in (#167 review round 2).
    const ask = rpc.mock.calls.findIndex(([fn]) => fn === 'ask_grown_up_check');
    expect(ask).toBeGreaterThan(-1);
    expect(rpc.mock.invocationCallOrder[ask]).toBeLessThan(checkAuth.signInWithPassword.mock.invocationCallOrder[0]);
  });

  it('a right password the database won\'t open on says so plainly, and stays shut (#167)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    checkAuth.signInWithPassword.mockResolvedValue({ error: null });
    checkRpc.mockResolvedValue({ data: null, error: { code: 'HQ002', message: 'reauth_required: type your password again' } });
    render(<GrownUpsArea />);
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'right' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(pageStatus()).toHaveTextContent("We couldn't open 👪 Grown-ups just now. Please try again."));
    expect(screen.queryByText('Sam')).not.toBeInTheDocument();
    expect(screen.queryByText(/reauth_required/)).toBeNull();
    // The check's sign-in is signed out all the same.
    expect(checkAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    warn.mockRestore();
  });

  it('a database from before 0024 has no gate to open: the password still opens the area (#167)', async () => {
    checkRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.unlock_grown_ups' } });
    await unlock();
    expect(screen.getByText('Locks again when you leave, or after 15 minutes.')).toBeInTheDocument();
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
    // (The sign-in goes out once the login's current email has been read.)
    await waitFor(() => expect(checkAuth.signInWithPassword).toHaveBeenCalledOnce());
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

  it('Sign out lives here, behind the password — 👪 Grown-ups is shut on this sign-in first (#167)', async () => {
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith('lock_grown_ups');
    expect(rpc.mock.invocationCallOrder.at(-1)!).toBeLessThan(auth.signOut.mock.invocationCallOrder[0]);
  });

  it('Sign out shows it is on its way while 👪 Grown-ups is shut, and a second tap signs out once (#167 review round 1)', async () => {
    await unlock();
    let release!: () => void;
    rpc.mockImplementation((fn: string) =>
      fn === 'lock_grown_ups' ? new Promise((res) => (release = () => res({ data: null, error: null }))) : Promise.resolve({ data: null, error: null }),
    );
    const button = screen.getByRole('button', { name: 'Sign out' });
    fireEvent.click(button);
    expect(button).toHaveTextContent('Signing out…');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    await act(async () => release());
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
    expect(rpc.mock.calls.filter(([fn]) => fn === 'lock_grown_ups')).toHaveLength(1);
  });

  it('the gate\'s top line follows what can work: the wait names the reset, an ended sign-in says to sign in again — never "Enter the password…" (#167 review round 2)', async () => {
    render(<GrownUpsArea />);
    checkRpc.mockResolvedValueOnce({ data: null, error: { code: 'HQ002', message: 'password_changed: x', details: '2026-10-22T15:40:00Z' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'right' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByText('Reset your password to open it now.')).toBeInTheDocument();
    expect(screen.queryByText(/^Enter the password for/)).toBeNull();
    expect(screen.getByRole('button', { name: '← Back to Who\'s playing' })).toBeInTheDocument();
    cleanup();
    render(<GrownUpsArea />);
    checkRpc.mockResolvedValueOnce({ data: null, error: { code: 'HQ002', message: "no_session: that sign-in isn't a live one of yours" } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'right' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByText('Sign in again to carry on.')).toBeInTheDocument();
    expect(screen.getAllByRole('button').filter((b) => b.className.includes('bg-purple-600')).map((b) => b.textContent)).toEqual(['Sign in again']);
  });

  it("the gate gives way to the list with its title focused, not the page (#167 review round 1 also noted)", async () => {
    await unlock();
    expect(screen.getByRole('heading', { name: '👪 Grown-ups' })).toHaveFocus();
  });

  it('back on the list once the window has run out, it shows the gate again — not controls that would only ask (#167 review round 1)', async () => {
    await unlock();
    expect(useGrownUpsStore.getState().openedAt).toBeGreaterThan(0);
    // 50 ms left: the list waits it out, then gives way to the gate.
    act(() => useGrownUpsStore.setState({ openedAt: Date.now() - 15 * 60_000 + 50 }));
    expect(screen.getByText('Sam')).toBeInTheDocument();
    expect(await screen.findByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.queryByText('Sam')).toBeNull();
    // …and says why, on the gate and out loud (#167 review round 2) — in the area's own live
    // region, there before the swap, so it's read; focus is on the gate's title.
    expect(screen.getByText(/^👪 Grown-ups locked after 15 minutes\. Enter the password for mum@example\.com\.$/)).toBeInTheDocument();
    const live = screen.getAllByRole('status').find((el) => el.classList.contains('sr-only'))!;
    expect(live).toHaveTextContent('👪 Grown-ups locked after 15 minutes.');
    expect(screen.getByRole('heading', { name: '👪 Grown-ups' })).toHaveFocus();
    // Opened again: the note goes.
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'right' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByText('Sam');
    expect(live).toBeEmptyDOMElement();
  });

  it('while Sign out is on its way, "Done" waits — no second lock, no flicker to Who\'s playing (#167 review round 2)', async () => {
    let release!: () => void;
    auth.signOut.mockImplementation(() => new Promise((ok) => (release = () => ok({ error: null }))));
    await unlock();
    const setGrownUpsOpen = vi.fn();
    useFamilyStore.setState({ setGrownUpsOpen });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    const done = screen.getByRole('button', { name: "Done — back to Who's playing" });
    await waitFor(() => expect(done).toHaveAttribute('aria-disabled', 'true'));
    fireEvent.click(done);
    expect(setGrownUpsOpen).not.toHaveBeenCalled();
    await act(async () => release());
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
  });

  it('…but a page part-filled keeps its place, and the list checks again when it comes back', async () => {
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: /Add a player/ }));
    act(() => useGrownUpsStore.setState({ openedAt: Date.now() - 16 * 60_000 }));
    expect(screen.getByRole('textbox', { name: 'Nickname' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByPlaceholderText('Password')).toBeInTheDocument();
  });

  it('a player added whose PIN didn\'t save: the form changes them now, so trying again sets the PIN — never a second player (#167 review round 1)', async () => {
    const kit: Kid = { id: 'kid-kit', name: 'Kit', icon: 'panda', hasPin: false, birthYear: new Date().getFullYear() - 7, birthMonth: 8 };
    const addKid = vi.fn(async () => {
      useFamilyStore.setState((st) => ({ kids: [...st.kids, kit] }));
      throw new KidAddedWithoutPin(kit, new GrownUpsLockedError('👪 Grown-ups locked again, so nothing changed.'));
    });
    useFamilyStore.setState({ addKid });
    await unlock();
    fireEvent.click(screen.getByRole('button', { name: /Add a player/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nickname' }), { target: { value: 'Kit' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Birth month' }), { target: { value: '8' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Birth year' }), { target: { value: String(kit.birthYear) } });
    fireEvent.click(screen.getByRole('button', { name: /Panda/ }));
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '2468' } });
    const heading = screen.getByRole('heading', { name: 'Add a player' });
    const scrolled = vi.fn();
    const scrollBefore = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrolled;
    onTestFinished(() => {
      Element.prototype.scrollIntoView = scrollBefore;
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add player' }));
    // Review round 2: the title stays "Add a player" (a new one sent the page to its top, away
    // from the words), the words come into view where they're said, and the PIN still in its box
    // means Save is all it takes.
    expect(await screen.findByText("Kit is added, but their PIN didn't save. Tap Save to set their PIN.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add a player' })).toBe(heading);
    expect(screen.queryByRole('heading', { name: 'Change Kit' })).toBeNull();
    expect(scrolled).toHaveBeenCalledWith({ block: 'nearest' });
    expect(scrolled.mock.contexts.at(-1)).toHaveAttribute('role', 'status');
    // What was typed is still there; Save changes Kit (sets the PIN) — no second add.
    expect(screen.getByRole('textbox', { name: 'Nickname' })).toHaveValue('Kit');
    expect(screen.getByLabelText('PIN')).toHaveValue('2468');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateKid).toHaveBeenCalledWith('kid-kit', expect.objectContaining({ name: 'Kit', pin: '2468' })));
    expect(addKid).toHaveBeenCalledTimes(1);
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
