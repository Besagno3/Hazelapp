import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';

// A double tap: a step's buttons wait a moment as it starts (`useSettled`), so the second tap of a double tap on "Next
// — up or down?" doesn't answer the question that comes under the finger. The clock is stood in for.
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  sfx: () => {},
}));
const playTone = vi.fn();
vi.mock('../../../lib/tones', () => ({ playTone: (...a: unknown[]) => playTone(...a), wakeTones: () => {} }));

const { default: EchosCall } = await import('./EchosCall');
const { SETTLE_MS } = await import('../useSettled');
const { useSaveStore } = await import('../../../store/saveStore');
const { useProfileStore } = await import('../../../store/profileStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES } = await import('../../../content/minigames');
const { echoFor, roundQueue } = await import('../../../lib/minigames/echo');
type Band = import('../../../content/minigames').PlayBand;

let now = 0;
beforeEach(() => {
  now = 10_000;
  playTone.mockClear();
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  useSaveStore.setState({ userId: null, save: defaultSave(), status: 'ready', remoteError: null });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const wait = (ms = SETTLE_MS) => act(() => void (now += ms));
/** A tap: a click with a click count, as a finger's is (a key's has none, and isn't held back — PR 15). */
const tap = (el: Element) => fireEvent.click(el, { detail: 1 });
/** A key's press: no click count. */
const key = (el: Element) => fireEvent.click(el, { detail: 0 });
const play = (band: Band = 'gentle') => render(<EchosCall def={MINIGAMES['echos-call']} band={band} round={0} onPage={() => true} onFinish={() => {}} />);
const chime = (n: string) => screen.getByRole('button', { name: new RegExp(`^${n},`) });
/** Lyra plays to the end. */
const toTheEnd = () =>
  act(() => {
    vi.advanceTimersByTime(10_000);
  });

describe('🎵 a double tap', () => {
  it('a second tap straight after “Next — up or down?” answers nothing; a moment later it does', () => {
    play();
    wait();
    tap(screen.getByRole('button', { name: '▶ Listen' }));
    toTheEnd();
    wait();
    tap(screen.getByRole('button', { name: 'Next — up or down?' }));
    expect(screen.getByRole('heading', { name: 'Step 2 · Up or down?' })).toBeInTheDocument();
    tap(screen.getByRole('button', { name: 'Higher' }));
    expect(screen.getByRole('heading', { name: 'Step 2 · Up or down?' })).toBeInTheDocument();
    wait();
    tap(screen.getByRole('button', { name: 'Higher' }));
    expect(screen.getByRole('heading', { name: 'Step 3 · Play it back' })).toBeInTheDocument();
  });

  it('Listen, as a tune starts (a double tap on Next tune), waits a moment', () => {
    play();
    tap(screen.getByRole('button', { name: '▶ Listen' }));
    toTheEnd();
    expect(playTone).not.toHaveBeenCalled();
    wait();
    tap(screen.getByRole('button', { name: '▶ Listen' }));
    toTheEnd();
    expect(playTone).toHaveBeenCalledTimes(2);
  });

  it('Next, the moment Lyra first finishes (a kid tapping Listen again and again), does nothing; Listen again plays at once; a moment later Next goes on', () => {
    play();
    wait();
    tap(screen.getByRole('button', { name: '▶ Listen' }));
    toTheEnd();
    tap(screen.getByRole('button', { name: 'Next — up or down?' }));
    expect(screen.getByRole('heading', { name: 'Step 1 · Listen' })).toBeInTheDocument();
    // Listen again, in the place it was tapped, plays her again — no wait for that (review round 2).
    playTone.mockClear();
    tap(screen.getByRole('button', { name: '↻ Listen again' }));
    toTheEnd();
    expect(playTone).toHaveBeenCalledTimes(2);
    wait();
    tap(screen.getByRole('button', { name: 'Next — up or down?' }));
    expect(screen.getByRole('heading', { name: 'Step 2 · Up or down?' })).toBeInTheDocument();
  });

  it('Next tune straight after the last note does nothing; a moment later it goes on — and right after a staff tune is first heard', () => {
    useProfileStore.setState({
      profile: { id: 'kid-1', birthYear: new Date().getFullYear() - 9, birthMonth: 1, skillLevels: { music: 9 }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
    });
    play('tricky');
    const read = echoFor('tricky', 0, 0, roundQueue('tricky', () => false, 0));
    wait();
    tap(screen.getByRole('button', { name: 'Lower' }));
    wait();
    for (const n of read.notes) tap(chime(n));
    tap(screen.getByRole('button', { name: 'Next tune' }));
    expect(screen.getByRole('heading', { name: 'Hot Cross Buns!' })).toBeInTheDocument();
    wait();
    // Heard for the first time, as written, at the end: Next tune isn't kept waiting by it (review round 2).
    tap(screen.getByRole('button', { name: '▶ Hear it again' }));
    toTheEnd();
    tap(screen.getByRole('button', { name: 'Next tune' }));
    expect(screen.getByRole('heading', { name: 'Step 1 · Listen' })).toBeInTheDocument();
  });

  it('Expert (PR 15): an interval tapped as the tune starts isn’t named; a moment later it is; a key isn’t held back', () => {
    const { unmount } = play('expert');
    const iv = () => screen.getByRole('button', { name: 'Major 3rd' });
    tap(iv());
    expect(screen.getByRole('heading', { name: 'Step 1 · The interval' })).toBeInTheDocument();
    wait();
    tap(iv());
    expect(screen.getByRole('heading', { name: 'Step 2 · Play it' })).toBeInTheDocument();
    unmount();
    play('expert');
    fireEvent.click(iv(), { detail: 0 });
    expect(screen.getByRole('heading', { name: 'Step 2 · Play it' })).toBeInTheDocument();
  });

  it('Expert: a double Enter’s second, on the chime focus moved to, plays nothing; another chime at once, or that one a moment later, does', () => {
    play('expert');
    const e = echoFor('expert', 0, 0, roundQueue('expert', () => false, 0)); // Hot Cross Buns: E D C E D
    const letter = (n: string) => screen.getByRole('button', { name: n });
    const card = () => document.getElementById('ec-play')?.textContent ?? '';
    key(screen.getByRole('button', { name: 'Major 3rd' }));
    expect(letter('C')).toHaveFocus();
    // UX and code review round 1: it rang C as the first note — a wrong chime, the seal gone.
    key(letter('C'));
    expect(card()).toMatch(/0 of 5 played\.$/);
    expect(screen.queryByText(/^That was C\./)).toBeNull();
    key(letter(e.notes[0]));
    expect(card()).toMatch(/1 of 5 played\.$/);
    wait();
    key(letter('C'));
    expect(screen.getAllByText(/^That was C\./).length).toBeGreaterThan(0);
  });

  it('Tricky: a double Enter’s second, on the staff note focus moved to, picks nothing; another note at once, or that one a moment later, does', () => {
    play('tricky');
    const queue = roundQueue('tricky', () => false, 0);
    const read = echoFor('tricky', 0, 0, queue);
    const note = (k: number) => screen.getByRole('button', { name: new RegExp(`^Note ${k}:`) });
    const said = () => screen.getAllByText(/./, { selector: 'p.min-h-\\[4\\.25rem\\]' })[0]?.textContent;
    // Keys aren't held back as a step starts: the shape, Next tune, Listen, Next.
    key(screen.getByRole('button', { name: 'Lower' }));
    for (const n of read.notes) tap(chime(n));
    key(screen.getByRole('button', { name: 'Next tune' }));
    key(screen.getByRole('button', { name: '▶ Listen' }));
    toTheEnd();
    key(screen.getByRole('button', { name: 'Next — which was wrong?' }));
    expect(screen.getByRole('heading', { name: 'Step 2 · Which note was wrong?' })).toBeInTheDocument();
    expect(note(1)).toHaveFocus();
    // Code and UX review round 1: it picked the first note — never the wrong one.
    key(note(1));
    expect(said()).toBe('Which one didn’t match the chimes?');
    key(note(2));
    expect(said()).toMatch(/^The second note was right/);
    wait();
    key(note(1));
    expect(said()).toMatch(/^The first note was right/);
  });
});
