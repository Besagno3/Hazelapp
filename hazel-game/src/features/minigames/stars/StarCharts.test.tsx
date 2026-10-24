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
// A step's buttons always ready here (the wait after a step starts is tested with Mirror Mural's: useSettled).
vi.mock('../useSettled', () => ({ useSettled: () => () => true, SETTLE_MS: 450 }));

const { default: MiniGameStage } = await import('../MiniGameStage');
const { gridLines } = await import('../../../lib/minigames/stars');
const { default: StarCharts } = await import('./StarCharts');
const { useSaveStore } = await import('../../../store/saveStore');
const { useProfileStore } = await import('../../../store/profileStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES, pageFlag, starFlag } = await import('../../../content/minigames');
const { PICTURE_BY_ID, coordsWords, jobFor, learnedLine, roundQueue, shortName, starCoords } = await import('../../../lib/minigames/stars');
type Band = import('../../../content/minigames').PlayBand;
type Job = import('../../../lib/minigames/stars').Job;

const addXp = vi.fn(async () => {});
const recordActivity = vi.fn(async () => {});

function setUp(level: number, flags: Record<string, boolean> = {}) {
  localStorage.clear();
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: new Date().getFullYear() - 9, birthMonth: 1, skillLevels: { space: level }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
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
const gridLinesOf = (job: Job) => gridLines(job.view!);
const star = (id: string) => document.querySelector<HTMLButtonElement>(`[data-star="${id}"]`)!;
/** A star pressed from the keyboard (a pointer press is the sky's: see the tap test). */
const press = (id: string) => fireEvent.click(star(id));

function play(band: Band, round = 0) {
  const onPage = vi.fn(() => true);
  const onFinish = vi.fn();
  render(<StarCharts def={MINIGAMES['star-charts']} band={band} round={round} onPage={onPage} onFinish={onFinish} />);
  return { onPage, onFinish };
}

/** Join every line of a job's picture, one pair at a time. */
function joinAll(job: Job) {
  for (const [a, b] of PICTURE_BY_ID[job.picture].lines) {
    if (star(a).getAttribute('aria-pressed') !== 'true') press(a);
    press(b);
    if (star(b).getAttribute('aria-pressed') === 'true') press(b);
  }
}

describe('✨ the title card', () => {
  it('names the game, Vela’s hello and the chart', () => {
    render(<MiniGameStage game="star-charts" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Vela’s Star Charts' })).toBeInTheDocument();
    expect(screen.getByText('Star chart: 0 of 9')).toBeInTheDocument();
    expect(screen.getByText(/Help me find them again/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Let’s stargaze!' })).toHaveFocus();
  });
});

describe('✨ Vela’s Star Charts, a round (docs/DESIGN-MINIGAMES.md §5.6)', () => {
  const said = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';

  it('Gentle: the outline shown; focus on the sky; joins said kindly; the picture whole → its card, the page; three, then the round', () => {
    const { onPage, onFinish } = play('gentle');
    const queue = roundQueue('gentle', () => false, 0);
    const job = jobFor('gentle', 0, 0, queue);
    expect(job.picture).toBe('belt');
    const sky = screen.getByRole('group', { name: 'The sky' });
    expect(sky).toHaveAccessibleDescription('Join the three stars of Orion’s Belt along the dotted lines.');
    // Focus on the sky itself; its star in the tab order is one of the picture's, never one of the others (UX review round 1).
    expect(sky).toHaveFocus();
    expect(within(sky).getAllByRole('button').find((b) => b.tabIndex === 0)).toHaveAttribute('data-star', 'alnitak');
    // The dotted outline is drawn; what to do is in the card till Vela says something.
    expect(sky.querySelectorAll('line[stroke-dasharray]').length).toBe(2);
    expect(screen.getByText('Tap a star, then the next along a dotted line — a line appears.')).toBeInTheDocument();
    // No names till a star's picked or joined; stars said alike are numbered.
    expect(star('alnitak')).toHaveAccessibleName('A star near the middle (1 of 3)');

    // A star of the sky's others: not part of it — said by Vela, and in the card.
    press('extra-1');
    expect(screen.getAllByText('That tiny dot isn’t part of Orion’s Belt — its stars are on the dotted lines!')).toHaveLength(2);
    // A star picked: named, and what to tap next said (not Vela's opening again).
    press('alnitak');
    expect(star('alnitak')).toHaveAttribute('aria-pressed', 'true');
    expect(star('alnitak')).toHaveAccessibleName('A star near the middle (1 of 3): Alnitak, picked');
    expect(said()).toContain('Alnitak! Now tap the next star along a dotted line.');
    // Two of its stars that aren't joined.
    press('mintaka');
    expect(screen.getAllByText('Alnitak and Mintaka are both in Orion’s Belt, but they aren’t joined. Follow a dotted line!')).toHaveLength(2);
    // The last star tapped stays picked: on to one it's joined to.
    expect(star('mintaka')).toHaveAttribute('aria-pressed', 'true');
    press('alnilam');
    expect(screen.getAllByText('Mintaka to Alnilam — joined!')).toHaveLength(2);
    expect(star('alnilam')).toHaveAccessibleName('A star near the middle (2 of 3): Alnilam, picked, joined to one star');
    expect(screen.getByText('1 of 2 lines joined')).toBeInTheDocument();
    // A line joined again: said so, kindly.
    press('mintaka');
    expect(said()).toContain('Alnilam and Mintaka are joined already.');
    press('alnilam');
    press('alnitak');
    const fact = screen.getByRole('heading', { name: 'Orion’s Belt!' });
    expect(fact).toHaveFocus();
    expect(fact).toHaveAccessibleDescription(`${learnedLine(job, 'gentle')} Orion’s Belt is on Vela’s chart!`);
    expect(onPage).toHaveBeenCalledWith('belt', 'Orion’s Belt');
    // Vela cheers (the last join's words don't cover it), and the card says what she does.
    expect(said()).toContain('There it is — just like the old star-watchers saw it! Ready for the next?');
    expect(screen.queryByText('Alnilam to Alnitak — joined!')).toBeNull();
    // A star of the sky's others focused (a mouse press on it) doesn't stay the tab order's star into the next picture.
    fireEvent.focus(star('extra-1'));
    // Done: the stars can't be pressed, and a press does nothing.
    expect(star('alnitak')).toHaveAttribute('aria-disabled', 'true');
    press('alnitak');
    expect(screen.getByRole('heading', { name: 'Orion’s Belt!' })).toBeInTheDocument();

    // The next picture starts afresh: Vela's opening, not the last join; its page said by its name; its tab star its own.
    fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
    expect(within(screen.getByRole('group', { name: 'The sky' })).getAllByRole('button').find((b) => b.tabIndex === 0)!.dataset.star).not.toMatch(/^extra-/);
    expect(said()).toMatch(/^Vela.*Here’s the Summer Triangle: three bright stars making a big triangle, its point at the bottom\./);
    joinAll(jobFor('gentle', 0, 1, queue));
    expect(onPage).toHaveBeenLastCalledWith('triangle', 'Summer Triangle');
    fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
    joinAll(jobFor('gentle', 0, 2, queue));
    fireEvent.click(screen.getByRole('button', { name: 'Finish the night' }));
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three star pictures!', learned: learnedLine(jobFor('gentle', 0, 2, queue), 'gentle') });
  });

  it('a picture joined again (its page on the chart already) says its fact, not “on Vela’s chart”', () => {
    const onPage = vi.fn(() => false);
    render(<StarCharts def={MINIGAMES['star-charts']} band="gentle" round={0} onPage={onPage} onFinish={vi.fn()} />);
    joinAll(jobFor('gentle', 0, 0));
    expect(screen.getByRole('heading', { name: 'Orion’s Belt!' })).toHaveAccessibleDescription(learnedLine(jobFor('gentle', 0, 0), 'gentle'));
  });

  it('“Show me a line” makes two stars glow, picks one and says which to tap; after a join, from the star picked', () => {
    play('gentle');
    fireEvent.click(screen.getByRole('button', { name: '💡 Show me a line' }));
    expect(screen.getAllByText('Here’s one: Alnitak to Alnilam — they’re glowing. I’ve picked Alnitak: tap Alnilam!')).toHaveLength(2);
    expect(star('alnitak')).toHaveAccessibleName(/: Alnitak, picked, glowing$/);
    expect(star('alnilam')).toHaveAccessibleName(/, glowing$/);
    press('alnilam');
    expect(star('alnitak')).not.toHaveAccessibleName(/glowing/);
    expect(screen.getByText('1 of 2 lines joined')).toBeInTheDocument();
    // Alnilam picked: the next line shown is from it — and tapping it again keeps it picked (UX review round 1: it let go).
    fireEvent.click(screen.getByRole('button', { name: '💡 Show me a line' }));
    expect(said()).toContain('Here’s one: Alnilam to Mintaka — they’re glowing. Now tap Mintaka!');
    press('alnilam');
    expect(star('alnilam')).toHaveAttribute('aria-pressed', 'true');
    expect(said()).toContain('You’ve picked Alnilam. Now tap Mintaka — it’s glowing.');
    press('mintaka');
    expect(screen.getByRole('heading', { name: 'Orion’s Belt!' })).toBeInTheDocument();
  });

  it('a screen reader’s press — a click with a count, no pointer before it — taps (code review round 2)', () => {
    play('gentle');
    fireEvent.click(star('alnitak'), { detail: 1 });
    expect(star('alnitak')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(star('alnilam'), { detail: 1 });
    expect(said()).toContain('Alnitak to Alnilam — joined!');
  });

  it('“Show me a line” from a line’s second star, picked: flipped to start there; off to the line shown from another star, picked quietly', () => {
    play('gentle');
    press('mintaka');
    press('alnilam');
    fireEvent.click(screen.getByRole('button', { name: '💡 Show me a line' }));
    expect(said()).toContain('Here’s one: Alnilam to Alnitak — they’re glowing. Now tap Alnitak!');
    // Away to Mintaka (not joined to Alnilam again), then to the glowing Alnitak: picked, no "aren't joined".
    press('mintaka');
    press('alnitak');
    expect(star('alnitak')).toHaveAttribute('aria-pressed', 'true');
    expect(said()).toContain('Alnitak! Now tap Alnilam — it’s glowing.');
  });

  it('a picture of two strokes: every line from the star picked joined, a tap on another starts the next (not “aren’t joined”)', () => {
    play('gentle');
    for (const i of [0, 1]) {
      joinAll(jobFor('gentle', 0, i));
      fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
    }
    expect(jobFor('gentle', 0, 2).picture).toBe('crux');
    press('gacrux');
    press('acrux');
    expect(said()).toContain('Gacrux to Acrux — joined!');
    // Its lines all joined, the star picked says where the next starts (code review round 2).
    press('acrux');
    expect(said()).toContain('Acrux’s lines are all joined. Start the next from Mimosa or Imai.');
    press('gacrux');
    expect(said()).toContain('Gacrux’s lines are all joined. Start the next from Mimosa or Imai.');
    press('mimosa');
    expect(star('mimosa')).toHaveAttribute('aria-pressed', 'true');
    expect(said()).toContain('Mimosa! Now tap the next star along a dotted line.');
    press('imai');
    expect(screen.getByRole('heading', { name: 'Southern Cross!' })).toBeInTheDocument();
  });

  it('a tap picks the nearest star as the finger lifts — a swipe (scrolling) or a cancelled one taps nothing; the arrow keys move between stars', () => {
    play('gentle');
    const sky = screen.getByRole('group', { name: 'The sky' });
    const size = (px: number) => (sky.getBoundingClientRect = () => ({ left: 0, top: 0, width: px, height: px, right: px, bottom: px, x: 0, y: 0, toJSON() {} }) as DOMRect);
    const tapAt = (x: number, y: number, button = 0) => {
      fireEvent.pointerDown(sky, { clientX: x, clientY: y, button });
      fireEvent.pointerUp(sky, { clientX: x, clientY: y, button });
    };
    size(400);
    const { x, y } = PICTURE_BY_ID.belt.stars.find((s) => s.id === 'alnilam')!;
    // Pressed, not yet lifted: nothing yet.
    fireEvent.pointerDown(sky, { clientX: (x + 4) * 4, clientY: (y - 3) * 4, button: 0 });
    expect(star('alnilam')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.pointerUp(sky, { clientX: (x + 4) * 4, clientY: (y - 3) * 4, button: 0 });
    expect(star('alnilam')).toHaveAttribute('aria-pressed', 'true');
    // The click a tap brings on the star under it is the sky's tap already: not a second.
    fireEvent.click(star('alnilam'), { detail: 1 });
    expect(said()).toContain('Alnilam! Now tap');
    // A right button: nothing. Far from any star: it's said (UX review round 2: nothing at all).
    tapAt(x * 4, y * 4, 2);
    expect(said()).toContain('Alnilam! Now tap');
    tapAt(2 * 4, 98 * 4);
    expect(said()).toContain('That’s empty sky — tap right on a star.');
    expect(star('alnilam')).toHaveAttribute('aria-pressed', 'true');
    // Tapped again, it stays picked (UX review round 1).
    tapAt(x * 4, y * 4);
    expect(star('alnilam')).toHaveAttribute('aria-pressed', 'true');
    expect(said()).toContain('You’ve picked Alnilam. Now tap the next star along a dotted line.');
    // A swipe that starts on a star scrolls the page: no tap (UX review round 1, code review round 1).
    const m = PICTURE_BY_ID.belt.stars.find((s) => s.id === 'mintaka')!;
    fireEvent.pointerDown(sky, { clientX: m.x * 4, clientY: m.y * 4, button: 0 });
    fireEvent.pointerMove(sky, { clientX: m.x * 4, clientY: m.y * 4 - 30, button: 0 });
    fireEvent.pointerUp(sky, { clientX: m.x * 4, clientY: m.y * 4 - 30, button: 0 });
    fireEvent.pointerDown(sky, { clientX: m.x * 4, clientY: m.y * 4, button: 0 });
    fireEvent.pointerCancel(sky, { clientX: m.x * 4, clientY: m.y * 4 });
    // A second finger's lift isn't the first's tap.
    fireEvent.pointerDown(sky, { clientX: m.x * 4, clientY: m.y * 4, button: 0, pointerId: 1 });
    fireEvent.pointerUp(sky, { clientX: m.x * 4, clientY: m.y * 4, button: 0, pointerId: 2 });
    fireEvent.pointerUp(sky, { clientX: m.x * 4, clientY: m.y * 4, button: 0 });
    expect(screen.getByText('0 of 2 lines joined')).toBeInTheDocument();
    // A tap's reach: 7% of the sky, and on a small one at least 22 px (Mintaka, 18 px off on 150).
    tapAt(m.x * 4 + 30, m.y * 4);
    expect(star('mintaka')).toHaveAttribute('aria-pressed', 'false');
    size(150);
    tapAt(m.x * 1.5 + 18, m.y * 1.5);
    expect(star('mintaka')).toHaveAttribute('aria-pressed', 'true');
    // The keyboard: right from Alnitak goes to Alnilam; up goes to a star higher, down to one lower.
    star('alnitak').focus();
    fireEvent.keyDown(star('alnitak'), { key: 'ArrowRight' });
    expect(star('alnilam')).toHaveFocus();
    expect(star('alnilam')).toHaveAttribute('tabindex', '0');
    const top = (el: Element | null) => parseFloat((el as HTMLElement).style.top);
    fireEvent.keyDown(star('alnilam'), { key: 'ArrowUp' });
    const up = document.activeElement;
    expect(top(up)).toBeLessThan(top(star('alnilam')));
    fireEvent.keyDown(up!, { key: 'ArrowDown' });
    expect(top(document.activeElement)).toBeGreaterThan(top(up));
  });

  it('Medium: no outline; the Little Dipper starts with the North Star, found from the Big Dipper’s pointers', async () => {
    setUp(5);
    play('medium');
    const queue = roundQueue('medium', () => false, 0);
    const first = jobFor('medium', 0, 0, queue);
    expect(document.querySelectorAll('line[stroke-dasharray]').length).toBe(0);
    joinAll(first);
    fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
    expect(jobFor('medium', 0, 1, queue).picture).toBe('little-dipper');
    expect(screen.getByRole('heading', { name: 'Find the North Star' })).toBeInTheDocument();
    // The tab order's star is the one to tap first (code review round 2: it was the North Star).
    expect(within(screen.getByRole('group', { name: 'The sky' })).getAllByRole('button').find((b) => b.tabIndex === 0)).toHaveAttribute('data-star', 'merak-g');
    // What to tap, in Vela's opening (UX review round 1: only in the card, far down on a phone) — said where it's drawn.
    expect(said()).toContain('tap Merak, the highest star of the Big Dipper’s bowl, then Dubhe just left of it!');
    expect(star('merak-g')).toHaveAccessibleName('A star near the top right: Merak');
    press('dubhe-g');
    expect(screen.getAllByText(/^Not that one: Merak is the highest star of the Big Dipper’s bowl, at the top right\./)).toHaveLength(2);
    // The hunt's hint: the star to tap next glows (UX review round 2: no hint in the hunt).
    fireEvent.click(screen.getByRole('button', { name: '💡 Show me where' }));
    expect(star('merak-g')).toHaveAccessibleName(/, glowing$/);
    expect(said()).toContain('Merak is glowing — tap it!');
    // The North Star tapped before the pointers: it is that — find it their way.
    press('polaris');
    expect(said()).toContain('That’s the North Star! Now find it the star-watchers’ way');
    expect(screen.getByText('Pointer stars: 0 of 2')).toBeInTheDocument();
    press('merak-g');
    expect(star('merak-g')).not.toHaveAccessibleName(/glowing/);
    expect(said()).toContain('Merak! Now Dubhe — the bright star just left of it.');
    // No arrow till both pointers are tapped.
    expect(document.querySelector('polygon')).toBeNull();
    press('dubhe-g');
    expect(screen.getAllByText('Dubhe! The two of them point the way: follow the arrow left, to the bright star near the top left.')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '💡 Show me where' }));
    expect(star('polaris')).toHaveAccessibleName(/, glowing$/);
    expect(document.querySelector('polygon')).not.toBeNull();
    press('kochab');
    expect(screen.getAllByText(/^Follow the arrow from Merak through Dubhe/)).toHaveLength(2);
    press('polaris');
    expect(screen.getAllByText(/^The North Star!/)).toHaveLength(2);
    // The Big Dipper's stars go; the North Star's picked, to join from.
    expect(document.querySelector('[data-star="merak-g"]')).toBeNull();
    expect(star('polaris')).toHaveAttribute('aria-pressed', 'true');
    // Polaris said short in a join (code review round 2: "Polaris, the North Star to Yildun").
    press('yildun');
    expect(said()).toContain('Polaris to Yildun — joined!');
    joinAll(jobFor('medium', 0, 1, queue));
    expect(screen.getByRole('heading', { name: 'Little Dipper!' })).toBeInTheDocument();
  });

  it('Medium: a round that starts with the Little Dipper starts with the hunt', () => {
    setUp(5, { [pageFlag('star-charts', 'big-dipper')]: true });
    play('medium');
    expect(screen.getByRole('heading', { name: 'Find the North Star' })).toBeInTheDocument();
    expect(screen.getByText('Pointer stars: 0 of 2')).toBeInTheDocument();
  });

  it('Tricky: the sky turned, and the card says how long the light took', () => {
    setUp(9);
    play('tricky');
    const queue = roundQueue('tricky', () => false, 0);
    const job = jobFor('tricky', 0, 0, queue);
    expect(job.turn).not.toBe(0);
    expect(screen.getByRole('group', { name: 'The sky' })).toHaveAccessibleDescription(/the sky has turned, so it’s on its side\./);
    // What it looks like, said without "up" (code review round 1: "slanting up to the right", on its side).
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Find Orion’s Belt — three stars in a short straight line. Tap a star');
    joinAll(job);
    expect(screen.getByRole('heading', { name: 'Orion’s Belt!' })).toHaveAccessibleDescription(/The light you see from Alnilam left it at least 1,000 years ago\./);
  });

  it('the chart: a page read out by Vela and under it; pictures not on it come first', () => {
    setUp(2, { [pageFlag('star-charts', 'belt')]: true });
    play('gentle');
    expect(screen.getByText('1 of 9 pages')).toBeInTheDocument();
    expect(screen.getByText('SUMMER TRIANGLE')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Orion’s Belt. Read the page' }));
    expect(screen.getAllByText(/the belt of Orion the hunter/).length).toBe(2);
  });

  it('through the stage: three pictures, the reward, star 1 and a Glimmer Candle', async () => {
    render(<MiniGameStage game="star-charts" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s stargaze!' }));
    await screen.findByRole('group', { name: 'The sky' });
    const queue = roundQueue('gentle', () => false, 0);
    for (const i of [0, 1, 2]) {
      joinAll(jobFor('gentle', 0, i, queue));
      fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next picture' : 'Finish the night' }));
    }
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Three star pictures!' })).toBeInTheDocument());
    expect(save().flags[starFlag('star-charts', 1)]).toBe(true);
    expect(save().items.candle).toBe(defaultSave().items.candle + 1);
  });
});

describe('✨ Expert: sky coordinates (§8.5)', () => {
  it('a star found from its altitude and azimuth (a wrong one says where it is and which way to look), then joined; the Little Dipper’s latitude from the North Star; spot on counted', async () => {
    setUp(6);
    const { onFinish } = play('expert', 1);
    const queue = roundQueue('expert', () => false, 1);
    const jobs = [0, 1, 2].map((i) => jobFor('expert', 1, i, queue));
    expect(jobs.map((j) => j.picture)).toEqual(['cassiopeia', 'big-dipper', 'little-dipper']);
    const [cas, dip, ld] = jobs;
    const sky = () => screen.getByRole('group', { name: 'The sky' });

    // Picture 1: a star by its coordinates — the ticket and Vela say them; the grid's numbers round the sky; the stars said
    // by theirs; no hint button; the steps.
    const name = shortName(PICTURE_BY_ID.cassiopeia, cas.find!)!;
    const at = coordsWords(starCoords(cas, cas.find!)!);
    expect(screen.getByRole('heading', { name: `Find ${name}` })).toBeInTheDocument();
    expect(sky()).toHaveAccessibleDescription(`Find ${name} at ${at}, then join the five stars of Cassiopeia.`);
    expect(screen.getAllByText(`${name} is at ${at}. Find it on the grid and tap it.`).length).toBeGreaterThan(0);
    // The counter's its coordinates (code review round 1: untested); the chips.
    expect(screen.getByText(at.charAt(0).toUpperCase() + at.slice(1))).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Steps' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1Find the star', '2Join the stars', '3The fact card']);
    // Altitude up the left, azimuth along the bottom, each a number of degrees (code review round 1: only that they were numbers).
    const alts = Array.from(document.querySelectorAll('[data-axis="alt"]'), (el) => el.textContent);
    const azs = Array.from(document.querySelectorAll('[data-axis="az"]'), (el) => el.textContent);
    const grid = gridLinesOf(cas);
    expect(alts).toEqual(grid.alts.map((a) => `${a.v}°`));
    expect(azs).toEqual(grid.azs.map((a) => `${a.v}°`));
    // The grid's lines drawn, one each; no ground over the horizon here (it's well up).
    expect(document.querySelectorAll('[data-grid="alt"]')).toHaveLength(grid.alts.length);
    expect(document.querySelectorAll('[data-grid="az"]')).toHaveLength(grid.azs.length);
    expect(document.querySelector('[data-ground]')).toBeNull();
    expect(star(cas.find!)).toHaveAccessibleName(`${PICTURE_BY_ID.cassiopeia.stars.find((s) => s.id === cas.find)!.mag === 1 ? 'A bright star' : 'A star'} at ${at}`);
    expect(screen.queryByRole('button', { name: /Show me/ })).toBeNull();
    // The first Tab never lands on the star to find (code review round 1: it rang the answer).
    expect(star(cas.find!)).toHaveAttribute('tabindex', '-1');
    // A wrong star: where it is, which way it is; still finding.
    const wrong = PICTURE_BY_ID.cassiopeia.stars.find((s) => s.id !== cas.find)!.id;
    press(wrong);
    expect(screen.getAllByText(new RegExp(`^That star is at ${coordsWords(starCoords(cas, wrong)!)}\\. ${name} is .+\\. Try again\\.$`)).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: `Find ${name}` })).toBeInTheDocument();
    star(cas.find!).focus();
    press(cas.find!);
    // Found: joining, from it — focus kept on it (UX review round 1: it went to the sky's frame); picked, plainly.
    expect(screen.getByRole('heading', { name: 'Cassiopeia' })).toBeInTheDocument();
    expect(star(cas.find!)).toHaveAttribute('aria-pressed', 'true');
    expect(star(cas.find!)).toHaveFocus();
    // Joins plainly (UX review round 1: "— joined!").
    const [a0, b0] = PICTURE_BY_ID.cassiopeia.lines.find(([a, b]) => a === cas.find || b === cas.find)!;
    press(a0 === cas.find ? b0 : a0);
    expect(screen.getAllByText(/ — joined\.$/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/joined!/);
    joinAll(cas);
    // The fact card: where it is in the sky; plainly.
    expect(screen.getByRole('heading', { name: 'Cassiopeia' })).toHaveAccessibleDescription(`${learnedLine(cas, 'expert')} Cassiopeia is on Vela’s chart.`);
    // After a miss, not "That's it." — it read as the last answer's.
    expect(screen.getAllByText(/^Joined, with a miss on the way\. Next picture\.$/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
    await screen.findByText('Picture 2 of 3');

    // Picture 2: found first time — plainly right.
    press(dip.find!);
    joinAll(dip);
    expect(screen.getAllByText(/^Joined\. Next picture\.$/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
    await screen.findByText('Picture 3 of 3');

    // Picture 3: the Little Dipper — the North Star's altitude is the latitude.
    expect(screen.getByRole('heading', { name: 'How far north?' })).toBeInTheDocument();
    expect(star('polaris')).toHaveAccessibleName(`A bright star at altitude ${ld.latitude}°, azimuth 1°`);
    expect(within(screen.getByRole('list', { name: 'Steps' })).getAllByRole('listitem')[0]).toHaveTextContent('The latitude');
    // A star tapped here is named, not read for the kid; nothing's picked, the step stays (code review round 1: untested).
    press('polaris');
    expect(screen.getAllByText('That’s the North Star. Read its altitude off the grid’s lines, then pick our latitude.').length).toBeGreaterThan(0);
    press('kochab');
    expect(screen.getAllByText(/^Not the North Star: it’s the end of the Little Dipper’s handle/).length).toBeGreaterThan(0);
    expect(star('polaris')).toHaveAttribute('aria-pressed', 'false');
    expect(star('kochab')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('heading', { name: 'How far north?' })).toBeInTheDocument();
    const choices = within(screen.getByRole('group', { name: 'Our latitude' }));
    expect(choices.getAllByRole('button')).toHaveLength(4);
    fireEvent.click(choices.getByRole('button', { name: `${ld.latitude}° N` }));
    expect(screen.getAllByText(new RegExp(`^Yes — ${ld.latitude}° N\\. The North Star is over the Earth’s North Pole`)).length).toBeGreaterThan(0);
    expect(star('polaris')).toHaveAttribute('aria-pressed', 'true');
    joinAll(ld);
    fireEvent.click(screen.getByRole('button', { name: 'Finish the night' }));
    // Two of three right first time; the reward teaches the one missed (a wrong star), not the last.
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ spotOn: { right: 2, of: 3 }, learned: learnedLine(cas, 'expert') }));
  }, 20_000);

  it('a wrong latitude says why, goes on to the joining, and costs the seal', () => {
    setUp(6);
    const { onFinish } = play('expert', 1);
    const queue = roundQueue('expert', () => false, 1);
    for (let i = 0; i < 3; i++) {
      const job = jobFor('expert', 1, i, queue);
      if (job.find) press(job.find);
      else {
        fireEvent.click(within(screen.getByRole('group', { name: 'Our latitude' })).getByRole('button', { name: `${90 - job.latitude!}° N` }));
        expect(screen.getAllByText(new RegExp(`^Not ${90 - job.latitude!}° N\\. The North Star is over the Earth’s North Pole, so its altitude is your latitude: it’s ${job.latitude}° up`)).length).toBeGreaterThan(0);
      }
      joinAll(job);
      fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next picture' : 'Finish the night' }));
    }
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ spotOn: { right: 2, of: 3 }, learned: learnedLine(jobFor('expert', 1, 2, queue), 'expert') }));
  });

  it('a round with every star found and the latitude read first time: spot on 3 of 3, the last lesson', () => {
    setUp(6);
    const { onFinish } = play('expert', 1);
    const queue = roundQueue('expert', () => false, 1);
    for (let i = 0; i < 3; i++) {
      const job = jobFor('expert', 1, i, queue);
      if (job.find) press(job.find);
      else fireEvent.click(within(screen.getByRole('group', { name: 'Our latitude' })).getByRole('button', { name: `${job.latitude}° N` }));
      joinAll(job);
      fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next picture' : 'Finish the night' }));
    }
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ spotOn: { right: 3, of: 3 }, learned: learnedLine(jobFor('expert', 1, 2, queue), 'expert') }));
  });
});

