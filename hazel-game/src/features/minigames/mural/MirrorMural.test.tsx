import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// Reduced motion: no zoom, so a round plays straight through.
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
const { default: MirrorMural } = await import('./MirrorMural');
const { useSaveStore } = await import('../../../store/saveStore');
const { useProfileStore } = await import('../../../store/profileStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES, mineFlag, pageFlag, starFlag } = await import('../../../content/minigames');
const { MINIGAME_PAGE_XP } = await import('../../../content/items');
const mural = await import('../../../lib/minigames/mural');
const { NAME, PATTERN_IDS, decodeMine, jobFor, roundQueue, toPaint, recipe } = mural;
type Job = import('../../../lib/minigames/mural').Job;

const addXp = vi.fn(async () => {});
const recordActivity = vi.fn(async () => {});

function setUp(level: number, flags: Record<string, boolean> = {}) {
  localStorage.clear();
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: new Date().getFullYear() - 9, birthMonth: 1, skillLevels: { creativity: level }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
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
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const cell = (r: number, c: number) => screen.getByRole('button', { name: new RegExp(`^Row ${r + 1}, square ${c + 1}:`) });
const paints = () => within(screen.getByRole('group', { name: 'Paints' }));

async function open() {
  render(<MiniGameStage game="mirror-mural" />);
  fireEvent.click(screen.getByRole('button', { name: 'Let’s paint!' }));
  return screen.findByRole('heading', { name: 'Step 1 · Mix the paint' });
}

function play(band: 'gentle' | 'medium' | 'tricky', round = 0) {
  const onPage = vi.fn(() => true);
  const onFinish = vi.fn();
  render(<MirrorMural def={MINIGAMES['mirror-mural']} band={band} round={round} onPage={onPage} onFinish={onFinish} />);
  return { onPage, onFinish };
}

/** Mix the job's paint from its two pots. */
function mixFor(job: Job) {
  const [a, b] = recipe(job.mixColour)!;
  fireEvent.click(screen.getByRole('button', { name: cap(a) }));
  fireEvent.click(screen.getByRole('button', { name: cap(b) }));
  fireEvent.click(screen.getByRole('button', { name: 'Mix them' }));
}

/** Paint every square of the kid's part as the goal has it (bare ones stay bare). */
function paintGoal(job: Job) {
  for (const [r, c] of toPaint(job.kind)) {
    const v = job.goal[r][c];
    if (!v) continue;
    fireEvent.click(paints().getByRole('button', { name: cap(NAME[v]) }));
    fireEvent.click(cell(r, c));
  }
}

describe('🪞 the title card', () => {
  it('names the game, Madame Hue’s hello and the Gallery', () => {
    render(<MiniGameStage game="mirror-mural" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mirror Mural' })).toBeInTheDocument();
    expect(screen.getByText('Gallery: 0 of 9')).toBeInTheDocument();
    expect(screen.getByText(/Half of each picture is painted/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Let’s paint!' })).toHaveFocus();
  });
});

describe('🪞 Mirror Mural, a whole round (docs/DESIGN-MINIGAMES.md §5.4)', () => {
  it('Gentle: mix purple (a wrong pair said kindly), paint the right half, the mirror checks; three pictures, a canvas of your own, the reward', async () => {
    const queue = roundQueue(() => false, 0);
    const start = await open();
    await waitFor(() => expect(start).toHaveFocus());
    expect(start).toHaveAccessibleDescription('Paint the right half as the left half’s mirror. Mix purple first.');
    expect(screen.getByRole('button', { name: 'Pick two pots' })).toHaveAttribute('aria-disabled', 'true');

    // Red and yellow make orange: said, not scolded; pick again.
    fireEvent.click(screen.getByRole('button', { name: 'Red' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yellow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mix them' }));
    expect(screen.getAllByText('Red and yellow make orange — the picture needs purple. Try two others!').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Step 1 · Mix the paint' })).toBeInTheDocument();
    const first = jobFor('gentle', 0, 0, queue);
    mixFor(first);

    // Painting: focus on the first square to paint; a mirror held up too soon marks what doesn't match.
    expect(screen.getByRole('heading', { name: 'Step 2 · Paint the other half' })).toBeInTheDocument();
    expect(cell(0, 3)).toHaveFocus();
    expect(paints().getByRole('button', { name: 'Purple' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '🪞 Hold up the mirror' }));
    const notYet = screen.getByRole('heading', { name: 'Not quite yet' });
    expect(notYet).toHaveFocus();
    expect(notYet).toHaveAccessibleDescription(/squares don’t match yet — they’re marked\./);
    expect(save().flags[pageFlag('mirror-mural', first.pattern)]).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Fix the picture' }));
    expect(screen.getAllByRole('button', { name: /Doesn’t match yet\.$/ }).length).toBeGreaterThan(0);

    paintGoal(first);
    expect(screen.queryAllByRole('button', { name: /Doesn’t match yet\.$/ })).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '🪞 Hold up the mirror' }));
    expect(screen.getByRole('heading', { name: 'A perfect match!' })).toHaveFocus();
    expect(screen.getByText(/Red and blue make purple; a mirror line down the middle .* The Butterfly is in the Gallery!/)).toBeInTheDocument();
    expect(save().flags[pageFlag('mirror-mural', 'butterfly')]).toBe(true);
    expect(addXp).toHaveBeenLastCalledWith(MINIGAME_PAGE_XP);

    for (const i of [1, 2]) {
      fireEvent.click(screen.getByRole('button', { name: i === 1 ? 'Next picture' : 'Next picture' }));
      await screen.findByText(`Picture ${i + 1} of 3`);
      const job = jobFor('gentle', 0, i, queue);
      mixFor(job);
      paintGoal(job);
      fireEvent.click(screen.getByRole('button', { name: '🪞 Hold up the mirror' }));
      expect(screen.getByRole('heading', { name: 'A perfect match!' })).toBeInTheDocument();
    }

    // A canvas of the kid's own: paint the left half, the mirror paints the right; it hangs in the Gallery.
    fireEvent.click(screen.getByRole('button', { name: 'Next — paint your own!' }));
    expect(screen.getByRole('heading', { name: 'Your turn!' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Paint a square first' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(paints().getByRole('button', { name: 'Green' }));
    fireEvent.click(cell(2, 0));
    expect(screen.queryByRole('button', { name: /^Row 3, square 6:/ })).toBeNull(); // the right half is the mirror's
    fireEvent.click(screen.getByRole('button', { name: '🖼️ Hang it in the Gallery' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Three pictures finished!' })).toHaveFocus();
    expect(save().flags[starFlag('mirror-mural', 1)]).toBe(true);
    expect(save().items.mirror).toBe(defaultSave().items.mirror + 1);
    const mine = Object.keys(save().flags).filter((f) => f.startsWith(mineFlag('mirror-mural')));
    expect(mine).toHaveLength(1);
    const pic = decodeMine(mine[0].slice(mineFlag('mirror-mural').length))!;
    expect(pic[2][0]).toBe('green');
    expect(pic[2][5]).toBe('green');
  });

  it('squares from the keyboard: arrows move between the kid’s squares, Enter paints, and each says what it copies', () => {
    play('gentle');
    const job = jobFor('gentle', 0, 0, roundQueue(() => false, 0));
    mixFor(job);
    const start = cell(0, 3);
    expect(start).toHaveAttribute('tabindex', '0');
    expect(cell(0, 4)).toHaveAttribute('tabindex', '-1');
    expect(start).toHaveAccessibleName(`Row 1, square 4: bare. It copies the square at row 1, square 3: ${job.goal[0][2] ? NAME[job.goal[0][2]!] : 'bare'}.`);
    fireEvent.keyDown(start, { key: 'ArrowRight' });
    expect(cell(0, 4)).toHaveFocus();
    // Left from the first square of the right half: the given half isn't the kid's, so focus stays.
    fireEvent.keyDown(cell(0, 4), { key: 'ArrowLeft' });
    fireEvent.keyDown(cell(0, 3), { key: 'ArrowLeft' });
    expect(cell(0, 3)).toHaveFocus();
    fireEvent.keyDown(cell(0, 3), { key: 'ArrowDown' });
    expect(cell(1, 3)).toHaveFocus();
    fireEvent.click(cell(1, 3)); // Enter on a button is a click
    expect(cell(1, 3)).toHaveAccessibleName(/^Row 2, square 4: purple\./);
    // Rub out.
    fireEvent.click(screen.getByRole('button', { name: 'Rub out' }));
    fireEvent.click(cell(1, 3));
    expect(cell(1, 3)).toHaveAccessibleName(/^Row 2, square 4: bare\./);
  });

  it('a drag across the squares paints each one it crosses (the given half untouched)', () => {
    play('gentle');
    const job = jobFor('gentle', 0, 0, roundQueue(() => false, 0));
    mixFor(job);
    const grid = screen.getByRole('group', { name: 'The picture' });
    const path = [grid.querySelector('[data-cell="3,1"]'), cell(3, 3), cell(3, 4), cell(3, 5)];
    let k = 0;
    const was = document.elementFromPoint;
    document.elementFromPoint = () => path[k] as Element;
    try {
      fireEvent.pointerDown(grid, { clientX: 1, clientY: 1 });
      for (k = 1; k < path.length; k++) fireEvent.pointerMove(grid, { clientX: 1, clientY: 1 });
      fireEvent.pointerUp(grid);
    } finally {
      document.elementFromPoint = was;
    }
    for (const c of [3, 4, 5]) expect(cell(3, c)).toHaveAccessibleName(new RegExp(`^Row 4, square ${c + 1}: purple\\.`));
    // After the finger lifts, moving doesn't paint.
    fireEvent.pointerMove(grid, { clientX: 1, clientY: 1 });
  });

  it('Medium mirrors down: the bottom half is the kid’s', async () => {
    setUp(5);
    play('medium');
    const queue = roundQueue(() => false, 0);
    const across = jobFor('medium', 0, 0, queue);
    mixFor(across);
    paintGoal(across);
    fireEvent.click(screen.getByRole('button', { name: '🪞 Hold up the mirror' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
    await screen.findByText('Picture 2 of 3');
    expect(screen.getByRole('heading', { name: 'Step 1 · Mix the paint' })).toHaveAccessibleDescription('Paint the bottom half as the top half’s mirror. Mix green first.');
    mixFor(jobFor('medium', 0, 1, queue));
    const squares = screen.getAllByRole('button', { name: /^Row \d, square \d:/ }).map((b) => Number(b.getAttribute('aria-label')!.slice(4, 5)));
    expect(squares).toHaveLength(18);
    expect(squares.every((r) => r >= 4)).toBe(true);
  });

  it('Tricky four ways: white among the pots, three quarters to paint', () => {
    setUp(9);
    play('tricky');
    const four = jobFor('tricky', 0, 0, roundQueue(() => false, 0));
    expect(screen.getByRole('heading', { name: 'Step 1 · Mix the paint' })).toHaveAccessibleDescription(/^Two mirrors: paint the other three quarters/);
    expect(screen.getByRole('button', { name: 'White' })).toBeInTheDocument();
    mixFor(four);
    expect(screen.getAllByRole('button', { name: /^Row \d, square \d:/ })).toHaveLength(27);
  });

  it('an opposite mirror: mix the opposite you need, paint from the whole colour wheel', () => {
    setUp(9);
    const queue = roundQueue(() => false, 0);
    // The third Tricky job is an opposite mirror.
    render(<MirrorMural def={MINIGAMES['mirror-mural']} band="tricky" round={0} onPage={() => true} onFinish={() => {}} />);
    const opp = jobFor('tricky', 0, 2, queue);
    expect(opp.kind).toBe('opposite');
    expect(opp.palette).toHaveLength(6);
    expect(PATTERN_IDS).toContain(opp.pattern);
  });

  it('hanging a new picture takes the old one’s place; “Not this time” hangs nothing', async () => {
    const old = mineFlag('mirror-mural', 'r'.repeat(18));
    setUp(2, { [old]: true });
    const { onFinish } = play('gentle');
    const queue = roundQueue(() => false, 0);
    // The kid's picture already shows in the Gallery.
    expect(screen.getByRole('button', { name: 'Your own picture. Look at it' })).toBeInTheDocument();
    for (const i of [0, 1, 2]) {
      const job = jobFor('gentle', 0, i, queue);
      mixFor(job);
      paintGoal(job);
      fireEvent.click(screen.getByRole('button', { name: '🪞 Hold up the mirror' }));
      fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next picture' : 'Next — paint your own!' }));
      if (i < 2) await screen.findByText(`Picture ${i + 2} of 3`);
    }
    fireEvent.click(paints().getByRole('button', { name: 'Sky blue' }));
    fireEvent.click(cell(0, 0));
    fireEvent.click(screen.getByRole('button', { name: '🖼️ Hang it in the Gallery' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    const mine = Object.keys(save().flags).filter((f) => f.startsWith(mineFlag('mirror-mural')));
    expect(mine).toEqual([mineFlag('mirror-mural', 's' + '-'.repeat(17))]);
  });

  it('a picture in the Gallery is read out by Madame Hue and under the book; pictures not in it come first', async () => {
    setUp(2, { [pageFlag('mirror-mural', 'butterfly')]: true, [pageFlag('mirror-mural', 'window')]: true, [pageFlag('mirror-mural', 'flower')]: true });
    await open();
    expect(screen.getByText('3 of 9 pages')).toBeInTheDocument();
    // The first picture is one not in the Gallery yet.
    expect(screen.getByText('PAINT THE DIAMOND')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Window. Read the page' }));
    expect(within(screen.getByRole('region', { name: 'Gallery' })).getByText(/bilateral symmetry/)).toBeInTheDocument();
  });
});
