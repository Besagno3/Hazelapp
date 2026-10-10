import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const signOut = vi.fn(async () => ({ error: null }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: () => signOut() } } }));

const { default: SignOutButton, SIGN_OUT_ARM_MS, SIGN_OUT_CONFIRM_GAP_MS } = await import('./SignOutButton');
const { useSaveStore } = await import('../../store/saveStore');

/** A second tap, a beat after the first (not the tail of a double-tap). */
const pause = () => act(() => vi.advanceTimersByTime(SIGN_OUT_CONFIRM_GAP_MS + 50));

describe('SignOutButton', () => {
  let flush: ReturnType<typeof vi.fn<() => Promise<void>>>;
  beforeEach(() => {
    vi.useFakeTimers();
    signOut.mockClear();
    flush = vi.fn<() => Promise<void>>(async () => {});
    useSaveStore.setState({ flush });
  });
  afterEach(() => vi.useRealTimers());

  it('floating (every screen but the world): one tap signs out', async () => {
    render(<SignOutButton />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("in the world's top bar (#75 item 14b review): the first tap asks, the second signs out", async () => {
    render(<SignOutButton inline />);
    const button = screen.getByRole('button', { name: 'Sign out' });
    expect(button.className).not.toMatch(/(^|\s)fixed(\s|$)/);
    expect(button.className).toContain('min-h-11');
    fireEvent.click(button);
    expect(signOut).not.toHaveBeenCalled();
    // Same button, same size — the question floats under it and is read out.
    expect(screen.getByRole('button', { name: 'Sign out?' })).toBe(button);
    expect(screen.getByRole('status')).toHaveTextContent('Tap again to sign out');
    expect(button).toHaveAccessibleDescription('Tap again to sign out');
    await pause();
    await act(async () => fireEvent.click(button));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('…goes back to "Sign out" if the second tap never comes', () => {
    render(<SignOutButton inline />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    act(() => vi.advanceTimersByTime(SIGN_OUT_ARM_MS + 10));
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('…a double-tap only asks: its second half is too quick to count as yes (review 2)', async () => {
    render(<SignOutButton inline />);
    const button = screen.getByRole('button', { name: 'Sign out' });
    fireEvent.click(button);
    act(() => vi.advanceTimersByTime(SIGN_OUT_CONFIRM_GAP_MS - 150));
    await act(async () => fireEvent.click(button));
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign out?' })).toBeInTheDocument();
  });

  it('…any other tap or key, or leaving the button, takes the question back (review 2)', () => {
    render(
      <>
        <SignOutButton inline />
        <button>d-pad</button>
      </>,
    );
    const button = screen.getByRole('button', { name: 'Sign out' });
    fireEvent.click(button);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'd-pad' }));
    expect(screen.getByRole('button', { name: 'Sign out' })).toBe(button);

    fireEvent.click(button);
    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(screen.getByRole('button', { name: 'Sign out' })).toBe(button);

    fireEvent.click(button);
    fireEvent.blur(button);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBe(button);

    // Walking with the arrow keys while the button still has focus takes it back too…
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Sign out' })).toBe(button);

    // …but Enter or Space on the button (to answer) doesn't.
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: ' ' });
    expect(screen.getByRole('button', { name: 'Sign out?' })).toBe(button);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('…once signing out has started, more taps do nothing (review 2)', async () => {
    let release = () => {};
    flush.mockImplementation(() => new Promise<void>((r) => (release = r)));
    render(<SignOutButton inline />);
    const button = screen.getByRole('button', { name: 'Sign out' });
    fireEvent.click(button);
    await pause();
    await act(async () => fireEvent.click(button));
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    for (let i = 0; i < 3; i++) {
      await pause();
      await act(async () => fireEvent.click(button));
    }
    expect(flush).toHaveBeenCalledTimes(1);
    await act(async () => release());
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('floating: a second tap while signing out does nothing either (review 2)', async () => {
    flush.mockImplementation(() => new Promise<void>(() => {}));
    render(<SignOutButton />);
    const button = screen.getByRole('button', { name: 'Sign out' });
    await act(async () => fireEvent.click(button));
    await act(async () => fireEvent.click(button));
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
