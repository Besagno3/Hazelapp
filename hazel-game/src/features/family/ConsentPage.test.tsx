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

describe('ConsentPage (#124)', () => {
  it("shows the notice and can't be agreed to without ticking the box", () => {
    render(<ConsentPage />);
    expect(screen.getByText('Who we are')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'I agree' });
    // Waits with aria-disabled (the keyboard keeps its place), and a tap does nothing.
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(agree).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(button).toHaveAttribute('aria-disabled', 'false');
    fireEvent.click(button);
    expect(agree).toHaveBeenCalledTimes(1);
  });

  it('shows why agreeing failed in plain words — the raw error goes to the console (#130 S6)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    agree.mockRejectedValueOnce(new Error('Failed to fetch'));
    render(<ConsentPage />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'I agree' }));
    expect(await screen.findByText("We couldn't reach Hazel Quest. Check your internet connection, then try again.")).toBeInTheDocument();
    agree.mockRejectedValueOnce(Object.assign(new Error('permission denied for function record_consent'), { code: '42501' }));
    fireEvent.click(screen.getByRole('button', { name: 'I agree' }));
    expect(await screen.findByText("We couldn't save your OK just now. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/permission denied/)).toBeNull();
    expect(warn).toHaveBeenCalledWith('Recording consent failed:', 'permission denied for function record_consent [42501]');
    warn.mockRestore();
  });

  it('a grown-up who says no can sign out', () => {
    render(<ConsentPage />);
    fireEvent.click(screen.getByRole('button', { name: /sign out/ }));
    expect(signOut).toHaveBeenCalled();
  });
});
