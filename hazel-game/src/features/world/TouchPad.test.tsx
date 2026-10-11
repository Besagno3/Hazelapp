import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import TouchPad from './TouchPad';

describe('the touch pad’s ✋ button (#127)', () => {
  it('says what it would do, and is a dim "Use" with nothing to use', () => {
    const { rerender } = render(<TouchPad onDirChange={() => {}} onAction={() => {}} action={null} />);
    const idle = screen.getByRole('button', { name: 'Use (nothing here yet)' });
    expect(idle).toHaveTextContent('Use');
    expect(idle.className).toContain('text-white/60');
    rerender(<TouchPad onDirChange={() => {}} onAction={() => {}} action="Open chest" />);
    const ready = screen.getByRole('button', { name: 'Open chest' });
    expect(ready).toHaveTextContent('Open chest');
    expect(ready.className).toContain('bg-amber-300');
  });

  it('a tap uses once — on the press, not again on its click — and a keyboard or screen-reader click works it too', () => {
    const onAction = vi.fn();
    render(<TouchPad onDirChange={() => {}} onAction={onAction} action="Talk" />);
    const btn = screen.getByRole('button', { name: 'Talk' });
    fireEvent.pointerDown(btn);
    fireEvent.click(btn, { detail: 1 }); // the tap's own click
    expect(onAction).toHaveBeenCalledTimes(1);
    fireEvent.click(btn, { detail: 0 }); // Enter / Space on the focused button
    expect(onAction).toHaveBeenCalledTimes(2);
    fireEvent.click(btn, { detail: 1 }); // a screen reader's double-tap: a click with no press
    expect(onAction).toHaveBeenCalledTimes(3);
  });

  it('the d-pad still steers, and there is no ✋ where nobody listens for it', () => {
    const onDirChange = vi.fn();
    render(<TouchPad onDirChange={onDirChange} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'up' }));
    expect(onDirChange).toHaveBeenLastCalledWith(0, -1);
    fireEvent.pointerUp(screen.getByRole('button', { name: 'up' }));
    expect(onDirChange).toHaveBeenLastCalledWith(0, 0);
    expect(screen.queryByRole('button', { name: /Use/ })).toBeNull();
  });
});
