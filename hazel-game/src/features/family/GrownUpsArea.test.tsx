import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { Kid } from '../../types';

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));

const { default: GrownUpsArea } = await import('./GrownUpsArea');
const { useFamilyStore } = await import('../../store/familyStore');
const { useAuthStore } = await import('../../store/authStore');
const { calcAge } = await import('../../lib/age');

const sam: Kid = { id: 'kid-sam', name: 'Sam', icon: 'fox', hasPin: true, birthYear: 2017, birthMonth: 3 };
const old: Kid = { id: 'kid-old', name: null, icon: null, hasPin: false, birthYear: 2015, birthMonth: 1 };
const removeKid = vi.fn(async () => {});
const setGrownUpsOpen = vi.fn();
const checkParentPin = vi.fn(async (pin: string) => pin === '9090');
const setParentPin = vi.fn(async () => {});

async function type(pin: string) {
  for (const d of pin) await act(async () => fireEvent.click(screen.getByRole('button', { name: d })));
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: { id: 'grown-up-1', email: 'mum@example.com' } as never });
  useFamilyStore.setState({
    kids: [sam, old],
    consentAt: '2026-10-10T10:00:00Z',
    hasParentPin: false,
    removeKid,
    setGrownUpsOpen,
    checkParentPin,
    setParentPin,
  });
});

async function unlock() {
  auth.signInWithPassword.mockResolvedValue({ error: null });
  render(<GrownUpsArea />);
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'right' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  await screen.findByText('Sam');
}

describe('GrownUpsArea (#118)', () => {
  it("stays shut without the grown-up's password", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    render(<GrownUpsArea />);
    expect(screen.getByText(/mum@example\.com/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'guess' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument();
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'mum@example.com', password: 'guess' });
    expect(screen.queryByText('Sam')).not.toBeInTheDocument();
  });

  it('a forgotten password gets a reset link; Back returns to Who’s playing', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    render(<GrownUpsArea />);
    fireEvent.click(screen.getByRole('button', { name: /Forgot it/ }));
    expect(await screen.findByText(/reset link is on its way to mum@example\.com/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back to Who/ }));
    expect(setGrownUpsOpen).toHaveBeenCalledWith(false);
  });

  it('with a grown-up PIN: the PIN opens it, a wrong one does not, and the password still works', async () => {
    useFamilyStore.setState({ hasParentPin: true });
    render(<GrownUpsArea />);
    expect(screen.getByText('Type your grown-up PIN.')).toBeInTheDocument();
    await type('1111');
    expect(screen.queryByText('Sam')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Not quite/);
    fireEvent.click(screen.getByRole('button', { name: 'Use my password instead' }));
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use my grown-up PIN instead' }));
    await type('9090');
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
});
