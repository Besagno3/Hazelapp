import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const signOut = vi.fn(async () => ({ error: null }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: () => signOut() } } }));

const { default: SignOutButton, SIGN_OUT_ARM_MS } = await import('./SignOutButton');
const { useSaveStore } = await import('../../store/saveStore');

describe('SignOutButton', () => {
  beforeEach(() => {
    signOut.mockClear();
    useSaveStore.setState({ flush: vi.fn(async () => {}) });
  });
  afterEach(() => vi.useRealTimers());

  it('floating (every screen but the world): one tap signs out', async () => {
    render(<SignOutButton />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("in the world's top bar (#75 item 14b review): the first tap only asks, the second signs out", async () => {
    render(<SignOutButton inline />);
    const button = screen.getByRole('button', { name: 'Sign out' });
    expect(button.className).not.toMatch(/(^|\s)fixed(\s|$)/);
    expect(button.className).toContain('min-h-11');
    fireEvent.click(button);
    expect(signOut).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Tap again to sign out' })));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('…and goes back to "Sign out" if the second tap never comes', () => {
    vi.useFakeTimers();
    render(<SignOutButton inline />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('button', { name: 'Tap again to sign out' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(SIGN_OUT_ARM_MS + 10));
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });
});
