import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

const sam: Kid = { id: 'kid-sam', name: 'Sam', icon: 'fox', picture: 'rocket', birthYear: 2017, birthMonth: 3 };
const old: Kid = { id: 'kid-old', name: null, icon: null, picture: null, birthYear: 2015, birthMonth: 1 };
const removeKid = vi.fn(async () => {});
const setGrownUpsOpen = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: { id: 'grown-up-1', email: 'mum@example.com' } as never });
  useFamilyStore.setState({ kids: [sam, old], consentAt: '2026-10-10T10:00:00Z', removeKid, setGrownUpsOpen });
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

  it('open: each kid with their age and secret picture; an old kid shows they have none yet', async () => {
    await unlock();
    expect(screen.getByText(new RegExp(`Age ${calcAge(2017, 3)} · secret picture 🚀 Rocket`))).toBeInTheDocument();
    expect(screen.getByText('Player')).toBeInTheDocument();
    expect(screen.getByText(/no secret picture yet/)).toBeInTheDocument();
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
});
