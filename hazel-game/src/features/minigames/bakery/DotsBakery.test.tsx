import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// Reduced motion: no zoom, so a morning plays straight through.
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('canvas-confetti', () => ({ default: () => {} }));
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
const { useSaveStore } = await import('../../../store/saveStore');
const { useProfileStore } = await import('../../../store/profileStore');
const { defaultSave } = await import('../../../lib/save');
const { pageFlag, starFlag } = await import('../../../content/minigames');
const { MINIGAME_PAGE_XP } = await import('../../../content/items');

const addXp = vi.fn(async () => {});
const recordActivity = vi.fn(async () => {});

function setUp(level: number, flags: Record<string, boolean> = {}) {
  localStorage.clear();
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: new Date().getFullYear() - 9, birthMonth: 1, skillLevels: { math: level }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
    addXp,
    recordActivity,
  });
}

beforeEach(() => {
  addXp.mockClear();
  recordActivity.mockClear();
  setUp(2);
});

const save = () => useSaveStore.getState().save!;

async function open() {
  render(<MiniGameStage game="dots-bakery" />);
  fireEvent.click(screen.getByRole('button', { name: 'Let’s bake!' }));
  return screen.findByRole('heading', { name: 'Step 1 · Cut the pie' });
}

/** Cuts the pies, puts `slices` in the box and closes it. */
function boxUp(cut: string, slices: number) {
  fireEvent.click(within(screen.getByRole('group', { name: 'Cuts' })).getByRole('button', { name: new RegExp(`^${cut}`) }));
  for (let k = 0; k < slices; k++) fireEvent.click(screen.getByRole('button', { name: 'Put a slice in' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close the box' }));
}

describe('🥧 the title card', () => {
  it('names the game, Dot’s hello and the Regulars’ Book', () => {
    render(<MiniGameStage game="dots-bakery" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Dot’s Bakery' })).toBeInTheDocument();
    expect(screen.getByText(/the regulars are queueing/)).toBeInTheDocument();
    expect(screen.getByText('Regulars’ Book: 0 of 8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Let’s bake!' })).toHaveFocus();
  });
});

describe('🥧 Dot’s Bakery, a whole morning (docs/DESIGN-MINIGAMES.md §5.2)', () => {
  it('Gentle: a box that’s short is said back and fixed; any cut that makes it is right; three regulars, then the reward', async () => {
    const start = await open();
    // The first order, heard with the step.
    expect(start).toHaveFocus();
    expect(start).toHaveAccessibleDescription('Half a pie.');
    expect(screen.getByText(/Grandmother Wick wants half a pie/)).toBeInTheDocument();

    // One quarter is a little short: said back, not scolded, and fixable.
    boxUp('Quarters', 1);
    expect(screen.getByRole('heading', { name: 'Not quite enough' })).toHaveFocus();
    expect(screen.getByText('A little more — the order is half a pie.')).toBeInTheDocument();
    expect(save().flags[pageFlag('dots-bakery', 'wick')]).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Fix the box' }));
    expect(screen.getByText('One quarter of a pie.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Put a slice in' }));
    expect(screen.getByText('Two quarters — that’s half a pie.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close the box' }));
    expect(screen.getByRole('heading', { name: 'Just right!' })).toHaveFocus();
    expect(screen.getByText(/Two quarters is the same as half a pie\. Grandmother Wick’s page is in your book!/)).toBeInTheDocument();
    expect(save().flags[pageFlag('dots-bakery', 'wick')]).toBe(true);
    expect(addXp).toHaveBeenLastCalledWith(MINIGAME_PAGE_XP);

    // Keeper Sol wants a quarter: halves can't make it, and the step says so.
    fireEvent.click(screen.getByRole('button', { name: 'Hand it to Grandmother Wick' }));
    expect(await screen.findByRole('heading', { name: 'Step 1 · Cut the pie' })).toHaveFocus();
    expect(screen.getByText('Order 2 of 3')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'Cuts' })).getByRole('button', { name: /^Halves/ }));
    expect(screen.getAllByText('Halves can’t make a quarter of a pie exactly. Try another cut!').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cut it another way' }));
    boxUp('Quarters', 1);
    expect(screen.getByRole('heading', { name: 'Just right!' })).toBeInTheDocument();

    // Mayor Marigold: three quarters, the last of the morning.
    fireEvent.click(screen.getByRole('button', { name: 'Hand it to Keeper Sol' }));
    await screen.findByText('Order 3 of 3');
    boxUp('Quarters', 3);
    fireEvent.click(screen.getByRole('button', { name: 'Hand it to Mayor Marigold — the last one!' }));

    // The reward: the morning's lesson, star 1, the Sunseed Snack from Dot.
    expect(screen.getByRole('heading', { level: 1, name: 'Morning served!' })).toHaveFocus();
    expect(screen.getByText('Two quarters is the same as half a pie.')).toBeInTheDocument();
    expect(screen.getByText(/A Sunseed Snack from Baker Dot, in your bag/)).toBeInTheDocument();
    expect(screen.getByText('New Regulars’ Book pages: Grandmother Wick, Keeper Sol, Mayor Marigold.')).toBeInTheDocument();
    expect(save().flags[starFlag('dots-bakery', 1)]).toBe(true);
    expect(save().items.snack).toBe(defaultSave().items.snack + 1);
  });

  it('a slice tapped on the pie goes in the box, and out again', async () => {
    await open();
    fireEvent.click(within(screen.getByRole('group', { name: 'Cuts' })).getByRole('button', { name: /^Quarters/ }));
    const board = screen.getByRole('group', { name: 'The pies on the board' });
    const slices = board.querySelectorAll('g[style]');
    expect(slices).toHaveLength(4);
    fireEvent.click(slices[2]);
    expect(screen.getByText('One quarter of a pie.')).toBeInTheDocument();
    fireEvent.click(slices[2]);
    expect(screen.getByText('The box is empty.')).toBeInTheDocument();
    // An empty box can't be closed.
    const shut = screen.getByRole('button', { name: 'Put a slice in first' });
    expect(shut).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(shut);
    expect(screen.queryByRole('heading', { name: /Just right|Not quite|too much/ })).toBeNull();
  });

  it('Medium: thirds with sixths — four sixths is two thirds', async () => {
    setUp(5);
    await open();
    expect(screen.getByText(/Grandmother Wick wants two thirds of a pie/)).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Cuts' })).getAllByRole('button')).toHaveLength(5);
    boxUp('Sixths', 4);
    expect(screen.getByText(/Four sixths is the same as two thirds of a pie\./)).toBeInTheDocument();
  });

  it('Tricky: a percentage, and two people’s orders added in one box', async () => {
    setUp(9);
    await open();
    expect(screen.getByRole('heading', { name: 'Step 1 · Cut the pie' })).toHaveAccessibleDescription('75% of a pie.');
    boxUp('Quarters', 3);
    expect(screen.getByText(/75% of a pie is three quarters of a pie\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hand it to Grandmother Wick' }));
    await screen.findByText('Order 2 of 3');
    expect(screen.getByRole('heading', { name: 'Step 1 · Cut the pie' })).toHaveAccessibleDescription('Half a pie, and a quarter of a pie for Nib — both in one box.');
    boxUp('Quarters', 3);
    expect(screen.getByText(/Half a pie and a quarter of a pie make three quarters of a pie\./)).toBeInTheDocument();
  });

  it('a regular in the book is read out by Dot and under the book', async () => {
    setUp(2, { [pageFlag('dots-bakery', 'nib')]: true });
    await open();
    expect(screen.getByText('1 of 8 pages')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nib: cherry pie. Read the page' }));
    const book = within(screen.getByRole('region', { name: 'Regulars’ Book' }));
    expect(book.getByText(/turns his tongue red/)).toBeInTheDocument();
  });
});