describe('✨ Expert, more (code review round 1)', () => {
  it('two pictures missed: the reward teaches the first, not the second; picked and shown plainly', () => {
    setUp(6);
    const { onFinish } = play('expert', 1);
    const queue = roundQueue('expert', () => false, 1);
    for (let i = 0; i < 3; i++) {
      const job = jobFor('expert', 1, i, queue);
      const p = PICTURE_BY_ID[job.picture];
      if (job.find) {
        if (i === 0) press(p.stars.find((s) => s.id !== job.find)!.id);
        press(job.find);
        // Found, plainly.
        expect(screen.getAllByText(new RegExp(`^${shortName(p, job.find)}, at altitude`)).length).toBeGreaterThan(0);
        // Show me a line, plainly.
        fireEvent.click(screen.getByRole('button', { name: /Show me/ }));
        expect(screen.getAllByText(/^Here’s one: .+ tap [^!]+\.$/).length).toBeGreaterThan(0);
      } else fireEvent.click(within(screen.getByRole('group', { name: 'Our latitude' })).getByRole('button', { name: `${job.latitude! + 5}° N` }));
      joinAll(job);
      fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next picture' : 'Finish the night' }));
    }
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ spotOn: { right: 1, of: 3 }, learned: learnedLine(jobFor('expert', 1, 0, queue), 'expert') }));
  });

  it('a tap between two stars close together, as one’s to be found, isn’t judged — on Orion, the belt (UX review round 1)', () => {
    setUp(6);
    // Round 2's Orion.
    play('expert', 2);
    const job = jobFor('expert', 2, 0);
    expect(job.picture).toBe('orion');
    const sky = screen.getByRole('group', { name: 'The sky' });
    sky.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const at = (id: string) => job.sky.find((s) => s.id === id)!;
    const [a, b] = [at('alnitak-o'), at('alnilam-o')];
    const tap = (x: number, y: number) => {
      fireEvent.pointerDown(sky, { clientX: x * 2, clientY: y * 2, button: 0 });
      fireEvent.pointerUp(sky, { clientX: x * 2, clientY: y * 2, button: 0 });
    };
    // Midway between two belt stars: not a miss, and still finding.
    tap((a.x + b.x) / 2, (a.y + b.y) / 2);
    expect(screen.getAllByText('Two stars are close together there — tap right on the one you mean.').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /^Find / })).toBeInTheDocument();
    // Right on one: judged (a miss here).
    tap(a.x, a.y);
    expect(screen.getAllByText(/^That star is at /).length).toBeGreaterThan(0);
    // Right on the star to find: found — the seal then lost to the miss, not to the unsure tap.
    const f = at(job.find!);
    tap(f.x, f.y);
    expect(screen.getByRole('heading', { name: 'Orion' })).toBeInTheDocument();
  });

  it('a tap on empty sky on the latitude says where the answer is', () => {
    setUp(6);
    play('expert', 1);
    // To the Little Dipper, the third.
    const queue = roundQueue('expert', () => false, 1);
    for (let i = 0; i < 2; i++) {
      const job = jobFor('expert', 1, i, queue);
      press(job.find!);
      joinAll(job);
      fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
    }
    const sky = screen.getByRole('group', { name: 'The sky' });
    sky.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const ld = jobFor('expert', 1, 2, queue);
    // A corner far from every star.
    const far = [[2, 2], [98, 2], [2, 98], [98, 98]].find(([x, y]) => ld.sky.every((s) => Math.hypot(s.x - x, s.y - y) > 12))!;
    fireEvent.pointerDown(sky, { clientX: far[0] * 4, clientY: far[1] * 4, button: 0 });
    fireEvent.pointerUp(sky, { clientX: far[0] * 4, clientY: far[1] * 4, button: 0 });
    expect(screen.getAllByText('Read the North Star’s altitude on the grid, then pick our latitude from the four choices.').length).toBeGreaterThan(0);
  });
});
