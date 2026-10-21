import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Kid } from '../../types';
import type { PinVerdict } from '../../lib/pinLock';

const { default: WhoIsPlaying, KID_UNLOCK_HELP, PROGRESS_RELOADED_NOTE } = await import('./WhoIsPlaying');
const { useFamilyStore } = await import('../../store/familyStore');
const { forgetAllLocks, KID_LOCKED_TEXT } = await import('../../lib/pinLock');

const sam: Kid = { id: 'kid-sam', name: 'Sam', icon: 'fox', hasPin: true, birthYear: 2017, birthMonth: 3 };
const kit: Kid = { id: 'kid-kit', name: 'Kit', icon: 'panda', hasPin: true, birthYear: 2019, birthMonth: 8 };
const choose = vi.fn();
const setGrownUpsOpen = vi.fn();
const verdict = (ok: boolean, triesLeft = 4, waitSeconds = 0): PinVerdict => ({ ok, triesLeft, waitSeconds, limited: true });
const checkKidPin = vi.fn(async (_id: string, pin: string) => verdict(pin === '4821'));
const pinLocks = vi.fn(async () => null as { kids: Record<string, number>; grownUp: number } | null);

async function type(pin: string) {
  for (const d of pin) await act(async () => fireEvent.click(screen.getByRole('button', { name: d })));
}

beforeEach(() => {
  vi.clearAllMocks();
  useFamilyStore.setState({ kids: [sam, kit], choose, setGrownUpsOpen, checkKidPin, pinLocks });
});

afterEach(() => {
  vi.useRealTimers();
  forgetAllLocks();
});

