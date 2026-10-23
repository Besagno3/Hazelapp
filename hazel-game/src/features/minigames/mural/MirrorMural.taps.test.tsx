import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';

// A double tap (review round 2): a step's buttons wait a moment as it starts, so a second tap on whatever came under
// the finger does nothing. The clock is stood in for (performance.now).
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  sfx: () => {},
}));

const { default: MirrorMural } = await import('./MirrorMural');
const { SETTLE_MS } = await import('../useSettled');
const { useSaveStore } = await import('../../../store/saveStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES, pageFlag } = await import('../../../content/minigames');
const { jobFor, roundQueue, tie, toPaint } = await import('../../../lib/minigames/mural');

let now = 0;
beforeEach(() => {
  now = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  useSaveStore.setState({ userId: null, save: defaultSave(), status: 'ready', remoteError: null });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const wait = (ms = SETTLE_MS) => act(() => void (now += ms));
/** A tap: a click with a click count, as a finger's is (a key's has none, and isn't held back). */
const tap = (el: Element) => fireEvent.click(el, { detail: 1 });
const pots = () => within(screen.getByRole('group', { name: 'Paint pots' }));
const mirror = () => tap(screen.getByRole('button', { name: '🪞 Hold up the mirror' }));
const marked = () => screen.queryAllByRole('button', { name: /Doesn’t match yet\.$/ });

describe('🪞 a double tap', () => {
  it('the mirror arriving under the finger after Mix them isn’t held up; a moment later it is', () => {
    useSaveStore.setState({ save: { ...defaultSave(), flags: { [pageFlag('mirror-mural', 'castle')]: true } } });
    const onPage = vi.fn(() => true);
    render(<MirrorMural def={MINIGAMES['mirror-mural']} band="gentle" round={0} onPage={onPage} onFinish={() => {}} />);
    const job = jobFor('gentle', 0, 0, roundQueue(() => false, 0));
    wait();
    tap(pots().getByRole('button', { name: 'Red' }));
    tap(pots().getByRole('button', { name: 'Blue' }));
    tap(screen.getByRole('button', { name: 'Mix them' }));
    const [r, c] = toPaint(job.kind).find(([rr, cc]) => job.goal[rr][cc] === 'purple')!;
    fireEvent.click(document.querySelector(`[data-cell="${r},${c}"]`)!); // painting isn't held up
    mirror(); // the double tap's second
    expect(marked()).toHaveLength(0);
    expect(screen.queryByText(/^Nearly, darling!/)).toBeNull();
    wait();
    mirror();
    expect(marked().length).toBeGreaterThan(0);

    // Fixed and held up: "Next picture" arrives under the finger — a second tap straight away keeps "A perfect match!".
    for (const [rr, cc] of toPaint(job.kind)) {
      const v = job.goal[rr][cc];
      if (!v) continue;
      fireEvent.click(within(screen.getByRole('group', { name: 'Paints' })).getByRole('button', { name: v === 'red' ? 'Red' : 'Purple' }));
      fireEvent.click(document.querySelector(`[data-cell="${rr},${cc}"]`)!);
    }
    wait();
    mirror();
    expect(screen.getByRole('heading', { name: 'A perfect match!' })).toBeInTheDocument();
    tap(screen.getByRole('button', { name: 'Next picture' }));
    expect(screen.getByRole('heading', { name: 'A perfect match!' })).toBeInTheDocument();
    // A Gallery page under the finger isn't read either.
    tap(screen.getByRole('button', { name: 'Castle. Read the page' }));
    expect(screen.getByRole('button', { name: 'Castle. Read the page' })).toHaveAttribute('aria-pressed', 'false');
    wait();
    tap(screen.getByRole('button', { name: 'Next picture' }));
    expect(screen.getByText('Picture 2 of 3')).toBeInTheDocument();
  });

  it('Expert (PR 14): a move tapped as the picture starts isn’t picked; That’s the move’s second tap doesn’t check the image; a key isn’t held back', () => {
    render(<MirrorMural def={MINIGAMES['mirror-mural']} band="expert" round={0} onPage={() => true} onFinish={() => {}} />);
    const move = () => within(screen.getByRole('group', { name: 'Moves' })).getByRole('button', { name: tie('Reflect in x = 3') });
    tap(move());
    expect(move()).toHaveAttribute('aria-pressed', 'false');
    wait();
    tap(move());
    tap(screen.getByRole('button', { name: 'That’s the move' }));
    expect(screen.getByRole('heading', { name: 'Step 2 · Paint the image' })).toBeInTheDocument();
    const check = () => screen.getByRole('button', { name: '🪞 Check the image' });
    tap(check());
    expect(screen.queryByText(/^Paint the image first/)).toBeNull();
    wait();
    tap(check());
    expect(screen.getByText('Paint the image first — the right half — then check it.')).toBeInTheDocument();
  });

  it('a key isn’t held back (PR 14, as the other games): pots and Mix them from the keyboard as the picture starts', () => {
    render(<MirrorMural def={MINIGAMES['mirror-mural']} band="gentle" round={0} onPage={() => true} onFinish={() => {}} />);
    for (const name of ['Red', 'Blue']) fireEvent.click(pots().getByRole('button', { name }), { detail: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Mix them' }), { detail: 0 });
    expect(screen.getByRole('heading', { name: 'Step 2 · Paint the other half' })).toBeInTheDocument();
  });

  it('Expert: from the keyboard, a move and That’s the move at once', () => {
    render(<MirrorMural def={MINIGAMES['mirror-mural']} band="expert" round={0} onPage={() => true} onFinish={() => {}} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Moves' })).getByRole('button', { name: tie('Reflect in x = 3') }), { detail: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'That’s the move' }), { detail: 0 });
    expect(screen.getByRole('heading', { name: 'Step 2 · Paint the image' })).toBeInTheDocument();
  });
});
