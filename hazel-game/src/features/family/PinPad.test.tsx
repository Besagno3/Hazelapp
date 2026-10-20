import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { PinVerdict } from '../../lib/pinLock';

// "Sign in again" signs out through the Supabase client.
const auth = vi.hoisted(() => ({ signOut: vi.fn(async () => ({ error: null })) }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));

const { default: PinPad, PIN_TRIES, PIN_BREAK_MS, LOCK_RECHECK_MS } = await import('./PinPad');
const { forgetAllLocks, kidLockKey, lockLeft, rememberLock, PIN_CHECK_FAILED, PIN_READY_TEXT, KID_SIGNED_OUT } = await import('../../lib/pinLock');
const { SIGNED_OUT_MESSAGE } = await import('../../lib/errors');

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

  it('with two or fewer tries left, says how many before a break — in place of the "forgot it?" line, so it stays short', async () => {
    const answers = [wrong(4), wrong(2), wrong(1)];
    render(<PinPad onSubmit={async () => answers.shift()!} wrongText="Nope!" forgotText="Forgot it? Ask." />);
    await type('0000');
    expect(screen.getByRole('status')).toHaveTextContent(/^Nope! Forgot it\? Ask\.$/);
    await type('0000');
    expect(screen.getByRole('status')).toHaveTextContent(/^Nope! 2 more tries, then a short break\.$/);
    await type('0000');
    expect(screen.getByRole('status')).toHaveTextContent(/^Nope! 1 more try, then a short break\.$/);
  });

  it(`an older database (true / false): after ${PIN_TRIES} wrong in a row the pad rests, then works again`, async () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn(async () => false);
    render(<PinPad onSubmit={onSubmit} />);
    for (let i = 0; i < PIN_TRIES; i++) await type('0000');
    expect(screen.getByRole('status')).toHaveTextContent("That's a lot of tries! Take a break for 30 seconds, or ask a grown-up.");
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
  it('says so in plain words, counts down in words, takes no digits, then opens again', async () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn(async () => lockedFor(300));
    render(<PinPad onSubmit={onSubmit} />);
    const one = key('1');
    one.focus();
    await type('0000');
    expect(screen.getByRole('status')).toHaveTextContent("That's a lot of tries! Take a break for 5 minutes, or ask a grown-up.");
    expect(screen.getByTestId('pin-lock')).toHaveTextContent('Try again in 5 minutes');
    // Waiting with aria-disabled keeps the keyboard's place.
    expect(one).toHaveAttribute('aria-disabled', 'true');
    expect(one).toHaveFocus();

    await act(async () => vi.advanceTimersByTime(61_000));
    expect(screen.getByTestId('pin-lock')).toHaveTextContent('Try again in 4 minutes');
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
    expect(screen.getByRole('status')).toHaveTextContent('Take a break for 15 minutes');
    expect(screen.getByTestId('pin-lock')).toHaveTextContent('Try again in 15 minutes');
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
    // A kid can't fix the internet: they're asked to fetch a grown-up.
    expect(screen.getByRole('status')).toHaveTextContent("We couldn't reach Hazel Quest. Ask a grown-up to check the internet, then try again.");
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

/** Captures the pad's live region as it first appears — before any effect has run. */
function FirstPaint({ children, seen }: { children: ReactNode; seen: (text: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    seen(box.current?.querySelector('[role="status"]')?.textContent ?? '');
  }, [seen]);
  return <div ref={box}>{children}</div>;
}

describe('PinPad: the database decides when a lock ends (#124c review)', () => {
  it('a lock lifted elsewhere (a new PIN set on another device) opens a reopened pad at once', async () => {
    const lockKey = kidLockKey('kid-sam');
    rememberLock(lockKey, 900);
    const checkLock = vi.fn(async () => 0);
    render(<PinPad onSubmit={async () => true} lockKey={lockKey} checkLock={checkLock} />);
    await act(async () => {});
    expect(checkLock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('pin-lock')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(PIN_READY_TEXT);
    expect(key('1')).toHaveAttribute('aria-disabled', 'false');
    expect(lockLeft(lockKey)).toBe(0);
  });

  it('while locked it asks again every so often and when the tab comes back — and opens the moment the database says so', async () => {
    vi.useFakeTimers();
    const answers = [600, 590, 0];
    const checkLock = vi.fn(async () => answers.shift() ?? 0);
    const onSubmit = vi.fn(async () => lockedFor(900));
    render(<PinPad onSubmit={onSubmit} lockKey={kidLockKey('kid-sam')} checkLock={checkLock} />);
    await type('0000');
    await act(async () => {});
    expect(checkLock).toHaveBeenCalledTimes(1);
    // The database's own count wins over the one the pad started with.
    expect(screen.getByTestId('pin-lock')).toHaveTextContent('Try again in 10 minutes');
    await act(async () => vi.advanceTimersByTime(LOCK_RECHECK_MS));
    expect(checkLock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('pin-lock')).toBeInTheDocument();
    // Back in view: asked at once, not on the next tick.
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(checkLock).toHaveBeenCalledTimes(3);
    expect(screen.queryByTestId('pin-lock')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(PIN_READY_TEXT);
    // Open: no more asking.
    await act(async () => vi.advanceTimersByTime(LOCK_RECHECK_MS * 2));
    expect(checkLock).toHaveBeenCalledTimes(3);
  });

  it("when the database can't say, the pad keeps its countdown", async () => {
    vi.useFakeTimers();
    const checkLock = vi.fn(async () => null);
    render(<PinPad onSubmit={async () => lockedFor(300)} checkLock={checkLock} />);
    await type('0000');
    await act(async () => vi.advanceTimersByTime(LOCK_RECHECK_MS));
    expect(checkLock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('pin-lock')).toHaveTextContent('Try again in 5 minutes');
  });

  it("the pad's own brake (an older database) isn't the database's to lift: nothing is asked", async () => {
    vi.useFakeTimers();
    const checkLock = vi.fn(async () => 0);
    render(<PinPad onSubmit={async () => false} checkLock={checkLock} />);
    for (let i = 0; i < PIN_TRIES; i++) await type('0000');
    await act(async () => vi.advanceTimersByTime(LOCK_RECHECK_MS));
    expect(checkLock).not.toHaveBeenCalled();
    expect(screen.getByTestId('pin-lock')).toBeInTheDocument();
  });

  it('a pad opened on a lock it remembered says so after it opens, so a screen reader hears it', async () => {
    rememberLock(kidLockKey('kid-sam'), 300);
    const seen = vi.fn();
    render(
      <FirstPaint seen={seen}>
        <PinPad onSubmit={async () => true} lockKey={kidLockKey('kid-sam')} />
      </FirstPaint>,
    );
    // Empty as it appears (a live region doesn't read what it starts with)…
    expect(seen).toHaveBeenCalledWith('');
    // …then the words arrive, and are read out.
    expect(screen.getByRole('status')).toHaveTextContent("That's a lot of tries! Take a break for 5 minutes, or ask a grown-up.");
  });

  it('tells the screen around it when it locks and opens', async () => {
    vi.useFakeTimers();
    const onLockedChange = vi.fn();
    render(<PinPad onSubmit={async () => lockedFor(60)} onLockedChange={onLockedChange} />);
    expect(onLockedChange).toHaveBeenLastCalledWith(false);
    await type('0000');
    expect(onLockedChange).toHaveBeenLastCalledWith(true);
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(onLockedChange).toHaveBeenLastCalledWith(false);
  });

  it('a run-out sign-in offers "Sign in again" — a kid is told to fetch a grown-up — and it signs out here', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dead = { message: 'JWT expired', code: 'PGRST301' };
    const { unmount } = render(<PinPad onSubmit={() => Promise.reject(dead)} />);
    await type('1234');
    expect(screen.getByRole('status')).toHaveTextContent(KID_SIGNED_OUT);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    await act(async () => {});
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    unmount();
    // A grown-up's pad says it plainly, with the same button.
    const grownUp = render(<PinPad who="grown-up" onSubmit={() => Promise.reject(dead)} />);
    await type('1234');
    expect(screen.getByRole('status')).toHaveTextContent(SIGNED_OUT_MESSAGE);
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeInTheDocument();
    grownUp.unmount();
    // Any other failure doesn't offer it.
    render(<PinPad onSubmit={() => Promise.reject(new Error('Failed to fetch'))} />);
    await type('1234');
    expect(screen.queryByRole('button', { name: 'Sign in again' })).toBeNull();
    warn.mockRestore();
  });
});

