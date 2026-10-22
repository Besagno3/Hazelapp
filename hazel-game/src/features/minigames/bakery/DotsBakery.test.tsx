import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// Reduced motion: no zoom, so a morning plays straight through.
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
const { useSaveStore } = await import('../../../store/saveStore');
const { useProfileStore } = await import('../../../store/profileStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES, pageFlag, starFlag } = await import('../../../content/minigames');
const { default: DotsBakery } = await import('./DotsBakery');
const { MINIGAME_PAGE_XP } = await import('../../../content/items');
const { noteRoundPlayed } = await import('../../../lib/minigames');

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

/** The order's ticket (the box around its words). */
const ticket = () => document.getElementById('bk-order')!.parentElement!.parentElement!;
/** How many of a pie picture's slices are drawn full (the rest are pale). */
const solidSlices = (svg: Element) => Array.from(svg.querySelectorAll('path[stroke="#1b0f22"]')).length;
/** Which slices on the board are in the box (gold outline). */
const lifted = () => Array.from(screen.getByRole('group', { name: 'The pies on the board' }).querySelectorAll('g[style] > path:first-child')).map((p) => p.getAttribute('stroke') === '#f59e0b');

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
    // The first order, heard with the step and who it's for. The game loads lazily: focus lands as it mounts (review round 2: a flake).
    await waitFor(() => expect(start).toHaveFocus());
    expect(start).toHaveAccessibleDescription('For Grandmother Wick: Half a pie.');
    expect(screen.getByText(/Grandmother Wick wants half a pie/)).toBeInTheDocument();

    // One quarter is a little short: said back, not scolded, and fixable.
    boxUp('Quarters', 1);
    // Heard with what's in the box and what it means (review round 1).
    expect(screen.getByRole('heading', { name: 'Not quite enough' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Not quite enough' })).toHaveAccessibleDescription('One quarter of a pie. A little more — the order is half a pie.');
    expect(screen.getByText('A little more — the order is half a pie.')).toBeInTheDocument();
    expect(save().flags[pageFlag('dots-bakery', 'wick')]).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Fix the box' }));
    expect(screen.getByText('One quarter of a pie.', { selector: '[role=status]' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Step 2 · Fill the box' })).toHaveAccessibleDescription('For Grandmother Wick: Half a pie.');
    expect(screen.getByText(/^The pie is cut into 4 quarters\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Put a slice in' }));
    expect(screen.getByText('Two quarters — that’s half a pie.', { selector: '[role=status]' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close the box' }));
    expect(screen.getByRole('heading', { name: 'Just right!' })).toHaveFocus();
    expect(screen.getByText(/Two quarters is the same as half a pie\. Grandmother Wick’s page is in your book!/)).toBeInTheDocument();
    // Dot's line after a right box, in turn (the next is different).
    expect(screen.getByText(/^Perfect — fair and square!/)).toBeInTheDocument();
    expect(save().flags[pageFlag('dots-bakery', 'wick')]).toBe(true);
    expect(addXp).toHaveBeenLastCalledWith(MINIGAME_PAGE_XP);

    // Keeper Sol wants a quarter: halves can't make it, and the step says so.
    fireEvent.click(screen.getByRole('button', { name: 'Hand it to Grandmother Wick' }));
    expect(await screen.findByRole('heading', { name: 'Step 1 · Cut the pie' })).toHaveFocus();
    expect(screen.getByText('Order 2 of 3')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'Cuts' })).getByRole('button', { name: /^Halves/ }));
    expect(screen.getAllByText('Halves can’t make a quarter of a pie exactly. Try another cut!').length).toBeGreaterThan(0);
    // The way on is the one gold button, right under why (review round 1).
    expect(screen.getAllByRole('button', { name: 'Cut it another way' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cut it another way' }));
    boxUp('Quarters', 1);
    expect(screen.getByRole('heading', { name: 'Just right!' })).toBeInTheDocument();
    expect(screen.getByText(/^Just what they ordered\./)).toBeInTheDocument();

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

  it('a morning brings regulars not in the book first: a kid who plays one morning a visit still fills it (review round 1)', async () => {
    setUp(2, { [pageFlag('dots-bakery', 'wick')]: true, [pageFlag('dots-bakery', 'sol')]: true, [pageFlag('dots-bakery', 'marigold')]: true });
    await open();
    // Who's new comes in; what's asked is still the morning's first order.
    expect(screen.getByText(/Guard Rook wants half a pie/)).toBeInTheDocument();
    boxUp('Halves', 1);
    expect(screen.getByText(/Guard Rook’s page is in your book!/)).toBeInTheDocument();
    expect(save().flags[pageFlag('dots-bakery', 'rook')]).toBe(true);
  });

  it('more than a pie: two pies on the board, a tap on the second fills from it, and it’s said as halves (review round 1)', () => {
    const onPage = vi.fn(() => true);
    // The second Medium morning opens on one and a half pies.
    render(<DotsBakery def={MINIGAMES['dots-bakery']} band="medium" round={1} onPage={onPage} onFinish={() => {}} />);
    expect(screen.getByText(/Guard Rook wants one and a half pies/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Step 1 · Cut the pies' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'Cuts' })).getByRole('button', { name: /^Halves/ }));
    const slices = screen.getByRole('group', { name: 'The pies on the board' }).querySelectorAll('g[style]');
    expect(slices).toHaveLength(4);
    fireEvent.click(slices[3]); // the second pie's second half
    expect(screen.getByText('One half of a pie.')).toBeInTheDocument();
    expect(lifted()).toEqual([false, false, false, true]);
    expect(screen.getByRole('heading', { name: 'Step 2 · Fill the box' })).toBeInTheDocument();
    expect(screen.getByText(/^Each pie is cut into 2 halves\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Put a slice in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Put a slice in' }));
    expect(screen.getByText('Three halves — that’s one and a half pies.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close the box' }));
    expect(screen.getByRole('heading', { name: 'Just right!' })).toBeInTheDocument();
    expect(screen.getByText(/Three halves is the same as one and a half pies\./)).toBeInTheDocument();
    expect(onPage).toHaveBeenCalledWith('rook', 'Guard Rook');
  });

  it('a new visit picks up where the last left off: the next morning’s orders, not the first again (review round 2)', async () => {
    noteRoundPlayed('kid-1', 'dots-bakery');
    await open();
    // Morning 2's first order is a whole pie (morning 1's was half), and its regulars come in.
    expect(screen.getByText(/Guard Rook wants a whole pie/)).toBeInTheDocument();
  });

  it('the ticket draws what’s wanted full and the rest faded, as the board and the box do (review round 2)', () => {
    render(<DotsBakery def={MINIGAMES['dots-bakery']} band="medium" round={0} onPage={() => true} onFinish={() => {}} />);
    // Two thirds: a pie in thirds, two of them full.
    const icon = ticket().querySelector('svg')!;
    expect(solidSlices(icon)).toBe(2);
    expect(icon.querySelectorAll('path[fill="#f4e3c3"]')).toHaveLength(1);
    // The box closed: its picture is the ticket's kind — the slices boxed full.
    boxUp('Sixths', 3);
    const box = screen.getByRole('heading', { name: 'Not quite enough' }).closest('div')!.parentElement!.querySelector('svg')!;
    expect(solidSlices(box)).toBe(3);
  });

  it('a regular served again pays no page and says none (review round 2)', async () => {
    setUp(2, Object.fromEntries(['wick', 'sol', 'marigold', 'rook', 'nib', 'pip', 'bramble', 'poppy'].map((id) => [pageFlag('dots-bakery', id), true])));
    await open();
    expect(screen.getByText(/Grandmother Wick wants half a pie/)).toBeInTheDocument();
    boxUp('Halves', 1);
    expect(screen.getByRole('heading', { name: 'Just right!' })).toBeInTheDocument();
    expect(screen.queryByText(/page is in your book/)).toBeNull();
    expect(addXp).not.toHaveBeenCalled();
  });

  it('the next order starts on a fresh pie: not cut, nothing in the box (review round 2)', async () => {
    await open();
    boxUp('Quarters', 2);
    fireEvent.click(screen.getByRole('button', { name: 'Hand it to Grandmother Wick' }));
    await screen.findByText('Order 2 of 3');
    expect(within(screen.getByRole('group', { name: 'The pies on the board' })).getByText('One pie, not cut yet.')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'Cuts' })).getByRole('button', { name: /^Quarters/ }));
    expect(lifted()).toEqual([false, false, false, false]);
    expect(screen.getByText('The box is empty.')).toBeInTheDocument();
  });

  it('− takes out the last slice put in, and waits when the box is empty (review round 2)', async () => {
    await open();
    fireEvent.click(within(screen.getByRole('group', { name: 'Cuts' })).getByRole('button', { name: /^Quarters/ }));
    const out = screen.getByRole('button', { name: 'Take a slice out' });
    expect(out).toHaveAttribute('aria-disabled', 'true');
    const slices = screen.getByRole('group', { name: 'The pies on the board' }).querySelectorAll('g[style]');
    fireEvent.click(slices[0]);
    fireEvent.click(slices[2]);
    expect(lifted()).toEqual([true, false, true, false]);
    fireEvent.click(screen.getByRole('button', { name: 'Take a slice out' }));
    expect(lifted()).toEqual([true, false, false, false]);
    expect(screen.getByRole('button', { name: 'Take a slice out' })).not.toHaveAttribute('aria-disabled');
  });

  it('a book page read gives Dot back to the order on every next press: Close, Cut it another way, Hand it to (review round 2)', async () => {
    setUp(2, { [pageFlag('dots-bakery', 'nib')]: true });
    await open();
    const readNib = () => fireEvent.click(screen.getByRole('button', { name: 'Nib: cherry pie. Read the page' }));
    const nibSaid = () => screen.queryAllByText(/turns his tongue red/).length > 0;
    fireEvent.click(within(screen.getByRole('group', { name: 'Cuts' })).getByRole('button', { name: /^Quarters/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Put a slice in' }));
    readNib();
    expect(nibSaid()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close the box' }));
    expect(nibSaid()).toBe(false);
    readNib();
    fireEvent.click(screen.getByRole('button', { name: 'Cut it another way' }));
    expect(nibSaid()).toBe(false);
    expect(screen.getByText(/How many equal slices should the pie be cut into\?/)).toBeInTheDocument();
    boxUp('Halves', 1);
    readNib();
    fireEvent.click(screen.getByRole('button', { name: 'Hand it to Grandmother Wick' }));
    await screen.findByText('Order 2 of 3');
    expect(nibSaid()).toBe(false);
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
    // A full box can't take another slice.
    fireEvent.click(screen.getByRole('button', { name: 'Put a slice in' }));
    for (let k = 0; k < 3; k++) fireEvent.click(screen.getByRole('button', { name: 'Put a slice in' }));
    expect(screen.getByText('Four quarters — that’s a whole pie.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Put a slice in' })).toHaveAttribute('aria-disabled', 'true');
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
    expect(screen.getByRole('heading', { name: 'Step 1 · Cut the pie' })).toHaveAccessibleDescription('For Grandmother Wick: 75% of a pie.');
    // The ticket keeps the number: no pie drawn to convert it (review round 1).
    expect(ticket().textContent).toContain('75%');
    expect(ticket().querySelector('svg')).toBeNull();
    // The hint keeps the number: converting it is the kid's (review round 1).
    fireEvent.click(within(screen.getByRole('group', { name: 'Cuts' })).getByRole('button', { name: /^Halves/ }));
    expect(screen.getAllByText('Halves can’t make 75% of a pie exactly. Try another cut!').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cut it another way' }));
    boxUp('Quarters', 3);
    expect(screen.getByText(/75% of a pie is three quarters of a pie\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hand it to Grandmother Wick' }));
    await screen.findByText('Order 2 of 3');
    expect(screen.getByRole('heading', { name: 'Step 1 · Cut the pie' })).toHaveAccessibleDescription('For Keeper Sol: Half a pie, and a quarter of a pie for Nib — both in one box.');
    // One pie a share, both in the board's pie (review rounds 1 and 2): half and a quarter, never the sum.
    const shares = Array.from(ticket().querySelectorAll('svg')).map(solidSlices);
    expect(shares).toEqual([1, 1]);
    expect(Array.from(ticket().querySelectorAll('svg path[stroke="#1b0f22"]')).every((p) => p.getAttribute('fill') === '#f2b233')).toBe(true);
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
    // The next press puts Dot back on the order (review round 1: the page stayed after Fix the box).
    boxUp('Quarters', 1);
    fireEvent.click(screen.getByRole('button', { name: 'Nib: cherry pie. Read the page' }));
    expect(screen.getAllByText(/turns his tongue red/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Fix the box' }));
    expect(screen.queryAllByText(/turns his tongue red/)).toHaveLength(0);
    expect(screen.getByText(/Now tap slices into the box/)).toBeInTheDocument();
  });
});
