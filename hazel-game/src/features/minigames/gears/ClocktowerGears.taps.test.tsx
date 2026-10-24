import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';

// A double tap (PR 13): a step's buttons wait a moment as it starts, so the second tap of a double doesn't press what
// came under the finger — Turn the crank's on Next machine or Change the gears, Next's on a peg of the next board. The
// clock is stood in for (performance.now).
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  sfx: () => {},
}));

const { default: ClocktowerGears } = await import('./ClocktowerGears');
const { SETTLE_MS } = await import('../useSettled');
const { useSaveStore } = await import('../../../store/saveStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES } = await import('../../../content/minigames');

let now = 0;
beforeEach(() => {
  now = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  useSaveStore.setState({ userId: null, save: defaultSave(), status: 'ready', remoteError: null });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const wait = () => act(() => void (now += SETTLE_MS));
/** A tap: a click with a click count, as a finger's is (a key's has none, and isn't held back). */
const tap = (el: Element) => fireEvent.click(el, { detail: 1 });
const peg = (name: RegExp) => screen.getByRole('button', { name });
const middle = [/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Middle row, peg 3:/, /^Middle row, peg 4:/];
const play = () => render(<ClocktowerGears def={MINIGAMES['clocktower-gears']} band="gentle" round={0} onPage={() => true} onFinish={() => {}} />);

describe('⚙️ a double tap', () => {
  it('a peg tapped as a round starts does nothing; then gears go on one after another at once', () => {
    play();
    tap(peg(middle[0]));
    expect(screen.getByText('No gears on the pegs yet.')).toBeInTheDocument();
    wait();
    for (const p of middle) tap(peg(p));
    expect(screen.getByText('Four gears on the pegs.')).toBeInTheDocument();
  });

  it('Turn the crank’s second tap doesn’t press Next machine before what happened is seen', () => {
    play();
    wait();
    for (const p of middle) tap(peg(p));
    tap(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    expect(screen.getByRole('heading', { name: 'It works!' })).toBeInTheDocument();
    tap(screen.getByRole('button', { name: 'Next machine' }));
    expect(screen.getByRole('heading', { name: 'It works!' })).toBeInTheDocument();
    wait();
    tap(screen.getByRole('button', { name: 'Next machine' }));
    expect(screen.getByText('Machine 2 of 3')).toBeInTheDocument();
    // Next's second, on a peg of the next board: nothing.
    tap(peg(/^Middle row, peg 1:/));
    expect(screen.getByText('No gears on the pegs yet.')).toBeInTheDocument();
  });

  it('nor Change the gears after a miss', () => {
    play();
    wait();
    tap(peg(middle[0]));
    tap(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    expect(screen.getByRole('heading', { name: 'Not joined yet' })).toBeInTheDocument();
    tap(screen.getByRole('button', { name: 'Change the gears' }));
    expect(screen.getByRole('heading', { name: 'Not joined yet' })).toBeInTheDocument();
    wait();
    tap(screen.getByRole('button', { name: 'Change the gears' }));
    expect(screen.queryByRole('heading', { name: 'Not joined yet' })).toBeNull();
  });

  it('after a miss, gears go on one after another at once — the peg that clears it starts no wait (code and UX review round 1: the next was swallowed)', () => {
    play();
    wait();
    tap(peg(middle[0]));
    tap(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    expect(screen.getByRole('heading', { name: 'Not joined yet' })).toBeInTheDocument();
    wait();
    tap(peg(middle[1]));
    tap(peg(middle[2]));
    tap(peg(middle[3]));
    expect(screen.getByText('Four gears on the pegs.')).toBeInTheDocument();
  });

  it('Expert: a crank gear waits as a round starts and after Change the gears (its second tap would pick one)', () => {
    render(<ClocktowerGears def={MINIGAMES['clocktower-gears']} band="expert" round={0} onPage={() => true} onFinish={() => {}} />);
    const size = (name: RegExp) => within(screen.getByRole('group', { name: 'The crank’s gear' })).getByRole('button', { name });
    tap(size(/^Small/));
    expect(size(/^Small/)).toHaveAttribute('aria-pressed', 'false');
    wait();
    for (const p of middle) tap(peg(p));
    tap(size(/^Small/));
    tap(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    // A miss (four in a row is the wrong way round).
    wait();
    tap(screen.getByRole('button', { name: 'Change the gears' }));
    tap(size(/^Middle/));
    expect(size(/^Middle/)).toHaveAttribute('aria-pressed', 'false');
    wait();
    tap(size(/^Middle/));
    expect(size(/^Middle/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('a key isn’t held back: a peg pressed from the keyboard as a round starts', () => {
    play();
    fireEvent.keyDown(peg(middle[0]), { key: 'Enter' });
    expect(screen.getByText('One gear on the pegs.')).toBeInTheDocument();
  });
});

