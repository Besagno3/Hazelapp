import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TypeBurst } from './TypeBurst';
import { BURST_MS, charKey } from '../../content/typing';

function type(word: string) {
  for (const ch of word) {
    const code = charKey(ch)!.key.code;
    fireEvent.keyDown(window, { code, key: ch });
    fireEvent.keyUp(window, { code, key: ch });
  }
}

afterEach(() => vi.useRealTimers());

describe('TypeBurst (#159 item 2)', () => {
  it('the word typed in time settles once with true, and says so', () => {
    const onResult = vi.fn();
    render(<TypeBurst word="ember" holdRule={false} onResult={onResult} />);
    expect(screen.getByLabelText('Type: ember')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveAccessibleName(/seconds left to type/);
    type('embe');
    expect(onResult).not.toHaveBeenCalled();
    type('r');
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith(true);
    expect(screen.getByRole('status')).toHaveTextContent(/Done!/);
    // More keys change nothing.
    type('ember');
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('the clock running out settles with false; a late key does nothing', () => {
    vi.useFakeTimers();
    const onResult = vi.fn();
    render(<TypeBurst word="bat" holdRule={false} onResult={onResult} />);
    act(() => {
      vi.advanceTimersByTime(BURST_MS + 200);
    });
    expect(onResult).toHaveBeenCalledWith(false);
    expect(screen.getByRole('status')).toHaveTextContent(/ink dried/);
    type('bat');
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('with the home-row hold on, a letter without the other hand is a nudge; wrong keys are misses', () => {
    const onEvent = vi.fn();
    render(<TypeBurst word="kira" holdRule onResult={() => {}} onEvent={onEvent} />);
    fireEvent.keyDown(window, { code: 'KeyK', key: 'k' });
    expect(screen.getByRole('status')).toHaveTextContent(/Hold F with your left pointer/);
    expect(onEvent).toHaveBeenLastCalledWith('hold', expect.objectContaining({ index: 0 }));
    fireEvent.keyDown(window, { code: 'KeyF', key: 'f' });
    fireEvent.keyDown(window, { code: 'KeyK', key: 'k' });
    expect(onEvent).toHaveBeenLastCalledWith('typed', expect.objectContaining({ index: 1 }));
  });
});
