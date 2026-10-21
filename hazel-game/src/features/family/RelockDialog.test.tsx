import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import type { Kid } from '../../types';

// The Supabase client, mocked: a query builder whose answers the test picks,
// the device's sign-in, and the one-off client every password check uses.
const db = vi.hoisted(() => {
  type Op = [string, unknown[]];
  const chains: { table: string; ops: Op[] }[] = [];
  const answer = vi.fn<(table: string, ops: Op[]) => { data: unknown; error: unknown }>(() => ({ data: null, error: null }));
  const from = (table: string) => {
    const chain = { table, ops: [] as Op[] };
    chains.push(chain);
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'insert', 'update', 'delete', 'single', 'maybeSingle']) {
      b[m] = (...args: unknown[]) => {
        chain.ops.push([m, args]);
        return b;
      };
    }
    b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(answer(table, chain.ops)).then(ok, bad);
    return b;
  };
  return { chains, answer, from };
});
const auth = vi.hoisted(() => ({ signOut: vi.fn(), getSession: vi.fn(), resetPasswordForEmail: vi.fn() }));
const rpc = vi.hoisted(() => vi.fn());
const checkAuth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signOut: vi.fn() }));
const checkRpc = vi.hoisted(() => vi.fn());
vi.mock('../../lib/supabase', () => ({
  supabase: { from: db.from, rpc, auth },
  passwordCheckClient: () => ({ auth: checkAuth, rpc: checkRpc }),
  forgetStoredSession: vi.fn(),
}));
vi.mock('../../lib/review', async (original) => ({
  ...(await original<typeof import('../../lib/review')>()),
  isAdmin: vi.fn(async () => false),
}));

const { default: GrownUpsArea } = await import('./GrownUpsArea');
const { default: RelockDialog } = await import('./RelockDialog');
const { useFamilyStore } = await import('../../store/familyStore');
const { useAuthStore } = await import('../../store/authStore');
const { resetGrownUps, useGrownUpsStore, asGrownUp } = await import('../../store/grownUpsStore');
const { DEVICE_SIGNED_OUT_WHY, grownUpsLockedMessage } = await import('../../lib/grownUpsGate');
const { plainErrorOr } = await import('../../lib/familyErrors');
const { DEVICE_SESSION, deviceSession } = await import('../../test/grownUps');

const sam: Kid = { id: 'kid-sam', name: 'Sam', icon: 'fox', hasPin: true, birthYear: 2017, birthMonth: 3 };
const LOCKED = { code: 'HQ001', message: 'grown_ups_locked: open 👪 Grown-ups with your grown-up PIN or password first' };
const KIT_ROW = { id: 'kid-kit', display_name: 'Kit', icon: 'panda', has_pin: false, birth_year: 2019, birth_month: 8 };

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  db.chains.length = 0;
  resetGrownUps();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  auth.getSession.mockResolvedValue(deviceSession);
  auth.signOut.mockResolvedValue({ error: null });
  rpc.mockImplementation(async (fn: string) => (fn === 'pin_lock_status' ? { data: { kids: {}, grown_up: 0 }, error: null } : { data: null, error: null }));
  checkAuth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: 'fresh' } }, error: null });
  checkAuth.signOut.mockResolvedValue({ error: null });
  checkRpc.mockResolvedValue({ data: { unlocked: true, seconds: 900 }, error: null });
  useAuthStore.setState({ user: { id: 'grown-up-1', email: 'mum@example.com' } as never });
  useFamilyStore.setState({ userId: 'grown-up-1', status: 'ready', kids: [sam], consentAt: '2026-10-10T10:00:00Z', hasParentPin: false, reviewRequested: false });
});
const IN_AREA_LOCKED = () => grownUpsLockedMessage({ inArea: true, hasParentPin: false });
afterEach(() => warn.mockRestore());

