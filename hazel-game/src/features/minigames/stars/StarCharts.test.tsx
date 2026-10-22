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
const { default: StarCharts } = await import('./StarCharts');
const { useSaveStore } = await import('../../../store/saveStore');
const { useProfileStore } = await import('../../../store/profileStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES, pageFlag, starFlag } = await import('../../../content/minigames');
const { PICTURE_BY_ID, jobFor, learnedLine, roundQueue } = await import('../../../lib/minigames/stars');
type Band = import('../../../content/minigames').Band;
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
  it('Gentle: the outline shown; focus on the sky; joins said kindly; the picture whole → its card, the page; three, then the round', () => {
    const { onPage, onFinish } = play('gentle');
    const queue = roundQueue('gentle', () => false, 0);
    const job = jobFor('gentle', 0, 0, queue);
    expect(job.picture).toBe('belt');
    const sky = screen.getByRole('group', { name: 'The sky' });
    expect(sky).toHaveAccessibleDescription('Join the three stars of Orion’s Belt along the dotted lines.');
    expect(within(sky).getAllByRole('button').find((b) => b.tabIndex === 0)).toHaveFocus();
    // The dotted outline is drawn.
    expect(sky.querySelectorAll('line[stroke-dasharray]').length).toBe(2);

    // A star of the sky's others: not part of it — said by Vela, and under the sky.
    press('extra-1');
    expect(screen.getAllByText('That star isn’t part of Orion’s Belt — look for its brighter stars.')).toHaveLength(2);
    // Two of its stars that aren't joined.
    press('alnitak');
    expect(star('alnitak')).toHaveAttribute('aria-pressed', 'true');
    press('mintaka');
    expect(screen.getAllByText('Alnitak and Mintaka are both in Orion’s Belt, but they aren’t joined. Look at the card again!')).toHaveLength(2);
    // The last star tapped stays picked: on to one it's joined to.
    expect(star('mintaka')).toHaveAttribute('aria-pressed', 'true');
    press('alnilam');
    expect(screen.getAllByText('Mintaka to Alnilam — joined!')).toHaveLength(2);
    expect(star('alnilam')).toHaveAccessibleName(/^A star near the middle: Alnilam, picked, joined to one star$/);
    expect(screen.getByText('1 of 2 lines joined')).toBeInTheDocument();
    press('alnitak');
    const fact = screen.getByRole('heading', { name: 'Orion’s Belt!' });
    expect(fact).toHaveFocus();
    expect(fact).toHaveAccessibleDescription(`${learnedLine(job, 'gentle')} Orion’s Belt is on Vela’s chart!`);
    expect(onPage).toHaveBeenCalledWith('belt', 'Orion’s Belt');
    // Vela cheers (the last join's words don't cover it), and under the sky is quiet.
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('There it is — just like the old star-watchers saw it! Ready for the next?');
    expect(screen.queryByText('Alnilam to Alnitak — joined!')).toBeNull();

    for (const i of [1, 2]) {
      fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
      joinAll(jobFor('gentle', 0, i, queue));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Finish the night' }));
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three star pictures!', learned: learnedLine(jobFor('gentle', 0, 2, queue), 'gentle') });
  });

  it('“Show me a line” makes two stars glow and names them', () => {
    play('gentle');
    fireEvent.click(screen.getByRole('button', { name: '💡 Show me a line' }));
    expect(screen.getAllByText('Try Alnitak and Alnilam — they’re glowing.')).toHaveLength(2);
    expect(star('alnitak')).toHaveAccessibleName(/, glowing$/);
    expect(star('alnilam')).toHaveAccessibleName(/, glowing$/);
    press('alnitak');
    press('alnilam');
    expect(star('alnitak')).not.toHaveAccessibleName(/glowing/);
  });

  it('a tap anywhere near a star picks it (they’re small to see, easy to hit); the arrow keys move between stars', () => {
    play('gentle');
    const sky = screen.getByRole('group', { name: 'The sky' });
    const size = (px: number) => (sky.getBoundingClientRect = () => ({ left: 0, top: 0, width: px, height: px, right: px, bottom: px, x: 0, y: 0, toJSON() {} }) as DOMRect);
    size(400);
    const { x, y } = PICTURE_BY_ID.belt.stars.find((s) => s.id === 'alnilam')!;
    fireEvent.pointerDown(sky, { clientX: (x + 4) * 4, clientY: (y - 3) * 4, button: 0 });
    expect(star('alnilam')).toHaveAttribute('aria-pressed', 'true');
    // Far from any star: nothing.
    fireEvent.pointerDown(sky, { clientX: 2 * 4, clientY: 98 * 4, button: 0 });
    expect(star('alnilam')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.pointerDown(sky, { clientX: x * 4, clientY: y * 4, button: 0 });
    expect(star('alnilam')).toHaveAttribute('aria-pressed', 'false');
    // On a small sky a tap reaches a little further (22 px, more than 7% of 150): Mintaka, 18 px off.
    size(150);
    const m = PICTURE_BY_ID.belt.stars.find((s) => s.id === 'mintaka')!;
    fireEvent.pointerDown(sky, { clientX: m.x * 1.5 + 18, clientY: m.y * 1.5, button: 0 });
    expect(star('mintaka')).toHaveAttribute('aria-pressed', 'true');
    // The keyboard: right from Alnitak goes to Alnilam.
    star('alnitak').focus();
    fireEvent.keyDown(star('alnitak'), { key: 'ArrowRight' });
    expect(star('alnilam')).toHaveFocus();
    expect(star('alnilam')).toHaveAttribute('tabindex', '0');
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
    expect(screen.getAllByRole('heading', { name: 'Find the North Star' }).length).toBeGreaterThan(0);
    expect(star('merak-g')).toHaveAccessibleName(/: Merak$/);
    press('dubhe-g');
    expect(screen.getAllByText(/^Not that one: Merak is the bottom star/)).toHaveLength(2);
    press('merak-g');
    press('dubhe-g');
    expect(screen.getAllByText(/^Dubhe! The two of them point the way/)).toHaveLength(2);
    press('kochab');
    expect(screen.getAllByText(/^Follow the arrow from Merak through Dubhe/)).toHaveLength(2);
    press('polaris');
    expect(screen.getAllByText(/^The North Star!/)).toHaveLength(2);
    // The Big Dipper's stars go; the North Star's picked, to join from.
    expect(document.querySelector('[data-star="merak-g"]')).toBeNull();
    expect(star('polaris')).toHaveAttribute('aria-pressed', 'true');
    joinAll(jobFor('medium', 0, 1, queue));
    expect(screen.getByRole('heading', { name: 'Little Dipper!' })).toBeInTheDocument();
  });

  it('Tricky: the sky turned, and the card says how long the light took', () => {
    setUp(9);
    play('tricky');
    const queue = roundQueue('tricky', () => false, 0);
    const job = jobFor('tricky', 0, 0, queue);
    expect(job.turn).not.toBe(0);
    expect(screen.getByRole('group', { name: 'The sky' })).toHaveAccessibleDescription(/the sky has turned/);
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
