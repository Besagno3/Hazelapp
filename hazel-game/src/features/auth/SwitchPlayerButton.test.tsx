import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const { default: SwitchPlayerButton, SWITCH_ARM_MS, SWITCH_CONFIRM_GAP_MS } = await import('./SwitchPlayerButton');
const { useFamilyStore } = await import('../../store/familyStore');

/** A second tap, a beat after the first (not the tail of a double-tap). */
const pause = () => act(() => vi.advanceTimersByTime(SWITCH_CONFIRM_GAP_MS + 50));

describe('SwitchPlayerButton (#118, was Sign out)', () => {
  let switchPlayer: ReturnType<typeof vi.fn<() => Promise<void>>>;
  beforeEach(() => {
    vi.useFakeTimers();
    switchPlayer = vi.fn<() => Promise<void>>(async () => {});
    useFamilyStore.setState({ switchPlayer });
  });
  afterEach(() => vi.useRealTimers());

  it('floating (every screen but the world): one tap switches player', async () => {
    render(<SwitchPlayerButton />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Switch player' })));
    expect(switchPlayer).toHaveBeenCalledTimes(1);
  });

  it("in the world's top bar (#75 item 14b review): the first tap asks, the second switches", async () => {
    render(<SwitchPlayerButton inline />);
    const button = screen.getByRole('button', { name: 'Switch player' });
    expect(button).toHaveTextContent('Switch'); // short enough for the bar
    expect(button.className).not.toMatch(/(^|\s)fixed(\s|$)/);
    expect(button.className).toContain('min-h-11');
    fireEvent.click(button);
    expect(switchPlayer).not.toHaveBeenCalled();
    // Same button, same size — the question floats under it and is read out.
    expect(screen.getByRole('button', { name: 'Switch player?' })).toBe(button);
    expect(button).toHaveTextContent('Switch?');
    expect(screen.getByRole('status')).toHaveTextContent('Tap again to switch player');
    expect(button).toHaveAccessibleDescription('Tap again to switch player');
    await pause();
    await act(async () => fireEvent.click(button));
    expect(switchPlayer).toHaveBeenCalledTimes(1);
  });

  it('…goes back to "Switch" if the second tap never comes', () => {
    render(<SwitchPlayerButton inline />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch player' }));
    act(() => vi.advanceTimersByTime(SWITCH_ARM_MS + 10));
    expect(screen.getByRole('button', { name: 'Switch player' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(switchPlayer).not.toHaveBeenCalled();
  });

  it('…a double-tap only asks: its second half is too quick to count as yes (review 2)', async () => {
    render(<SwitchPlayerButton inline />);
    const button = screen.getByRole('button', { name: 'Switch player' });
    fireEvent.click(button);
    act(() => vi.advanceTimersByTime(SWITCH_CONFIRM_GAP_MS - 150));
    await act(async () => fireEvent.click(button));
    expect(switchPlayer).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Switch player?' })).toBeInTheDocument();
  });

  it('…any other tap or key, or leaving the button, takes the question back (review 2)', () => {
    render(
      <>
        <SwitchPlayerButton inline />
        <button>d-pad</button>
      </>,
    );
    const button = screen.getByRole('button', { name: 'Switch player' });
    fireEvent.click(button);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'd-pad' }));
    expect(screen.getByRole('button', { name: 'Switch player' })).toBe(button);

    fireEvent.click(button);
    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(screen.getByRole('button', { name: 'Switch player' })).toBe(button);

    fireEvent.click(button);
    fireEvent.blur(button);
    expect(screen.getByRole('button', { name: 'Switch player' })).toBe(button);

    // Walking with the arrow keys while the button still has focus takes it back too…
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Switch player' })).toBe(button);

    // …but Enter or Space on the button (to answer) doesn't.
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: ' ' });
    expect(screen.getByRole('button', { name: 'Switch player?' })).toBe(button);
    expect(switchPlayer).not.toHaveBeenCalled();
  });

  it('…once switching has started, more taps do nothing (review 2)', async () => {
    let release = () => {};
    switchPlayer.mockImplementation(() => new Promise<void>((r) => (release = r)));
    render(<SwitchPlayerButton inline />);
    const button = screen.getByRole('button', { name: 'Switch player' });
    fireEvent.click(button);
    await pause();
    await act(async () => fireEvent.click(button));
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    for (let i = 0; i < 3; i++) {
      await pause();
      await act(async () => fireEvent.click(button));
    }
    expect(switchPlayer).toHaveBeenCalledTimes(1);
    await act(async () => release());
  });

  it('floating: a second tap while switching does nothing either (review 2)', async () => {
    switchPlayer.mockImplementation(() => new Promise<void>(() => {}));
    render(<SwitchPlayerButton />);
    const button = screen.getByRole('button', { name: 'Switch player' });
    await act(async () => fireEvent.click(button));
    await act(async () => fireEvent.click(button));
    expect(switchPlayer).toHaveBeenCalledTimes(1);
  });
});
