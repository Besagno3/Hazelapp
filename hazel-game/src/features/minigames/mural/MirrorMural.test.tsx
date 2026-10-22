import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
const { roundsPlayed } = await import('../../../lib/minigames');
const { MINIGAMES, mineFlag, pageFlag, starFlag } = await import('../../../content/minigames');
const { MINIGAME_PAGE_XP } = await import('../../../content/items');
const mural = await import('../../../lib/minigames/mural');
const { HEX, NAME, OPPOSITE, decodeMine, jobFor, learnedLine, roundQueue, toPaint, recipe } = mural;
type Job = import('../../../lib/minigames/mural').Job;
type Colour = import('../../../lib/minigames/mural').Colour;

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

afterEach(() => {
  vi.restoreAllMocks();
});

const save = () => useSaveStore.getState().save!;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const cell = (r: number, c: number) => screen.getByRole('button', { name: new RegExp(`^Row ${r + 1}, square ${c + 1}:`) });
const square = (r: number, c: number) => screen.getByRole('group', { name: /^(The picture|Your canvas)$/ }).querySelector<HTMLElement>(`[data-cell="${r},${c}"]`)!;
const paints = () => within(screen.getByRole('group', { name: 'Paints' }));
const pots = () => within(screen.getByRole('group', { name: 'Paint pots' }));
const marked = () => screen.queryAllByRole('button', { name: /Doesn’t match yet\.$/ });
const mirror = () => fireEvent.click(screen.getByRole('button', { name: '🪞 Hold up the mirror' }));
const brush = (c: Colour) => fireEvent.click(paints().getByRole('button', { name: cap(NAME[c]) }));

async function open() {
  render(<MiniGameStage game="mirror-mural" />);
  fireEvent.click(screen.getByRole('button', { name: 'Let’s paint!' }));
  return screen.findByRole('heading', { name: 'Step 1 · Mix the paint' });
}

function play(band: 'gentle' | 'medium' | 'tricky', { round = 0, isNew = true } = {}) {
  const onPage = vi.fn(() => isNew);
  const onFinish = vi.fn();
  const onClaim = vi.fn();
  render(<MirrorMural def={MINIGAMES['mirror-mural']} band={band} round={round} onPage={onPage} onFinish={onFinish} onClaim={onClaim} />);
  return { onPage, onFinish, onClaim };
}

/** Mix the job's paint from its two pots. */
function mixFor(job: Job) {
  const [a, b] = recipe(job.mixColour)!;
  fireEvent.click(pots().getByRole('button', { name: cap(a) }));
  fireEvent.click(pots().getByRole('button', { name: cap(b) }));
  fireEvent.click(screen.getByRole('button', { name: 'Mix them' }));
}

/** Paint every square of the kid's part as the goal has it (bare ones stay bare). */
function paintGoal(job: Job) {
  for (const [r, c] of toPaint(job.kind)) {
    const v = job.goal[r][c];
    if (!v) continue;
    brush(v);
    fireEvent.click(cell(r, c));
  }
}

