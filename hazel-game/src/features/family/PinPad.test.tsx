import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const { default: PinPad, PIN_TRIES, PIN_BREAK_MS } = await import('./PinPad');

const dots = () => screen.getByRole('img').getAttribute('aria-label');
async function type(pin: string) {
  for (const d of pin) await act(async () => fireEvent.click(screen.getByRole('button', { name: d })));
}

afterEach(() => vi.useRealTimers());

describe('PinPad (#118)', () => {
  it('fills a dot per digit, ⌫ takes one back, and the 4th digit sends the PIN', async () => {
    const onSubmit = vi.fn(async () => true);
    render(<PinPad onSubmit={onSubmit} />);
    await type('48');
    expect(dots()).toBe('2 of 4 digits');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(dots()).toBe('1 of 4 digits');
    await type('821');
    expect(onSubmit).toHaveBeenCalledWith('4821');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('a wrong PIN clears the dots and says try again', async () => {
    render(<PinPad onSubmit={async () => false} wrongText="Nope!" />);
    await type('1234');
    expect(screen.getByRole('status')).toHaveTextContent('Nope!');
    expect(dots()).toBe('0 of 4 digits');
  });

  it(`after ${PIN_TRIES} wrong in a row the pad takes a break, then works again`, async () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn(async () => false);
    render(<PinPad onSubmit={onSubmit} />);
    for (let i = 0; i < PIN_TRIES; i++) await type('0000');
    expect(screen.getByRole('status')).toHaveTextContent(/take a little break/);
    expect(screen.getByRole('button', { name: '1' })).toBeDisabled();
    await type('1111');
    expect(onSubmit).toHaveBeenCalledTimes(PIN_TRIES);
    await act(async () => vi.advanceTimersByTime(PIN_BREAK_MS));
    expect(screen.getByRole('button', { name: '1' })).toBeEnabled();
    await type('1111');
    expect(onSubmit).toHaveBeenCalledTimes(PIN_TRIES + 1);
  });

  it("a check that couldn't happen (offline) shows why and isn't a wrong try", async () => {
    const onSubmit = vi.fn(async () => Promise.reject(new Error('Failed to fetch')));
    render(<PinPad onSubmit={onSubmit} />);
    for (let i = 0; i < PIN_TRIES; i++) await type('0000');
    expect(screen.getByRole('status')).toHaveTextContent('Failed to fetch');
    expect(screen.getByRole('button', { name: '1' })).toBeEnabled();
  });

  it('digits typed on a keyboard work, but not while typing in a field', async () => {
    const onSubmit = vi.fn(async () => true);
    render(
      <>
        <PinPad onSubmit={onSubmit} />
        <input aria-label="elsewhere" />
      </>,
    );
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'elsewhere' }), { key: '7' });
    expect(dots()).toBe('0 of 4 digits');
    for (const key of ['9', '0', 'Backspace', '0', '9', '0']) await act(async () => fireEvent.keyDown(window, { key }));
    expect(onSubmit).toHaveBeenCalledWith('9090');
  });
});
