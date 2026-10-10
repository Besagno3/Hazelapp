import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Kid } from '../../types';

const { default: KidForm } = await import('./KidForm');
const { KID_BIRTH_YEARS } = await import('../../content/family');

function fill({ name = 'Sam', month = '3', year = String(KID_BIRTH_YEARS[5]), icon = 'Fox', picture = 'Rocket' } = {}) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Nickname' }), { target: { value: name } });
  if (month) fireEvent.change(screen.getByRole('combobox', { name: 'Birth month' }), { target: { value: month } });
  if (year) fireEvent.change(screen.getByRole('combobox', { name: 'Birth year' }), { target: { value: year } });
  if (icon) fireEvent.click(screen.getByRole('button', { name: icon }));
  if (picture) fireEvent.click(screen.getByRole('button', { name: picture }));
}

describe('KidForm (#118)', () => {
  it('asks for each thing it needs, in turn, before saving', () => {
    const onSubmit = vi.fn(async () => {});
    render(<KidForm submitLabel="Add player" onSubmit={onSubmit} />);
    const save = screen.getByRole('button', { name: 'Add player' });
    fireEvent.click(save);
    expect(screen.getByText('Give them a nickname.')).toBeInTheDocument();
    fill({ month: '', year: '', icon: '', picture: '' });
    fireEvent.click(save);
    expect(screen.getByText('Pick their birth month and year.')).toBeInTheDocument();
    fill({ icon: '', picture: '' });
    fireEvent.click(save);
    expect(screen.getByText('Pick a picture for their tile.')).toBeInTheDocument();
    fill({ picture: '' });
    fireEvent.click(save);
    expect(screen.getByText('Pick their secret picture.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends the kid, nickname trimmed', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<KidForm submitLabel="Add player" onSubmit={onSubmit} />);
    fill({ name: '  Sam  ' });
    expect(screen.getByRole('button', { name: 'Fox' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Add player' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ name: 'Sam', icon: 'fox', picture: 'rocket', birthYear: KID_BIRTH_YEARS[5], birthMonth: 3 }),
    );
  });

  it('shows why a save failed', async () => {
    render(<KidForm submitLabel="Add player" onSubmit={async () => Promise.reject(new Error('Offline'))} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Add player' }));
    expect(await screen.findByText('Offline')).toBeInTheDocument();
  });

  it('changing a kid starts from what they have — an older birth year included', () => {
    const kid: Kid = { id: 'k', name: 'Big Sis', icon: 'tiger', picture: 'pizza', birthYear: 2001, birthMonth: 12 };
    render(<KidForm kid={kid} submitLabel="Save" onSubmit={async () => {}} />);
    expect(screen.getByRole('textbox', { name: 'Nickname' })).toHaveValue('Big Sis');
    expect(screen.getByRole('combobox', { name: 'Birth year' })).toHaveValue('2001');
    expect(screen.getByRole('button', { name: 'Tiger' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Pizza' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers kid ages only (about 3 to 18)', () => {
    const now = new Date().getFullYear();
    expect(KID_BIRTH_YEARS[0]).toBe(now - 3);
    expect(KID_BIRTH_YEARS.at(-1)).toBe(now - 18);
  });
});
