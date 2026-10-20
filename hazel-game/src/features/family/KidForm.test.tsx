import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { Kid } from '../../types';

// "Sign in again" signs out through the Supabase client.
const auth = vi.hoisted(() => ({ signOut: vi.fn(async () => ({ error: null })) }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));

const { default: KidForm } = await import('./KidForm');
const { KID_BIRTH_YEARS } = await import('../../content/family');

function fill({ name = 'Sam', month = '3', year = String(KID_BIRTH_YEARS[5]), icon = 'Fox', pin = '4821' } = {}) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Nickname' }), { target: { value: name } });
  if (month) fireEvent.change(screen.getByRole('combobox', { name: 'Birth month' }), { target: { value: month } });
  if (year) fireEvent.change(screen.getByRole('combobox', { name: 'Birth year' }), { target: { value: year } });
  if (icon) fireEvent.click(screen.getByRole('button', { name: icon }));
  fireEvent.change(pinField(), { target: { value: pin } });
}
const pinField = () => screen.getByLabelText('PIN') as HTMLInputElement;

describe('KidForm (#124)', () => {
  it('asks for each thing it needs, in turn, before saving', () => {
    const onSubmit = vi.fn(async () => {});
    render(<KidForm submitLabel="Add player" onSubmit={onSubmit} />);
    const save = screen.getByRole('button', { name: 'Add player' });
    fireEvent.click(save);
    expect(screen.getByText('Give them a nickname.')).toBeInTheDocument();
    fill({ month: '', year: '', icon: '', pin: '' });
    fireEvent.click(save);
    expect(screen.getByText('Pick their birth month and year.')).toBeInTheDocument();
    fill({ icon: '', pin: '' });
    fireEvent.click(save);
    expect(screen.getByText('Pick a picture for their tile.')).toBeInTheDocument();
    fill({ pin: '' });
    fireEvent.click(save);
    expect(screen.getByText('Their PIN is 4 numbers.')).toBeInTheDocument();
    fill({ pin: '482' });
    fireEvent.click(save);
    expect(screen.getByText('Their PIN is 4 numbers.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends the kid, nickname trimmed', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<KidForm submitLabel="Add player" onSubmit={onSubmit} />);
    fill({ name: '  Sam  ' });
    expect(screen.getByRole('button', { name: 'Fox' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Add player' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ name: 'Sam', icon: 'fox', pin: '4821', birthYear: KID_BIRTH_YEARS[5], birthMonth: 3 }),
    );
  });

  it('the PIN field takes digits only, at most 4, and can be shown', () => {
    render(<KidForm submitLabel="Add player" onSubmit={async () => {}} />);
    fireEvent.change(pinField(), { target: { value: '4a8-21 9' } });
    expect(pinField()).toHaveValue('4821');
    expect(pinField()).toHaveAttribute('inputmode', 'numeric');
    expect(pinField().type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(pinField().type).toBe('text');
  });

  it('changing a kid with a PIN: a blank PIN keeps theirs', async () => {
    const onSubmit = vi.fn(async () => {});
    const kid: Kid = { id: 'k', name: 'Sam', icon: 'fox', hasPin: true, birthYear: KID_BIRTH_YEARS[5], birthMonth: 3 };
    render(<KidForm kid={kid} submitLabel="Save" onSubmit={onSubmit} />);
    expect(pinField()).toHaveAttribute('placeholder', 'New PIN (blank keeps theirs)');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sam', pin: undefined })));
  });

  it('shows why a save failed in plain words — the raw error goes to the console (#130 S6)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onSubmit = vi.fn(async (): Promise<void> => Promise.reject(new Error('Failed to fetch')));
    render(<KidForm submitLabel="Add player" onSubmit={onSubmit} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Add player' }));
    expect(await screen.findByText("We couldn't reach Hazel Quest. Check your internet connection, then try again.")).toBeInTheDocument();
    // The database's own refusals, in words a grown-up can act on.
    const said = async (err: unknown, words: string) => {
      onSubmit.mockRejectedValueOnce(err);
      fireEvent.click(screen.getByRole('button', { name: 'Add player' }));
      expect(await screen.findByText(words)).toBeInTheDocument();
    };
    await said(Object.assign(new Error('kid_limit: a family account can have up to 8 players'), { code: 'P0001' }), 'A family can have up to 8 players. Tap Cancel, then Remove by a player to make room.');
    await said({ message: 'new row violates check constraint "profiles_display_name_length"', code: '23514' }, 'A nickname is 1 to 20 letters.');
    await said({ message: 'permission denied for table profiles', code: '42501' }, "That didn't save just now. Please try again.");
    expect(screen.queryByText(/42501|permission denied|kid_limit/)).toBeNull();
    expect(warn).toHaveBeenCalledWith('Saving a player failed:', 'permission denied for table profiles [42501]');
    warn.mockRestore();
  });

  it('"Your sign-in ran out" comes with the "Sign in again" button (#130 S6 review round 2)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onSubmit = vi.fn(async () => {
      throw Object.assign(new Error('JWT expired'), { code: 'PGRST301' });
    });
    render(<KidForm submitLabel="Add player" onSubmit={onSubmit} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Add player' }));
    expect(await screen.findByText('Your sign-in ran out — please sign in again.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    await act(async () => {});
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    // Another failure: no button.
    onSubmit.mockRejectedValueOnce(new Error('Failed to fetch'));
    fireEvent.click(screen.getByRole('button', { name: 'Add player' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sign in again' })).toBeNull());
    warn.mockRestore();
  });

  it('Save waits with aria-disabled while it saves, and saves once', async () => {
    let done: () => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((r) => (done = r)));
    render(<KidForm submitLabel="Add player" onSubmit={onSubmit} />);
    fill();
    const save = screen.getByRole('button', { name: 'Add player' });
    fireEvent.click(save);
    expect(save).toHaveTextContent('Saving…');
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    done();
    await waitFor(() => expect(save).toHaveAttribute('aria-disabled', 'false'));
  });

  it('changing a kid starts from what they have — an older birth year included', () => {
    const kid: Kid = { id: 'k', name: 'Big Sis', icon: 'tiger', hasPin: false, birthYear: 2001, birthMonth: 12 };
    render(<KidForm kid={kid} submitLabel="Save" onSubmit={async () => {}} />);
    expect(screen.getByRole('textbox', { name: 'Nickname' })).toHaveValue('Big Sis');
    expect(screen.getByRole('combobox', { name: 'Birth year' })).toHaveValue('2001');
    expect(screen.getByRole('button', { name: 'Tiger' })).toHaveAttribute('aria-pressed', 'true');
    expect(pinField()).toHaveAttribute('placeholder', 'Their 4-digit PIN'); // no PIN yet: one is needed
  });

  it('offers kid ages only (about 3 to 18)', () => {
    const now = new Date().getFullYear();
    expect(KID_BIRTH_YEARS[0]).toBe(now - 3);
    expect(KID_BIRTH_YEARS.at(-1)).toBe(now - 18);
  });
});
