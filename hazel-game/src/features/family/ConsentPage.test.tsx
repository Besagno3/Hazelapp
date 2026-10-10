import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const signOut = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: () => signOut() } } }));

const { default: ConsentPage } = await import('./ConsentPage');
const { useFamilyStore } = await import('../../store/familyStore');

const agree = vi.fn(async () => {});
beforeEach(() => {
  vi.clearAllMocks();
  useFamilyStore.setState({ agree });
});

describe('ConsentPage (#118)', () => {
  it("shows the notice and can't be agreed to without ticking the box", () => {
    render(<ConsentPage />);
    expect(screen.getByText('Who we are')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'I agree' });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(agree).toHaveBeenCalledTimes(1);
  });

  it('shows why agreeing failed', async () => {
    agree.mockRejectedValueOnce(new Error('Network down'));
    render(<ConsentPage />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'I agree' }));
    expect(await screen.findByText('Network down')).toBeInTheDocument();
  });

  it('a grown-up who says no can sign out', () => {
    render(<ConsentPage />);
    fireEvent.click(screen.getByRole('button', { name: /sign out/ }));
    expect(signOut).toHaveBeenCalled();
  });
});