describe('WhoIsPlaying (#124)', () => {
  it('shows a tile for each kid, with their picture and nickname', () => {
    render(<WhoIsPlaying />);
    expect(screen.getByRole('button', { name: 'Sam' })).toHaveTextContent('🦊');
    expect(screen.getByRole('button', { name: 'Kit' })).toHaveTextContent('🐼');
  });

  it("a kid types their PIN to get in; a wrong one says try again and doesn't", async () => {
    render(<WhoIsPlaying />);
    fireEvent.click(screen.getByRole('button', { name: 'Sam' }));
    expect(screen.getByText('Hi, Sam!')).toBeInTheDocument();
    await type('1234');
    expect(checkKidPin).toHaveBeenLastCalledWith('kid-sam', '1234');
    expect(choose).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/Not quite/);
    await type('4821');
    expect(choose).toHaveBeenCalledWith('kid-sam');
  });

  it('a locked PIN (#124c): the kind line, a countdown in words, a hint for grown-ups — and only for that kid', async () => {
    vi.useFakeTimers();
    checkKidPin.mockResolvedValueOnce(verdict(false, 0, 300));
    render(<WhoIsPlaying />);
    fireEvent.click(screen.getByRole('button', { name: 'Sam' }));
    expect(screen.getByText('Type your PIN.')).toBeInTheDocument();
    await type('1111');
    expect(screen.getByRole('status')).toHaveTextContent(KID_LOCKED_TEXT);
    expect(screen.getByTestId('pin-lock')).toHaveTextContent('Try again in 5 minutes');
    // The subtitle doesn't say "Type your PIN." while no PIN can be typed.
    expect(screen.getByText('Taking a short break.')).toBeInTheDocument();
    expect(screen.queryByText('Type your PIN.')).toBeNull();
    // The help says where, and that the same PIN is fine — it isn't a "new PIN" chore.
    expect(screen.getByText(KID_UNLOCK_HELP)).toBeInTheDocument();
    expect(KID_UNLOCK_HELP).toMatch(/tap Change by their name and type their PIN again — the same one is fine/);
    await type('4821');
    expect(checkKidPin).toHaveBeenCalledTimes(1);
    expect(choose).not.toHaveBeenCalled();

    // Back to the tiles and in again: Sam's pad remembers (once the database
    // has been asked — this one can't say); Kit's is open.
    fireEvent.click(screen.getByRole('button', { name: /not me/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sam' }));
    await act(async () => {});
    expect(screen.getByTestId('pin-lock')).toHaveTextContent(/Try again in 5 minutes/);
    fireEvent.click(screen.getByRole('button', { name: /not me/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Kit' }));
    expect(screen.queryByTestId('pin-lock')).toBeNull();
    expect(screen.getByText('Type your PIN.')).toBeInTheDocument();
  });

  it("a grown-up who unlocked Sam on their phone: Sam's pad asks the database and opens (#124c review)", async () => {
    checkKidPin.mockResolvedValueOnce(verdict(false, 0, 900));
    render(<WhoIsPlaying />);
    fireEvent.click(screen.getByRole('button', { name: 'Sam' }));
    pinLocks.mockResolvedValue({ kids: { 'kid-sam': 900 }, grownUp: 0 });
    await type('1111');
    await act(async () => {});
    expect(screen.getByTestId('pin-lock')).toBeInTheDocument();
    // Meanwhile Sam's PIN is typed again in 👪 Grown-ups on another device.
    pinLocks.mockResolvedValue({ kids: {}, grownUp: 0 });
    fireEvent.click(screen.getByRole('button', { name: /not me/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sam' }));
    // Reopened, the old lock isn't shown or read out while the database is asked (#124c review round 2).
    expect(screen.queryByTestId('pin-lock')).toBeNull();
    expect(screen.getByRole('status')).not.toHaveTextContent(KID_LOCKED_TEXT);
    expect(screen.queryByText('Taking a short break.')).toBeNull();
    await act(async () => {});
    expect(screen.queryByTestId('pin-lock')).toBeNull();
    expect(screen.getByText('Type your PIN.')).toBeInTheDocument();
    await type('4821');
    expect(choose).toHaveBeenCalledWith('kid-sam');
  });

  it("the pad opens with its title focused, and a check that answers after \"That's not me\" lets nobody in", async () => {
    let answer: (v: PinVerdict) => void = () => {};
    checkKidPin.mockReturnValueOnce(new Promise((r) => (answer = r)));
    render(<WhoIsPlaying />);
    fireEvent.click(screen.getByRole('button', { name: 'Sam' }));
    expect(screen.getByRole('heading', { name: 'Hi, Sam!' })).toHaveFocus();
    await type('4821');
    fireEvent.click(screen.getByRole('button', { name: /not me/ }));
    await act(async () => answer(verdict(true)));
    expect(choose).not.toHaveBeenCalled();
    expect(screen.getByText("Who's playing?")).toBeInTheDocument();
  });

  it("\"That's not me\" goes back to the tiles", () => {
    render(<WhoIsPlaying />);
    fireEvent.click(screen.getByRole('button', { name: 'Kit' }));
    fireEvent.click(screen.getByRole('button', { name: /not me/ }));
    expect(screen.getByText("Who's playing?")).toBeInTheDocument();
    expect(choose).not.toHaveBeenCalled();
  });

  it('after 📈 Progress reloaded the game for a new version: what happened and the way back, focused, once (#29 review round 2)', () => {
    sessionStorage.setItem('hazel-reloaded-for', 'progress');
    const { unmount } = render(<WhoIsPlaying />);
    const note = screen.getByText(PROGRESS_RELOADED_NOTE);
    expect(note.textContent).toBe('🔄 We reloaded Hazel Quest to fetch its newest version for 📈 Progress. Open 👪 Grown-ups again to see it.');
    expect(note).toHaveFocus();
    expect(sessionStorage.getItem('hazel-reloaded-for')).toBeNull();
    unmount();
    // Said once: the next visit is quiet.
    render(<WhoIsPlaying />);
    expect(screen.queryByText(PROGRESS_RELOADED_NOTE)).toBeNull();
  });

  it('👪 Grown-ups opens the grown-ups area', () => {
    render(<WhoIsPlaying />);
    fireEvent.click(screen.getByRole('button', { name: /Grown-ups/ }));
    expect(setGrownUpsOpen).toHaveBeenCalledWith(true);
  });
});
