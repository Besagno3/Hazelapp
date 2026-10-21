import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Kid } from '../../types';

const { default: KidSetupPage } = await import('./KidSetupPage');
const { useFamilyStore } = await import('../../store/familyStore');

describe('KidSetupPage (#124)', () => {
  it("finishes a kid from before PINs: it can't be saved without one", async () => {
    const old: Kid = { id: 'kid-old', name: null, icon: null, hasPin: false, birthYear: 2015, birthMonth: 1 };
    const done: Kid = { id: 'kid-sam', name: 'Sam', icon: 'fox', hasPin: true, birthYear: 2017, birthMonth: 3 };
    const updateKid = vi.fn(async () => {});
    useFamilyStore.setState({ kids: [done, old], updateKid });
    render(<KidSetupPage />);
    expect(screen.getByText('Finish setting up your player')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Nickname' }), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bee' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Their PIN is 4 numbers.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '2468' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(updateKid).toHaveBeenCalledWith('kid-old', { name: 'Ada', icon: 'bee', pin: '2468', birthYear: 2015, birthMonth: 1 }),
    );
  });

  it("opens with its title focused, and a player whose PIN just didn't save is told why it's asking (#167 review round 2)", () => {
    const kit: Kid = { id: 'kid-kit', name: 'Kit', icon: 'panda', hasPin: false, birthYear: 2019, birthMonth: 8 };
    useFamilyStore.setState({ kids: [kit], pinNotSavedFor: 'kid-kit', updateKid: vi.fn(async () => {}) });
    const { unmount } = render(<KidSetupPage />);
    expect(screen.getByRole('heading', { name: 'Finish setting up Kit' })).toHaveFocus();
    expect(screen.getByText("Kit is added, but their PIN didn't save. Enter their 4-digit PIN again and tap Save.")).toBeInTheDocument();
    unmount();
    // Any other player needing a PIN gets the usual words.
    useFamilyStore.setState({ pinNotSavedFor: null });
    render(<KidSetupPage />);
    expect(screen.getByText('Every player opens their adventure with their own 4-digit PIN. A grown-up sets it here.')).toBeInTheDocument();
  });
});