/** A whole picture: mix, paint, the mirror, and on to the next. */
async function finishPicture(job: Job, i: number) {
  mixFor(job);
  paintGoal(job);
  mirror();
  fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next picture' : 'Next — paint your own!' }));
  if (i < 2) await screen.findByText(`Picture ${i + 2} of 3`);
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
  it('Gentle: mix purple (a wrong pair said once, kindly), paint the right half, the mirror marks what to fix on the canvas; three pictures pay the round, a canvas of your own, the reward', async () => {
    const queue = roundQueue(() => false, 0);
    const start = await open();
    await waitFor(() => expect(start).toHaveFocus());
    expect(start).toHaveAccessibleDescription('Paint the right half as the left half’s mirror. Mix purple first.');
    expect(screen.getByRole('button', { name: 'Pick two pots' })).toHaveAttribute('aria-disabled', 'true');

    // Red and yellow make orange: said in the step's status only (Madame Hue's line stays put), not scolded; pick again.
    fireEvent.click(pots().getByRole('button', { name: 'Red' }));
    fireEvent.click(pots().getByRole('button', { name: 'Yellow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mix them' }));
    expect(screen.getByRole('status')).toHaveTextContent('Red and yellow make orange — the picture needs purple. Try two others!');
    expect(screen.getAllByText(/Red and yellow make orange/)).toHaveLength(1);
    expect(screen.getByText('The Butterfly needs purple. Pick two pots and mix them, darling!')).toBeInTheDocument();
    const first = jobFor('gentle', 0, 0, queue);
    mixFor(first);

    // Painting: focus on the first square to paint; a mirror held up too soon marks, on the canvas, what doesn't
    // match — and focus goes to the first marked square.
    expect(screen.getByRole('heading', { name: 'Step 2 · Paint the other half' })).toBeInTheDocument();
    expect(cell(0, 3)).toHaveFocus();
    expect(paints().getByRole('button', { name: 'Purple' })).toHaveAttribute('aria-pressed', 'true');
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    mirror();
    expect(screen.getByRole('heading', { name: 'Step 2 · Paint the other half' })).toBeInTheDocument();
    const off = marked();
    expect(off.length).toBe(toPaint('across').filter(([r, c]) => first.goal[r][c]).length);
    expect(off[0]).toHaveFocus();
    expect(screen.getByText(/^Nearly, darling! \w+ squares don’t match yet — they’re marked\./)).toBeInTheDocument();
    expect(screen.getByText(/squares to fix — each has a ! mark\.$/)).toBeInTheDocument();
    // The canvas, with its marks, comes into view as the mirror marks them.
    expect(scroll.mock.contexts.some((el) => (el as HTMLElement).getAttribute('aria-labelledby') === 'mm-canvas')).toBe(true);
    delete (Element.prototype as Partial<Element>).scrollIntoView;
    expect(save().flags[pageFlag('mirror-mural', first.pattern)]).toBeUndefined();

    // A wrong paint is marked too; painting it right takes its mark away.
    paintGoal(first);
    const [wr, wc] = toPaint('across').find(([r, c]) => first.goal[r][c] === 'red')!;
    brush('purple');
    fireEvent.click(cell(wr, wc));
    mirror();
    expect(marked()).toEqual([cell(wr, wc)]);
    expect(screen.getByText('Nearly, darling! One square doesn’t match yet — it’s marked. Look at the square the mirror copies.')).toBeInTheDocument();
    brush('red');
    fireEvent.click(cell(wr, wc));
    expect(marked()).toHaveLength(0);
    // Each painted square shows its paint's letter.
    expect(cell(wr, wc)).toHaveTextContent('R');

    mirror();
    expect(screen.getByRole('heading', { name: 'A perfect match!' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'A perfect match!' })).toHaveAccessibleDescription(`${learnedLine(first)} The Butterfly is in the Gallery!`);
    expect(save().flags[pageFlag('mirror-mural', 'butterfly')]).toBe(true);
    expect(addXp).toHaveBeenLastCalledWith(MINIGAME_PAGE_XP);
    // Its Gallery page shows it as painted: red, which the Gallery's own butterfly hasn't.
    const page = screen.getByRole('button', { name: 'Butterfly. Read the page' });
    expect(page.querySelector(`rect[fill="${HEX.red}"]`)).not.toBeNull();

    // The next picture starts afresh: nothing said of the last mix, its first square in the tab order.
    fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
    await screen.findByText('Picture 2 of 3');
    expect(screen.getByRole('status')).toHaveTextContent('No pots picked yet.');
    const second = jobFor('gentle', 0, 1, queue);
    mixFor(second);
    expect(cell(0, 3)).toHaveFocus();
    paintGoal(second);
    mirror();
    fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
    await screen.findByText('Picture 3 of 3');
    const third = jobFor('gentle', 0, 2, queue);
    mixFor(third);
    paintGoal(third);
    expect(save().flags[starFlag('mirror-mural', 1)]).toBeUndefined();
    mirror();

    // The third picture pays the round there and then: the free canvas is just for fun.
    expect(save().flags[starFlag('mirror-mural', 1)]).toBe(true);
    expect(save().items.mirror).toBe(defaultSave().items.mirror + 1);
    expect(roundsPlayed('kid-1', 'mirror-mural')).toBe(1);

    // A canvas of the kid's own: focus on its first square; paint the left half, the mirror paints the right as you go.
    fireEvent.click(screen.getByRole('button', { name: 'Next — paint your own!' }));
    const canvas = screen.getByRole('group', { name: 'Your canvas' });
    expect(canvas).toHaveAccessibleDescription(/^Paint the left half — the mirror paints the right\./);
    expect(cell(0, 0)).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Paint a square first' })).toHaveAttribute('aria-disabled', 'true');
    // Hanging nothing does nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Paint a square first' }));
    expect(screen.queryByRole('heading', { name: /^Three pictures/ })).toBeNull();
    brush('green');
    fireEvent.click(cell(2, 0));
    expect(screen.queryByRole('button', { name: /^Row 3, square 6:/ })).toBeNull(); // the right half is the mirror's
    expect(square(2, 5).style.background).toBe(hexToRgb(HEX.green));
    fireEvent.click(screen.getByRole('button', { name: '🖼️ Hang it in the Gallery' }));

    // The reward says the picture's hung, and what the last picture taught; nothing is paid twice.
    expect(screen.getByRole('heading', { level: 1, name: 'Three pictures — and one of yours!' })).toHaveFocus();
    expect(screen.getAllByText(learnedLine(third)).length).toBeGreaterThan(0);
    expect(save().items.mirror).toBe(defaultSave().items.mirror + 1);
    expect(roundsPlayed('kid-1', 'mirror-mural')).toBe(1);
    // Hanging it keeps everything else in the save.
    expect(save().flags[pageFlag('mirror-mural', 'butterfly')]).toBe(true);
    expect(save().flags[starFlag('mirror-mural', 1)]).toBe(true);
    const mine = Object.keys(save().flags).filter((f) => f.startsWith(mineFlag('mirror-mural')));
    expect(mine).toHaveLength(1);
    const pic = decodeMine(mine[0].slice(mineFlag('mirror-mural').length))!;
    expect(pic[2][0]).toBe('green');
    expect(pic[2][5]).toBe('green');
  });

  it('leaving from the free canvas keeps the round’s pay', async () => {
    const queue = roundQueue(() => false, 0);
    await open();
    for (const i of [0, 1, 2]) await finishPicture(jobFor('gentle', 0, i, queue), i);
    expect(screen.getByRole('group', { name: 'Your canvas' })).toBeInTheDocument();
    expect(save().flags[starFlag('mirror-mural', 1)]).toBe(true);
    expect(save().items.mirror).toBe(defaultSave().items.mirror + 1);
    expect(roundsPlayed('kid-1', 'mirror-mural')).toBe(1);
    // 🗺️ Map now leaves with all of it; "Not this time" shows the reward without paying again.
    fireEvent.click(screen.getByRole('button', { name: 'Not this time' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Three pictures finished!' })).toBeInTheDocument();
    expect(screen.getByText(/A star for your first round/)).toBeInTheDocument();
    expect(save().items.mirror).toBe(defaultSave().items.mirror + 1);
    expect(roundsPlayed('kid-1', 'mirror-mural')).toBe(1);
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

  it('a drag paints each square it crosses (the given half untouched), till the finger lifts or leaves; one finger, the main button', () => {
    play('gentle');
    const job = jobFor('gentle', 0, 0, roundQueue(() => false, 0));
    mixFor(job);
    const grid = screen.getByRole('group', { name: 'The picture' });
    let under: Element | null = null;
    const was = document.elementFromPoint;
    document.elementFromPoint = () => under;
    const at = (el: Element | null) => {
      under = el;
      return { clientX: 1, clientY: 1 };
    };
    const isPurple = (r: number, c: number) => /^Row \d, square \d: purple\./.test(cell(r, c).getAttribute('aria-label')!);
    try {
      fireEvent.pointerDown(grid, at(grid.querySelector('[data-cell="3,1"]')));
      for (const c of [3, 4, 5]) fireEvent.pointerMove(grid, at(cell(3, c)));
      for (const c of [3, 4, 5]) expect(isPurple(3, c)).toBe(true);
      expect(square(3, 1).style.background).toBe(hexToRgb(HEX[job.goal[3][1]!]));
      // Lifted: moving paints nothing.
      fireEvent.pointerUp(grid);
      fireEvent.pointerMove(grid, at(cell(4, 3)));
      expect(isPurple(4, 3)).toBe(false);
      // Off the canvas ends it too.
      fireEvent.pointerDown(grid, at(cell(2, 3)));
      fireEvent.pointerLeave(grid);
      fireEvent.pointerMove(grid, at(cell(2, 4)));
      expect(isPurple(2, 3)).toBe(true);
      expect(isPurple(2, 4)).toBe(false);
      // A right-click paints nothing.
      fireEvent.pointerDown(grid, { ...at(cell(5, 3)), button: 2 });
      expect(isPurple(5, 3)).toBe(false);
      fireEvent.pointerUp(grid, { button: 2 });
      // A second finger neither starts a drag nor ends the first one's.
      fireEvent.pointerDown(grid, { ...at(cell(1, 3)), pointerId: 1, isPrimary: true });
      fireEvent.pointerDown(grid, { ...at(cell(5, 5)), pointerId: 2 });
      expect(isPurple(5, 5)).toBe(false);
      fireEvent.pointerUp(grid, { pointerId: 2 });
      fireEvent.pointerMove(grid, { ...at(cell(1, 4)), pointerId: 1 });
      expect(isPurple(1, 4)).toBe(true);
      fireEvent.pointerUp(grid, { pointerId: 1 });
    } finally {
      document.elementFromPoint = was;
    }
  });

  it('Medium mirrors down: the bottom half is the kid’s', async () => {
    setUp(5);
    play('medium');
    const queue = roundQueue(() => false, 0);
    await finishPicture(jobFor('medium', 0, 0, queue), 0);
    expect(screen.getByRole('heading', { name: 'Step 1 · Mix the paint' })).toHaveAccessibleDescription('Paint the bottom half as the top half’s mirror. Mix green first.');
    mixFor(jobFor('medium', 0, 1, queue));
    const squares = screen.getAllByRole('button', { name: /^Row \d, square \d:/ }).map((b) => Number(b.getAttribute('aria-label')!.slice(4, 5)));
    expect(squares).toHaveLength(18);
    expect(squares.every((r) => r >= 4)).toBe(true);
    // Its first square copies the one across the line, straight up.
    expect(cell(3, 0)).toHaveAccessibleName(/It copies the square at row 3, square 1:/);
  });

  it('Tricky: four ways with white among the pots; a half turn; an opposite mirror with its key, painted from the whole colour wheel', async () => {
    setUp(9);
    play('tricky');
    const queue = roundQueue(() => false, 0);
    const four = jobFor('tricky', 0, 0, queue);
    expect(screen.getByRole('heading', { name: 'Step 1 · Mix the paint' })).toHaveAccessibleDescription(/^Two mirrors: paint the other three quarters/);
    expect(pots().getByRole('button', { name: 'White' })).toBeInTheDocument();
    mixFor(four);
    expect(screen.getAllByRole('button', { name: /^Row \d, square \d:/ })).toHaveLength(27);
    paintGoal(four);
    mirror();
    fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
    await screen.findByText('Picture 2 of 3');

    // A half turn: the bottom-right corner copies the top-left; a picture flipped down isn't it.
    const turn = jobFor('tricky', 0, 1, queue);
    expect(turn.kind).toBe('turn');
    mixFor(turn);
    expect(cell(5, 5)).toHaveAccessibleName(/It copies the square at row 1, square 1:/);
    for (const [r, c] of toPaint('turn')) {
      const v = turn.goal[5 - r][c];
      if (!v) continue;
      brush(v);
      fireEvent.click(cell(r, c));
    }
    mirror();
    expect(marked().length).toBeGreaterThan(0);
    paintGoal(turn);
    mirror();
    expect(screen.getByRole('heading', { name: 'A perfect match!' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
    await screen.findByText('Picture 3 of 3');

    // Opposites: the paint to mix is the opposite of one on the left; every square says to paint its opposite.
    const opp = jobFor('tricky', 0, 2, queue);
    expect(opp.kind).toBe('opposite');
    mixFor(opp);
    expect(screen.getAllByText(/red and green, yellow and purple, blue and orange are opposites\.$/).length).toBeGreaterThan(0);
    // Its paints come in opposite pairs, side by side.
    for (const [a, b] of [['Red', 'Green'], ['Yellow', 'Purple'], ['Blue', 'Orange']]) {
      const pair = within(paints().getByRole('group', { name: `${a} and ${b.toLowerCase()}: opposites` }));
      expect(pair.getByRole('button', { name: a })).toBeInTheDocument();
      expect(pair.getByRole('button', { name: b })).toBeInTheDocument();
    }
    const [r, c] = toPaint('opposite').find(([rr, cc]) => opp.goal[rr][cc])!;
    const across = opp.goal[r][5 - c]!;
    expect(cell(r, c)).toHaveAccessibleName(`Row ${r + 1}, square ${c + 1}: bare. It copies the square at row ${r + 1}, square ${6 - c}: ${NAME[across]} — paint its opposite.`);
    expect(opp.goal[r][c]).toBe(OPPOSITE[across]);
  });

  it('hanging a new picture takes the old one’s place', async () => {
    const old = mineFlag('mirror-mural', 'r'.repeat(18));
    setUp(2, { [old]: true });
    const { onFinish, onClaim } = play('gentle');
    const queue = roundQueue(() => false, 0);
    // The kid's picture already shows in the Gallery.
    expect(screen.getByRole('button', { name: 'Your own picture. Look at it' })).toBeInTheDocument();
    for (const i of [0, 1, 2]) await finishPicture(jobFor('gentle', 0, i, queue), i);
    expect(onClaim).toHaveBeenCalledTimes(1);
    brush('sky');
    fireEvent.click(cell(0, 0));
    fireEvent.click(screen.getByRole('button', { name: '🖼️ Hang it in the Gallery' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three pictures — and one of yours!', learned: learnedLine(jobFor('gentle', 0, 2, queue)) });
    const mine = Object.keys(save().flags).filter((f) => f.startsWith(mineFlag('mirror-mural')));
    expect(mine).toEqual([mineFlag('mirror-mural', 's' + '-'.repeat(17))]);
  });

  it('“Not this time” hangs nothing: the old picture stays', async () => {
    const old = mineFlag('mirror-mural', 'r'.repeat(18));
    setUp(2, { [old]: true });
    const { onFinish } = play('gentle');
    const queue = roundQueue(() => false, 0);
    for (const i of [0, 1, 2]) await finishPicture(jobFor('gentle', 0, i, queue), i);
    brush('sky');
    fireEvent.click(cell(0, 0));
    fireEvent.click(screen.getByRole('button', { name: 'Not this time' }));
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three pictures finished!', learned: learnedLine(jobFor('gentle', 0, 2, queue)) });
    expect(Object.keys(save().flags).filter((f) => f.startsWith(mineFlag('mirror-mural')))).toEqual([old]);
  });

  it('a picture already in the Gallery isn’t said to be new', () => {
    play('gentle', { isNew: false });
    const job = jobFor('gentle', 0, 0, roundQueue(() => false, 0));
    mixFor(job);
    paintGoal(job);
    mirror();
    expect(screen.getByRole('heading', { name: 'A perfect match!' })).toHaveAccessibleDescription(learnedLine(job));
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

/** "#3fa34d" as jsdom gives a style's colour back: "rgb(63, 163, 77)". */
function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
}
