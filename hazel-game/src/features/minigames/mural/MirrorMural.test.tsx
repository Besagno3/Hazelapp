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
// A step's buttons always ready here (the wait after a step starts has its own test: MirrorMural.taps.test).
vi.mock('../useSettled', () => ({ useSettled: () => () => true, SETTLE_MS: 450 }));

const { default: MiniGameStage } = await import('../MiniGameStage');
const { default: MirrorMural } = await import('./MirrorMural');
const { useSaveStore } = await import('../../../store/saveStore');
const { useProfileStore } = await import('../../../store/profileStore');
const { defaultSave } = await import('../../../lib/save');
const { roundsPlayed } = await import('../../../lib/minigames');
const { MINIGAMES, mineFlag, pageFlag, starFlag } = await import('../../../content/minigames');
const { MINIGAME_PAGE_XP } = await import('../../../content/items');
const mural = await import('../../../lib/minigames/mural');
const { HEX, NAME, decodeMine, jobFor, learnedLine, opposite, roundQueue, toPaint, recipe } = mural;
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
// By its place: quick, for the many clicks a whole picture takes (review round 2: role queries timed the tests out).
const square = (r: number, c: number) => document.querySelector<HTMLElement>(`[data-cell="${r},${c}"]`)!;
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

function play(band: 'gentle' | 'medium' | 'tricky' | 'expert', { round = 0, isNew = true } = {}) {
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
    fireEvent.click(square(r, c));
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
    // Held up before a square is painted: nothing to mark — paint first.
    mirror();
    expect(marked()).toHaveLength(0);
    expect(screen.getByText('Paint the right half first, darling — then hold up the mirror!')).toBeInTheDocument();
    expect(cell(0, 3)).toHaveFocus();
    // A square or two painted, then the mirror: it marks the rest, focus on the first marked.
    const [pr, pc] = toPaint('across').find(([r, c]) => first.goal[r][c] === 'purple')!;
    fireEvent.click(square(pr, pc));
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    mirror();
    expect(screen.getByRole('heading', { name: 'Step 2 · Paint the other half' })).toBeInTheDocument();
    const off = marked();
    expect(off.length).toBe(toPaint('across').filter(([r, c]) => first.goal[r][c]).length - 1);
    expect(off[0]).toHaveFocus();
    expect(screen.getByText(new RegExp(`^Nearly, darling! ${cap(mural.num(off.length))} squares don’t match yet — they’re marked\\.`))).toBeInTheDocument();
    expect(screen.getByText(/squares to fix — each has a ! mark\.$/)).toBeInTheDocument();
    // The canvas, with its marks, comes into view as the mirror marks them.
    expect(scroll.mock.contexts.some((el) => (el as HTMLElement).getAttribute('aria-labelledby') === 'mm-canvas')).toBe(true);
    delete (Element.prototype as Partial<Element>).scrollIntoView;
    expect(save().flags[pageFlag('mirror-mural', first.pattern)]).toBeUndefined();
    // A marked square tapped with what it already has (bare, rubbed out) keeps its mark; Madame Hue counts the marks
    // down as they're fixed.
    const [mr, mc] = off[0].getAttribute('data-cell')!.split(',').map(Number);
    fireEvent.click(screen.getByRole('button', { name: 'Rub out' }));
    fireEvent.click(square(mr, mc));
    expect(marked()).toHaveLength(off.length);
    brush(first.goal[mr][mc]!);
    fireEvent.click(square(mr, mc));
    expect(marked()).toHaveLength(off.length - 1);
    expect(screen.getByText(new RegExp(`^Nearly, darling! ${cap(mural.num(off.length - 1))} squares`))).toBeInTheDocument();
    // Held up again: focus on the first marked square now — another one.
    mirror();
    expect(marked()[0]).toHaveFocus();
    expect(marked()[0]).not.toBe(off[0]);

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
    // Every mark fixed: a nudge to hold the mirror up again.
    expect(screen.getByText('All fixed? Hold up the mirror again, darling!')).toBeInTheDocument();
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
    const canvas = screen.getByRole('group', { name: 'Your picture' });
    expect(canvas).toHaveAccessibleDescription(/^Paint the left half — the mirror paints the right\./);
    expect(cell(0, 0)).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Paint a square first' })).toHaveAttribute('aria-disabled', 'true');
    // Hanging nothing does nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Paint a square first' }));
    expect(screen.queryByRole('heading', { name: /^Three pictures/ })).toBeNull();
    brush('green');
    fireEvent.click(cell(2, 0));
    // The right half is the mirror's: none of its squares can be pressed, and it paints itself as you go.
    for (let r = 0; r < 6; r++) for (const c of [3, 4, 5]) expect(square(r, c).tagName).toBe('DIV');
    expect(square(2, 5).style.background).toBe(hexToRgb(HEX.green));
    fireEvent.click(screen.getByRole('button', { name: '🖼️ Hang it in the Gallery' }));

    // The reward says the picture's hung — and shows it — and what the last picture taught; nothing is paid twice.
    expect(screen.getByRole('heading', { level: 1, name: 'Three pictures — and one of yours!' })).toHaveFocus();
    expect(document.querySelector(`svg rect[fill="${HEX.green}"]`)).not.toBeNull();
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
  }, 20_000);

  it('leaving from the free canvas keeps the round’s pay', async () => {
    const queue = roundQueue(() => false, 0);
    await open();
    for (const i of [0, 1, 2]) await finishPicture(jobFor('gentle', 0, i, queue), i);
    expect(screen.getByRole('group', { name: 'Your picture' })).toBeInTheDocument();
    expect(save().flags[starFlag('mirror-mural', 1)]).toBe(true);
    expect(save().items.mirror).toBe(defaultSave().items.mirror + 1);
    expect(roundsPlayed('kid-1', 'mirror-mural')).toBe(1);
    // 🗺️ Map now leaves with all of it; "Not this time" shows the reward without paying again.
    fireEvent.click(screen.getByRole('button', { name: 'Not this time' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Three pictures finished!' })).toBeInTheDocument();
    expect(screen.getByText(/A star for your first round/)).toBeInTheDocument();
    expect(save().items.mirror).toBe(defaultSave().items.mirror + 1);
    expect(roundsPlayed('kid-1', 'mirror-mural')).toBe(1);
  }, 20_000);

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
    // A held Enter's repeats press nothing (they'd paint the square focus just came to).
    const held = new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true });
    cell(1, 3).dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);
    const once = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    cell(1, 3).dispatchEvent(once);
    expect(once.defaultPrevented).toBe(false);
  });

  it('a new picture starts on its own first square, wherever focus was in the last', async () => {
    play('gentle');
    const queue = roundQueue(() => false, 0);
    const job = jobFor('gentle', 0, 0, queue);
    mixFor(job);
    fireEvent.keyDown(cell(0, 3), { key: 'ArrowDown' });
    fireEvent.keyDown(cell(1, 3), { key: 'ArrowRight' });
    expect(cell(1, 4)).toHaveFocus();
    paintGoal(job);
    mirror();
    fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
    await screen.findByText('Picture 2 of 3');
    mixFor(jobFor('gentle', 0, 1, queue));
    expect(cell(0, 3)).toHaveFocus();
    expect(cell(1, 4)).toHaveAttribute('tabindex', '-1');
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

  it('Medium mirrors down: the bottom half is the kid’s; the reward keeps the last picture’s lesson', async () => {
    setUp(5);
    const { onFinish } = play('medium');
    const queue = roundQueue(() => false, 0);
    await finishPicture(jobFor('medium', 0, 0, queue), 0);
    expect(screen.getByRole('heading', { name: 'Step 1 · Mix the paint' })).toHaveAccessibleDescription('Paint the bottom half as the top half’s mirror. Mix green first.');
    mixFor(jobFor('medium', 0, 1, queue));
    const squares = screen.getAllByRole('button', { name: /^Row \d, square \d:/ }).map((b) => Number(b.getAttribute('aria-label')!.slice(4, 5)));
    expect(squares).toHaveLength(18);
    expect(squares.every((r) => r >= 4)).toBe(true);
    // Its first square copies the one across the line, straight up.
    expect(cell(3, 0)).toHaveAccessibleName(/It copies the square at row 3, square 1:/);
    paintGoal(jobFor('medium', 0, 1, queue));
    mirror();
    fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
    await screen.findByText('Picture 3 of 3');
    const third = jobFor('medium', 0, 2, queue);
    await finishPicture(third, 2);
    fireEvent.click(screen.getByRole('button', { name: 'Not this time' }));
    expect(learnedLine(third)).not.toBe(learnedLine(jobFor('medium', 0, 1, queue)));
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three pictures finished!', learned: learnedLine(third) });
  }, 20_000);

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
    expect(opp.goal[r][c]).toBe(opposite(across));
    // After it, the free canvas has its own paints — not the pairs.
    paintGoal(opp);
    mirror();
    fireEvent.click(screen.getByRole('button', { name: 'Next — paint your own!' }));
    expect(paints().queryByRole('group', { name: /opposites$/ })).toBeNull();
    for (const c of ['Pink', 'Sky blue']) expect(paints().getByRole('button', { name: c })).toBeInTheDocument();
  }, 20_000);

  it('Expert: the move named from A and A′ (a wrong one says where it takes A), the image painted on the coordinates, its line after a miss; spot on counted and claimed with the pay', async () => {
    setUp(9);
    const { onFinish, onClaim } = play('expert');
    const queue = roundQueue(() => false, 0);
    const moves = () => within(screen.getByRole('group', { name: 'Moves' }));
    const named = (name: string) => {
      fireEvent.click(moves().getByRole('button', { name }));
      fireEvent.click(screen.getByRole('button', { name: 'That’s the move' }));
    };
    const check = () => fireEvent.click(screen.getByRole('button', { name: '🪞 Check the image' }));
    const canvas = () => screen.getByRole('group', { name: 'The picture' });

    // Step 1: no pots — A and its image, the move kept back till it's named (the ticket and its badge too).
    const across = jobFor('expert', 0, 0, queue);
    expect(across.kind).toBe('across');
    const head = screen.getByRole('heading', { name: 'Step 1 · Name the move' });
    expect(head).toHaveAccessibleDescription('A (1, 4) maps to A′ (5, 4). Name the move, then paint the image.');
    expect(screen.queryByRole('group', { name: 'Paint pots' })).toBeNull();
    expect(screen.getByText('Name', { selector: 'li *, li' })).toBeInTheDocument();
    expect(moves().getAllByRole('button').map((b) => b.textContent)).toEqual(['Reflect in x = 3', 'Reflect in y = 3', 'Reflect in y = x', 'Rotate 180° about (3, 3)', 'Rotate 90° clockwise about (3, 3)', 'Translate by (3, 0)']);
    expect(screen.getByRole('button', { name: 'Pick a move' })).toHaveAttribute('aria-disabled', 'true');
    // A and A′ on the canvas, and the axes 0 to 6 round it; no mirror line drawn.
    expect(canvas().querySelectorAll('svg circle')).toHaveLength(2);
    expect(canvas().querySelector('svg')).toHaveTextContent('AA′');
    expect(canvas().querySelector('[class*="left-1/2"]')).toBeNull();
    expect(canvas().previousElementSibling).toHaveTextContent('0123456');
    expect(canvas().parentElement!.lastElementChild).toHaveTextContent('0123456');

    // A wrong move: where it takes A, and pick again; it costs the seal.
    named('Reflect in y = x');
    expect(screen.getByRole('status')).toHaveTextContent('Reflect in y = x: A goes to (4, 1), not (5, 4). Try another.');
    expect(screen.getByRole('heading', { name: 'Step 1 · Name the move' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick a move' })).toBeInTheDocument();
    named('Reflect in x = 3');

    // Step 2: the image; the squares said by their corners, each with what it's the image of.
    expect(screen.getByRole('heading', { name: 'Step 2 · Paint the image' })).toBeInTheDocument();
    expect(screen.getByText('Reflect in x = 3: A goes to (5, 4). Now paint the image.')).toBeInTheDocument();
    expect(screen.getByText('PAINT THE BUTTERFLY').parentElement!.parentElement).toHaveTextContent('Reflect the left half in the line x = 3.');
    const src = across.goal[0][2];
    expect(square(0, 3)).toHaveAccessibleName(`Square (3, 5) to (4, 6): bare. It’s the image of the square (2, 5) to (3, 6): ${src ? NAME[src] : 'bare'}.`);
    expect(canvas().querySelector('svg')).toBeNull();
    // The picture's two paints and Rub out: nothing to mix.
    expect(paints().getAllByRole('button')).toHaveLength(3);
    for (const c of across.palette) expect(paints().getByRole('button', { name: cap(NAME[c]) })).toBeInTheDocument();
    // Checked with a square left: marked, the rule said, and the line x = 3 drawn now.
    const [lr, lc] = toPaint('across').find(([r, c]) => across.goal[r][c])!;
    for (const [r, c] of toPaint('across')) {
      const v = across.goal[r][c];
      if (!v || (r === lr && c === lc)) continue;
      brush(v);
      fireEvent.click(square(r, c));
    }
    check();
    expect(marked()).toHaveLength(1);
    expect(screen.getByText('One square doesn’t match yet — it’s marked. A reflection in x = 3 takes (x, y) to (6 − x, y).')).toBeInTheDocument();
    expect(screen.getByText(/It’s marked on the canvas\.$/)).toBeInTheDocument();
    const line = canvas().querySelector('svg line[stroke="#22d3ee"]')!;
    expect([line.getAttribute('x1'), line.getAttribute('x2')]).toEqual(['3', '3']);
    paintGoal(across);
    expect(screen.getByText('All fixed? Check it again.')).toBeInTheDocument();
    check();
    expect(screen.getByRole('heading', { name: 'An exact image' })).toHaveAccessibleDescription(`${learnedLine(across)} The Butterfly is in the Gallery!`);
    expect(screen.getByText('Exact. Next picture.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
    await screen.findByText('Picture 2 of 3');

    // Spot on: y = x, then the quarter turns, each named and exact the first time.
    for (const [i, name] of [[1, 'Reflect in y = x'], [2, 'Rotate 90° clockwise about (3, 3)']] as const) {
      const job = jobFor('expert', 0, i, queue);
      named(name);
      paintGoal(job);
      check();
      expect(screen.getByRole('heading', { name: 'An exact image' })).toBeInTheDocument();
      if (i === 1) {
        // A square on y = x is its own image: given, not the kid's.
        expect(document.querySelector('button[data-cell="0,5"]')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
        await screen.findByText('Picture 3 of 3');
        expect(screen.getByRole('heading', { name: 'Step 1 · Name the move' })).toHaveAccessibleDescription('A (1, 4) maps to A′ (4, 5). Name the move, then paint the image.');
      }
    }
    // Two of three spot on: claimed with the pay, before the free canvas.
    expect(onClaim).toHaveBeenCalledWith({ right: 2, of: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Next — paint your own' }));
    expect(screen.getByRole('heading', { name: 'Your turn' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not this time' }));
    expect(onFinish).toHaveBeenCalledWith({ spotOn: { right: 2, of: 3 }, title: 'Three pictures finished!', learned: learnedLine(jobFor('expert', 0, 2, queue)) });
  }, 20_000);

  it('Expert: the second round translates, turns half round and reflects in y = 3; the lessons are the moves’', async () => {
    setUp(9);
    const { onFinish } = play('expert', { round: 1 });
    const queue = roundQueue(() => false, 1);
    const names = ['Translate by (3, 0)', 'Rotate 180° about (3, 3)', 'Reflect in y = 3'];
    for (let i = 0; i < 3; i++) {
      const job = jobFor('expert', 1, i, queue);
      fireEvent.click(within(screen.getByRole('group', { name: 'Moves' })).getByRole('button', { name: names[i] }));
      fireEvent.click(screen.getByRole('button', { name: 'That’s the move' }));
      if (i === 0) expect(square(0, 3)).toHaveAccessibleName(/It’s the image of the square \(0, 5\) to \(1, 6\):/);
      paintGoal(job);
      fireEvent.click(screen.getByRole('button', { name: '🪞 Check the image' }));
      fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next picture' : 'Next — paint your own' }));
      if (i < 2) await screen.findByText(`Picture ${i + 2} of 3`);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Not this time' }));
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ spotOn: { right: 3, of: 3 }, learned: expect.stringMatching(/^A reflection in y = 3/) }));
  }, 20_000);

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
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ title: 'Three pictures — and one of yours!', learned: learnedLine(jobFor('gentle', 0, 2, queue)) }));
    const mine = Object.keys(save().flags).filter((f) => f.startsWith(mineFlag('mirror-mural')));
    expect(mine).toEqual([mineFlag('mirror-mural', 's' + '-'.repeat(17))]);
  }, 20_000);

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
  }, 20_000);

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
