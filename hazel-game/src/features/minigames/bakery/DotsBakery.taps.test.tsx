import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';

// A double tap (PR 12 code and UX review round 1): a step's buttons wait a moment as it starts, so the second tap of a
// double doesn't press what came under the finger — Hand it to, the next order's cut, Cut it another way — and the
// reward's buttons wait for a tap's second too. The clock is stood in for (performance.now).
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('canvas-confetti', () => ({ default: Object.assign(vi.fn(), { reset: vi.fn() }) }));
vi.mock('../../../machines/gameFlow', async (orig) => ({
  ...(await orig<typeof import('../../../machines/gameFlow')>()),
  sendFlow: () => {},
}));
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  playMusic: () => {},
  sfx: () => {},
}));

const { default: MiniGameStage } = await import('../MiniGameStage');
const { SETTLE_MS } = await import('../useSettled');
const { useSaveStore } = await import('../../../store/saveStore');
const { useProfileStore } = await import('../../../store/profileStore');
const { defaultSave } = await import('../../../lib/save');

let now = 0;
beforeEach(() => {
  now = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  localStorage.clear();
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags: {} }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: new Date().getFullYear() - 14, birthMonth: 1, skillLevels: { math: 6 }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
    addXp: vi.fn(async () => {}),
    recordActivity: vi.fn(async () => {}),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const wait = () => act(() => void (now += SETTLE_MS));
const cut = (name: RegExp) => within(screen.getByRole('group', { name: 'Cuts' })).getByRole('button', { name });
/** A tap: a click with a click count, as a finger's is (a key's has none). */
const tap = (el: HTMLElement) => fireEvent.click(el, { detail: 1 });

/** Expert's first order (25% more than 1 pie), boxed right with quarters, each step waited for. */
async function boxFirst() {
  render(<MiniGameStage game="dots-bakery" />);
  fireEvent.click(screen.getByRole('button', { name: 'Let’s bake!' }));
  await screen.findByRole('heading', { name: 'Step 1 · Cut the pies' });
  wait();
  tap(cut(/^Quarters/));
  wait();
  for (let k = 0; k < 5; k++) tap(screen.getByRole('button', { name: 'Put a slice in' }));
  tap(screen.getByRole('button', { name: 'Close the box' }));
}

describe('🥧 a double tap', () => {
  it('a cut’s second tap doesn’t put a slice in the box that came under it; − / + aren’t held back', async () => {
    render(<MiniGameStage game="dots-bakery" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s bake!' }));
    await screen.findByRole('heading', { name: 'Step 1 · Cut the pies' });
    // As the morning starts, too.
    tap(cut(/^Quarters/));
    expect(screen.getByRole('heading', { name: 'Step 1 · Cut the pies' })).toBeInTheDocument();
    wait();
    tap(cut(/^Quarters/));
    const slices = screen.getByRole('group', { name: 'The pies on the board' }).querySelectorAll('g[style]');
    fireEvent.click(slices[0]);
    expect(screen.getByText('The box is empty.')).toBeInTheDocument();
    tap(screen.getByRole('button', { name: 'Put a slice in' }));
    tap(screen.getByRole('button', { name: 'Put a slice in' }));
    expect(screen.getByText(/^Two quarters/)).toBeInTheDocument();
  });

  it('Close’s second tap doesn’t hand the box over before its working is seen', async () => {
    await boxFirst();
    expect(screen.getByRole('heading', { name: 'Right' })).toBeInTheDocument();
    tap(screen.getByRole('button', { name: /^Hand it to/ }));
    expect(screen.getByRole('heading', { name: 'Right' })).toBeInTheDocument();
    wait();
    tap(screen.getByRole('button', { name: /^Hand it to/ }));
    expect(await screen.findByText('Order 2 of 3')).toBeInTheDocument();
  });

  it('a miss’s second tap doesn’t wipe it with “Cut it another way”', async () => {
    render(<MiniGameStage game="dots-bakery" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s bake!' }));
    await screen.findByRole('heading', { name: 'Step 1 · Cut the pies' });
    wait();
    tap(cut(/^Thirds/));
    wait();
    tap(screen.getByRole('button', { name: 'Put a slice in' }));
    tap(screen.getByRole('button', { name: 'Close the box' }));
    tap(screen.getByRole('button', { name: 'Cut it another way' }));
    expect(screen.getByRole('heading', { name: 'Too little' })).toBeInTheDocument();
    wait();
    tap(screen.getByRole('button', { name: 'Cut it another way' }));
    expect(screen.getByRole('heading', { name: 'Step 1 · Cut the pies' })).toBeInTheDocument();
  });

  it('the last Hand it to’s second tap doesn’t skip the reward; a key on it isn’t held back', async () => {
    await boxFirst();
    wait();
    tap(screen.getByRole('button', { name: /^Hand it to/ }));
    await screen.findByText('Order 2 of 3');
    wait();
    tap(cut(/^Sixths/));
    wait();
    for (let k = 0; k < 5; k++) tap(screen.getByRole('button', { name: 'Put a slice in' }));
    tap(screen.getByRole('button', { name: 'Close the box' }));
    wait();
    tap(screen.getByRole('button', { name: /^Hand it to/ }));
    await screen.findByText('Order 3 of 3');
    wait();
    tap(cut(/^Thirds/));
    wait();
    for (let k = 0; k < 2; k++) tap(screen.getByRole('button', { name: 'Put a slice in' }));
    tap(screen.getByRole('button', { name: 'Close the box' }));
    wait();
    tap(screen.getByRole('button', { name: /^Hand it to/ }));
    await screen.findByRole('heading', { name: 'Morning served!' });
    // The double's second, on the reward's button: nothing.
    tap(screen.getByRole('button', { name: 'Another morning' }));
    expect(screen.getByRole('heading', { name: 'Morning served!' })).toBeInTheDocument();
    // A key (no click count) at once: not held back.
    fireEvent.click(screen.getByRole('button', { name: 'Another morning' }), { detail: 0 });
    expect(screen.queryByRole('heading', { name: 'Morning served!' })).toBeNull();
  });
});