/** 👪 Grown-ups open (by password), with the dialog beside it as App renders it, then "＋ Add a player" filled in. */
async function addKitWhileLocked() {
  render(
    <>
      <GrownUpsArea />
      <RelockDialog inArea />
    </>,
  );
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'right' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  await screen.findByText('Sam');
  fireEvent.click(screen.getByRole('button', { name: /Add a player/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Nickname' }), { target: { value: 'Kit' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Birth month' }), { target: { value: '8' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Birth year' }), { target: { value: String(new Date().getFullYear() - 7) } });
  fireEvent.click(screen.getByRole('button', { name: /Panda/ }));
  fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '2468' } });
  checkAuth.signInWithPassword.mockClear();
  checkRpc.mockClear();
  // The 15 minutes ran out while the form was being filled in: the first insert is refused.
  let inserts = 0;
  db.answer.mockImplementation((table, ops) => {
    if (table === 'profiles' && ops.some(([m]) => m === 'insert')) {
      inserts += 1;
      return inserts === 1 ? { data: null, error: LOCKED } : { data: KIT_ROW, error: null };
    }
    return { data: null, error: null };
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add player' }));
  return { inserts: () => inserts };
}

describe('👪 Grown-ups locked again mid-action (#167)', () => {
  it('asks over the page — the form and what was typed stay — and the save carries on once it opens', async () => {
    const run = await addKitWhileLocked();
    const dialog = await screen.findByRole('dialog', { name: '👪 Grown-ups locked again' });
    // One line says what to do (with the email), not two "Enter…"s (#167 review round 1).
    expect(dialog).toHaveAccessibleDescription('Enter the password for mum@example.com to carry on. Everything on this page stays as it was.');
    expect(screen.queryByText('Enter the password for mum@example.com.')).toBeNull();
    // The form is still there behind it, as it was typed, still saving.
    expect(screen.getByRole('textbox', { name: 'Nickname', hidden: true })).toHaveValue('Kit');
    expect(screen.getByLabelText('PIN', { selector: 'input' })).toHaveValue('2468');
    // The password box takes the keyboard (nothing else to do here).
    const password = screen.getByRole('dialog').querySelector('input')!;
    expect(password).toHaveFocus();
    fireEvent.change(password, { target: { value: 'right' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(checkAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'mum@example.com', password: 'right' });
    expect(checkRpc).toHaveBeenCalledWith('unlock_grown_ups', { p_session: DEVICE_SESSION });
    // The same insert again, then the PIN: the player is added and the list is back.
    expect(await screen.findByText('Kit')).toBeInTheDocument();
    expect(run.inserts()).toBe(2);
    expect(rpc).toHaveBeenCalledWith('set_kid_pin', { p_kid: 'kid-kit', p_pin: '2468' });
  });

  it('"Not now" ends it: nothing changed, the page says so, and what was typed is still there', async () => {
    const run = await addKitWhileLocked();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText(IN_AREA_LOCKED())).toBeInTheDocument();
    expect(IN_AREA_LOCKED()).toMatch(/^👪 Grown-ups locked again, so nothing changed\./);
    expect(screen.getByRole('textbox', { name: 'Nickname' })).toHaveValue('Kit');
    expect(run.inserts()).toBe(1);
    expect(useGrownUpsStore.getState().asked).toBe(false);
  });

  it('Escape is "Not now" — and puts focus back on the button that was pressed, not the page (#167 review round 1)', async () => {
    const button = () => screen.getByRole('button', { name: /^(Add player|Saving…)$/, hidden: true });
    render(
      <>
        <GrownUpsArea />
        <RelockDialog inArea />
      </>,
    );
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'right' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByText('Sam');
    fireEvent.click(screen.getByRole('button', { name: /Add a player/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nickname' }), { target: { value: 'Kit' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Birth month' }), { target: { value: '8' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Birth year' }), { target: { value: String(new Date().getFullYear() - 7) } });
    fireEvent.click(screen.getByRole('button', { name: /Panda/ }));
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '2468' } });
    db.answer.mockImplementation(() => ({ data: null, error: LOCKED }));
    // A keyboard user presses Add player: it has the focus as the dialog opens.
    button().focus();
    fireEvent.click(button());
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(await screen.findByText(IN_AREA_LOCKED())).toBeInTheDocument();
    await waitFor(() => expect(button()).toHaveFocus());
    expect(document.activeElement).not.toBe(document.body);
  });

  it('on a setup screen (never open) "Not now" says what the step needs, for the parent and a kid alike — never "again" (#167 review rounds 1–2)', async () => {
    render(<RelockDialog />);
    const done = asGrownUp(vi.fn().mockRejectedValue(LOCKED));
    expect(await screen.findByRole('dialog', { name: "👪 Just checking it's a grown-up" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    const err = await done.catch((e: unknown) => e);
    const words = plainErrorOr(err, 'fallback');
    expect(words).toBe("Nothing changed — this step needs a grown-up's password. Not a grown-up? Please fetch one.");
    expect(words).not.toMatch(/again,|your PIN|Ask a grown-up/);
  });

  it("this device's sign-in has ended (a password change elsewhere): the password path says so, with \"Sign in again\" — no loop of \"try again\" (#167 review round 1)", async () => {
    render(<RelockDialog />);
    void asGrownUp(vi.fn().mockRejectedValue(LOCKED)).catch(() => {});
    await screen.findByRole('dialog');
    checkRpc.mockResolvedValue({ data: null, error: { code: 'HQ002', message: "no_session: that sign-in isn't a live one of yours" } });
    fireEvent.change(screen.getByRole('dialog').querySelector('input')!, { target: { value: 'right' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByText(DEVICE_SIGNED_OUT_WHY)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't open 👪 Grown-ups just now/)).toBeNull();
    // Review round 2: one way on, "Sign in again" (focused) — no "Open" that can only fail, no box —
    // and the line under the title no longer promises the page stays.
    expect(screen.getByRole('button', { name: 'Sign in again' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    expect(screen.getByRole('dialog').querySelector('input')).toBeNull();
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription("Sign in again to carry on — what you typed here won't be kept.");
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });

  it('the 24-hour wait: calm words, and the grown-up PIN is the main way on — the password box and "Open" go (#167 review round 2)', async () => {
    useFamilyStore.setState({ hasParentPin: true });
    render(<RelockDialog />);
    void asGrownUp(vi.fn().mockRejectedValue(LOCKED)).catch(() => {});
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Use my password instead' }));
    checkRpc.mockResolvedValue({ data: null, error: { code: 'HQ002', message: 'password_changed: x', details: '2026-10-22T15:40:00Z' } });
    fireEvent.change(screen.getByRole('dialog').querySelector('input')!, { target: { value: 'right' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const note = await screen.findByText(/^Your password was changed recently, so for safety it can't open 👪 Grown-ups until .+ at .+\. Your grown-up PIN still works\.$/);
    expect(note).toHaveClass('bg-amber-50');
    expect(note.closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByText(/without the old one/)).toBeNull();
    const pin = screen.getByRole('button', { name: 'Use my grown-up PIN' });
    expect(pin).toHaveFocus();
    expect(pin.className).toMatch(/bg-purple-600/);
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    expect(screen.getByRole('dialog').querySelector('input')).toBeNull();
    expect(screen.getByRole('button', { name: "Didn't change it? Reset it now" })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Use your grown-up PIN for now. Everything on this page stays as it was.');
    // The PIN is one tap away; back on the password, the wait is still said honestly.
    fireEvent.click(pin);
    expect(await screen.findByRole('button', { name: '9' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use my password instead' }));
    expect(await screen.findByRole('button', { name: 'Use my grown-up PIN' })).toBeInTheDocument();
  });

  it('the 24-hour wait with no grown-up PIN: "Email me a reset link" is the main button; once sent, the box comes back for the new password (#167 review round 2)', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    render(<RelockDialog />);
    void asGrownUp(vi.fn().mockRejectedValue(LOCKED)).catch(() => {});
    await screen.findByRole('dialog');
    checkRpc.mockResolvedValue({ data: null, error: { code: 'HQ002', message: 'password_changed: x', details: '2026-10-22T15:40:00Z' } });
    fireEvent.change(screen.getByRole('dialog').querySelector('input')!, { target: { value: 'right' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(
      await screen.findByText(/can't open 👪 Grown-ups until .+\. Didn't change it, or need it sooner\? A new password from a reset email works at once\.$/),
    ).toBeInTheDocument();
    const reset = screen.getByRole('button', { name: 'Email me a reset link' });
    expect(reset).toHaveFocus();
    expect(reset.className).toMatch(/bg-purple-600/);
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Reset your password to open it now. Everything on this page stays as it was.');
    fireEvent.click(reset);
    expect(await screen.findByText('A reset link is on its way to mum@example.com. Choose a new password from it, then enter the new one here.')).toBeInTheDocument();
    const box = screen.getByRole('dialog').querySelector('input')!;
    expect(box).toHaveFocus();
    expect(box).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.queryByText(/can't open 👪 Grown-ups until/)).toBeNull();
  });

  it('with a grown-up PIN, the PIN opens it again (on this sign-in, by the database)', async () => {
    useFamilyStore.setState({ hasParentPin: true });
    const checkParentPin = vi.fn(async () => ({ ok: true, triesLeft: 5, waitSeconds: 0, limited: true }));
    useFamilyStore.setState({ checkParentPin });
    render(<RelockDialog />);
    const done = asGrownUp(vi.fn().mockRejectedValueOnce(LOCKED).mockResolvedValueOnce('done'));
    const dialog = await screen.findByRole('dialog', { name: "👪 Just checking it's a grown-up" });
    expect(dialog).toHaveAccessibleDescription('Type your grown-up PIN to carry on. Everything on this page stays as it was.');
    // Said once: the gate's own subtitle isn't shown in the dialog (#167 review round 1).
    expect(screen.queryByText('Type your grown-up PIN.')).toBeNull();
    // The ways out sit in the pad's own column (beside it on a sideways phone, under it otherwise).
    const padColumn = within(dialog).getAllByRole('status').find((el) => el.closest('[class*="flex-1"]'))!.parentElement!;
    expect(within(padColumn).getByRole('button', { name: 'Use my password instead' })).toBeInTheDocument();
    expect(within(padColumn).getByRole('button', { name: 'Not now' })).toBeInTheDocument();
    for (const d of '9090') await act(async () => fireEvent.click(screen.getByRole('button', { name: d })));
    await expect(done).resolves.toBe('done');
    expect(checkParentPin).toHaveBeenCalledWith('9090');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(useGrownUpsStore.getState().openedAt).toBeGreaterThan(0);
  });

  it("the right grown-up PIN on a sign-in that has ended opens nothing, and offers \"Sign in again\" (#167 review round 1)", async () => {
    useFamilyStore.setState({ hasParentPin: true });
    const checkParentPin = vi.fn(async () => ({ ok: true, triesLeft: 5, waitSeconds: 0, limited: true, signedOut: true as const }));
    useFamilyStore.setState({ checkParentPin });
    render(<RelockDialog />);
    const step = vi.fn().mockRejectedValue(LOCKED);
    void asGrownUp(step).catch(() => {});
    await screen.findByRole('dialog');
    for (const d of '9090') await act(async () => fireEvent.click(screen.getByRole('button', { name: d })));
    // The same words as the password's refusal (review round 2), one "Sign in again", the pad gone.
    expect(await screen.findByText(DEVICE_SIGNED_OUT_WHY)).toBeInTheDocument();
    expect(screen.queryByText('Your sign-in ran out — please sign in again.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: '9' })).toBeNull();
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription("Sign in again to carry on — what you typed here won't be kept.");
    expect(step).toHaveBeenCalledTimes(1);
  });

  it('a wrong password keeps it shut and says so; the action keeps waiting', async () => {
    render(<RelockDialog />);
    const step = vi.fn().mockRejectedValueOnce(LOCKED).mockResolvedValueOnce('done');
    const done = asGrownUp(step);
    await screen.findByRole('dialog');
    checkAuth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 } });
    fireEvent.change(screen.getByRole('dialog').querySelector('input')!, { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByText('That password isn\'t right. Try again, or tap "Forgot it?" below.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(step).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await expect(done).resolves.toBe('done');
  });

  it('gone without being opened (the screen behind it changed): the waiting action ends locked', async () => {
    const { unmount } = render(<RelockDialog />);
    const done = asGrownUp(vi.fn().mockRejectedValue(LOCKED));
    await screen.findByRole('dialog');
    unmount();
    await expect(done).rejects.toMatchObject({ code: 'grown_ups_locked' });
  });
});
