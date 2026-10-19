import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { PinVerdict } from '../../lib/pinLock';

const { default: PinPad, PIN_TRIES, PIN_BREAK_MS } = await import('./PinPad');
const { forgetAllLocks, kidLockKey, rememberLock, PIN_CHECK_FAILED, PIN_READY_TEXT } = await import('../../lib/pinLock');
const { NETWORK_MESSAGE } = await import('../../lib/errors');

const dots = () => screen.getByRole('img').getAttribute('aria-label');
const key = (name: string) => screen.getByRole('button', { name });
async function type(pin: string) {
  for (const d of pin) await act(async () => fireEvent.click(key(d)));
}
const wrong = (triesLeft: number): PinVerdict => ({ ok: false, triesLeft, waitSeconds: 0, limited: true });
const lockedFor = (waitSeconds: number): PinVerdict => ({ ok: false, triesLeft: 0, waitSeconds, limited: true });

afterEach(() => {
  vi.useRealTimers();
  forgetAllLocks();
});

describe('PinPad (#124)', () => {
  it('fills a dot per digit, ⌫ takes one back, and the 4th digit sends the PIN', async () => {
    const onSubmit = vi.fn(async () => true);
    render(<PinPad onSubmit={onSubmit} />);
    await type('48');
    expect(dots()).toBe('2 of 4 digits');
    fireEvent.click(key('Delete'));
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

  it('with two or fewer tries left, says how many before a rest', async () => {
    const answers = [wrong(4), wrong(2), wrong(1)];
    render(<PinPad onSubmit={async () => answers.shift()!} wrongText="Nope!" />);
    await type('0000');
    expect(screen.getByRole('status')).toHaveTextContent(/^Nope!$/);
    await type('0000');
    expect(screen.getByRole('status')).toHaveTextContent('Nope! 2 more tries before a rest.');
    await type('0000');
    expect(screen.getByRole('status')).toHaveTextContent('Nope! 1 more try before a rest.');
  });

  it(`an older database (true / false): after ${PIN_TRIES} wrong in a row the pad rests, then works again`, async () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn(async () => false);
    render(<PinPad onSubmit={onSubmit} />);
    for (let i = 0; i < PIN_TRIES; i++) await type('0000');
    expect(screen.getByRole('status')).toHaveTextContent('Too many tries — ask a grown-up, or wait 30 seconds.');
    expect(key('1')).toHaveAttribute('aria-disabled', 'true');
    expect(key('1')).not.toBeDisabled();
    await type('1111');
    expect(onSubmit).toHaveBeenCalledTimes(PIN_TRIES);
    await act(async () => vi.advanceTimersByTime(PIN_BREAK_MS));
    expect(key('1')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByRole('status')).toHaveTextContent(PIN_READY_TEXT);
    await type('1111');
    expect(onSubmit).toHaveBeenCalledTimes(PIN_TRIES + 1);
  });
});

describe('PinPad: a PIN the database has locked (#124c)', () => {
  it('says so in plain words, counts down, takes no digits, then opens again', async () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn(async () => lockedFor(300));
    render(<PinPad onSubmit={onSubmit} />);
    const one = key('1');
    one.focus();
    await type('0000');
    expect(screen.getByRole('status')).toHaveTextContent('Too many tries — ask a grown-up, or wait 5 minutes.');
    expect(screen.getByTestId('pin-lock')).toHaveTextContent('Try again in 5:00');
    // Waiting with aria-disabled keeps the keyboard's place.
    expect(one).toHaveAttribute('aria-disabled', 'true');
    expect(one).toHaveFocus();

    await act(async () => vi.advanceTimersByTime(61_000));
    expect(screen.getByTestId('pin-lock')).toHaveTextContent('Try again in 3:59');
    // No input gets through: taps, ⌫ and keyboard digits alike.
    await type('4821');
    for (const k of ['4', '8', '2', '1']) await act(async () => fireEvent.keyDown(window, { key: k }));
    expect(dots()).toBe('0 of 4 digits');
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(239_000));
    expect(screen.queryByTestId('pin-lock')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(PIN_READY_TEXT);
    expect(one).toHaveAttribute('aria-disabled', 'false');
    onSubmit.mockResolvedValueOnce({ ok: true, triesLeft: 5, waitSeconds: 0, limited: true });
    await type('4821');
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("a grown-up's pad has its own words; the help line shows only while locked", async () => {
    vi.useFakeTimers();
    render(
      <PinPad
        onSubmit={async () => lockedFor(60)}
        lockedText={(w) => `Too many tries. Use your password instead, or wait ${w}.`}
        lockedHelp="A new PIN unlocks it."
      />,
    );
    expect(screen.queryByText('A new PIN unlocks it.')).toBeNull();
    await type('9999');
    expect(screen.getByRole('status')).toHaveTextContent('Too many tries. Use your password instead, or wait 1 minute.');
    expect(screen.getByText('A new PIN unlocks it.')).toBeInTheDocument();
  });

  it('remembers the lock for this PIN: opened again, it shows the wait at once', async () => {
    vi.useFakeTimers();
    const lockKey = kidLockKey('kid-sam');
    const onSubmit = vi.fn(async () => lockedFor(900));
    const first = render(<PinPad onSubmit={onSubmit} lockKey={lockKey} />);
    await type('0000');
    first.unmount();

    await act(async () => vi.advanceTimersByTime(30_000));
    render(<PinPad onSubmit={onSubmit} lockKey={lockKey} />);
    expect(screen.getByRole('status')).toHaveTextContent('wait 15 minutes');
    expect(screen.getByTestId('pin-lock')).toHaveTextContent('Try again in 14:30');
    await type('4821');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("another kid's lock doesn't lock this pad", () => {
    rememberLock(kidLockKey('kid-kit'), 300);
    render(<PinPad onSubmit={async () => true} lockKey={kidLockKey('kid-sam')} />);
    expect(screen.queryByTestId('pin-lock')).toBeNull();
    expect(key('1')).toHaveAttribute('aria-disabled', 'false');
  });

  it("a check that couldn't happen says why in plain words, isn't a wrong try, and logs the rest", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onSubmit = vi.fn(async (): Promise<PinVerdict> => Promise.reject(new Error('Failed to fetch')));
    render(<PinPad onSubmit={onSubmit} />);
    for (let i = 0; i < PIN_TRIES; i++) await type('0000');
    expect(screen.getByRole('status')).toHaveTextContent(NETWORK_MESSAGE);
    expect(key('1')).toHaveAttribute('aria-disabled', 'false');
    onSubmit.mockRejectedValueOnce({ message: 'permission denied for function try_kid_pin', code: '42501' });
    await type('0000');
    expect(screen.getByRole('status')).toHaveTextContent(PIN_CHECK_FAILED);
    expect(screen.queryByText(/permission denied|42501/)).toBeNull();
    expect(warn).toHaveBeenCalledWith('Checking a PIN failed:', 'permission denied for function try_kid_pin [42501]');
    warn.mockRestore();
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
    for (const k of ['9', '0', 'Backspace', '0', '9', '0']) await act(async () => fireEvent.keyDown(window, { key: k }));
    expect(onSubmit).toHaveBeenCalledWith('9090');
  });
});
