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
const { default: IndexTimeline } = await import('./IndexTimeline');
const { useSaveStore } = await import('../../../store/saveStore');
const { useProfileStore } = await import('../../../store/profileStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES, pageFlag, starFlag } = await import('../../../content/minigames');
const { SET_BY_ID, jobFor, learnedLine, roundQueue, yearWords } = await import('../../../lib/minigames/timeline');
type Band = import('../../../content/minigames').Band;
type Job = import('../../../lib/minigames/timeline').Job;

const addXp = vi.fn(async () => {});
const recordActivity = vi.fn(async () => {});

function setUp(level: number, flags: Record<string, boolean> = {}) {
  localStorage.clear();
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: new Date().getFullYear() - 9, birthMonth: 1, skillLevels: { history: level }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
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
const index = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';
const tray = () => screen.getByRole('group', { name: /^The washed-up cards/ });
const card = (name: string) => within(tray()).getByRole('button', { name: new RegExp(`^${name}`) });
const place = (k: number) => screen.getByRole('button', { name: new RegExp(`^Place ${k + 1} of `) });

function play(band: Band, round = 0, page = true) {
  const onPage = vi.fn(() => page);
  const onFinish = vi.fn();
  render(<IndexTimeline def={MINIGAMES['index-timeline']} band={band} round={round} onPage={onPage} onFinish={onFinish} />);
  return { onPage, onFinish };
}

/** Every card tapped in the right order, then checked. */
function fileAll(job: Job) {
  for (const ev of job.events) fireEvent.click(card(ev.name));
  fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
}

describe('📜 the title card', () => {
  it('names the game, Index’s hello and the timeline book', () => {
    render(<MiniGameStage game="index-timeline" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Index’s Timeline' })).toBeInTheDocument();
    expect(screen.getByText('Timeline book: 0 of 8')).toBeInTheDocument();
    expect(screen.getByText(/my cards washed out of their drawers/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Let’s file!' })).toHaveFocus();
  });
});

describe('📜 Index’s Timeline, a round (docs/DESIGN-MINIGAMES.md §5.8)', () => {
  it('Gentle: each card tapped goes in the next place, oldest first; a check sends the wrong ones back with a clue, keeps the right; in order → its page; three, then the round', () => {
    const { onPage, onFinish } = play('gentle');
    const queue = roundQueue(() => false, 0);
    const job = jobFor('gentle', 0, 0, queue); // Light: firelight, gas lamps, LEDs
    expect(job.events.map((ev) => ev.name)).toEqual(['Firelight in caves', 'Gas street lamps', 'LED lights']);
    // Focus on the tray's first card; no years on Gentle's cards.
    expect(within(tray()).getAllByRole('button')[0]).toHaveFocus();
    expect(card('LED lights')).toHaveAccessibleName('LED lights');
    expect(place(0)).toHaveAccessibleName('Place 1 of 3, the oldest, empty');
    expect(index()).toContain('Which came first? Tap the oldest.');
    // Check waits till every card's placed.
    expect(screen.getByRole('button', { name: 'Check the order' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
    expect(index()).toContain('Every card on the timeline first — 3 are still in the tray.');

    // Gas lamps first, firelight second (wrong); LEDs last (right).
    fireEvent.click(card('Gas street lamps'));
    expect(place(0)).toHaveAccessibleName('Place 1 of 3, the oldest: Gas street lamps');
    expect(index()).toContain('And next? Tap the card that came after.');
    fireEvent.click(card('Firelight in caves'));
    fireEvent.click(card('LED lights'));
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
    expect(screen.getAllByText('One in the right place! Lighting a whole street took gas pipes — long after candles.')).toHaveLength(2);
    // The right one stays, ticked; the others are back in the tray.
    expect(place(2)).toHaveAccessibleName('Place 3 of 3, the newest: LED lights, right');
    expect(place(0)).toHaveAccessibleName('Place 1 of 3, the oldest, empty');
    expect(card('Gas street lamps')).toBeInTheDocument();
    fireEvent.click(place(2));
    expect(index()).toContain('LED lights is in its right place — it stays.');

    // The next cards fill the empty places, oldest first.
    fireEvent.click(card('Firelight in caves'));
    fireEvent.click(card('Gas street lamps'));
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
    const head = screen.getByRole('heading', { name: 'Light, in order!' });
    expect(head).toHaveFocus();
    expect(head).toHaveAccessibleDescription(`${learnedLine(job)} Light is in the timeline book!`);
    expect(onPage).toHaveBeenCalledWith('light', 'Light');
    // The years come out once it's filed.
    expect(place(0)).toHaveAccessibleName(`Place 1 of 3, the oldest: Firelight in caves, ${yearWords(job.events[0])}, right`);
    expect(index()).toContain('Filed! In order! Ah… Bh… CHOO! Another drawer?');

    for (const i of [1, 2]) {
      fireEvent.click(screen.getByRole('button', { name: 'Next drawer' }));
      fileAll(jobFor('gentle', 0, i, queue));
    }
    fireEvent.click(screen.getByRole('button', { name: 'All filed!' }));
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three timelines filed!', learned: learnedLine(jobFor('gentle', 0, 2, queue)) });
  });

  it('a card on the line tapped comes back to the tray (its place fills next); an empty place says how', () => {
    play('gentle');
    fireEvent.click(place(1));
    expect(index()).toContain('Tap a card in the tray — it goes in the next empty place.');
    fireEvent.click(card('Gas street lamps'));
    fireEvent.click(card('LED lights'));
    fireEvent.click(place(0));
    expect(index()).toContain('Gas street lamps is back in the tray.');
    expect(place(0)).toHaveAccessibleName('Place 1 of 3, the oldest, empty');
    expect(card('Gas street lamps')).toBeInTheDocument();
    // The next card goes in the first empty place: the one just emptied.
    fireEvent.click(card('Firelight in caves'));
    expect(place(0)).toHaveAccessibleName('Place 1 of 3, the oldest: Firelight in caves');
    expect(place(1)).toHaveAccessibleName('Place 2 of 3: LED lights');
  });

  it('Medium: five cards, no years', () => {
    setUp(5);
    play('medium');
    const job = jobFor('medium', 0, 0, roundQueue(() => false, 0));
    expect(within(tray()).getAllByRole('button')).toHaveLength(5);
    expect(card(job.events[0].name)).toHaveAccessibleName(job.events[0].name);
  });

  it('Tricky: six or seven with their years; a BCE slip says how BCE years count', () => {
    setUp(9);
    play('tricky', 0);
    const job = jobFor('tricky', 0, 0, roundQueue(() => false, 0)); // Light, six
    expect(within(tray()).getAllByRole('button')).toHaveLength(6);
    expect(card('Stone oil lamps')).toHaveAccessibleName('Stone oil lamps, about 15,000 BCE');
    // Swap the two oldest (both BCE): the clue counts the years down.
    const order = job.events.map((ev) => ev.name);
    [order[0], order[1]] = [order[1], order[0]];
    for (const name of order) fireEvent.click(card(name));
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
    expect(index()).toContain('Four in the right place!');
    expect(index()).toContain('in BCE, a bigger year is longer ago.');
  });

  it('the timeline book: a page read out by Index and under the book; sets not in it come first', () => {
    setUp(2, { [pageFlag('index-timeline', 'light')]: true });
    play('gentle');
    expect(screen.getByText('1 of 8 pages')).toBeInTheDocument();
    expect(screen.getByText('TRAVEL DRAWER')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Light. Read the page' }));
    expect(screen.getAllByText(SET_BY_ID.light.note, { exact: false })).toHaveLength(2);
  });

  it('a set filed again (its page in the book already) says what was learned, not “in the timeline book”', () => {
    play('gentle', 0, false);
    const job = jobFor('gentle', 0, 0);
    fileAll(job);
    expect(screen.getByRole('heading', { name: 'Light, in order!' })).toHaveAccessibleDescription(learnedLine(job));
  });

  it('through the stage: three drawers, the reward, star 1 and a Forget-Me-Knot', async () => {
    render(<MiniGameStage game="index-timeline" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s file!' }));
    await screen.findByRole('group', { name: /^The washed-up cards/ });
    const queue = roundQueue(() => false, 0);
    for (const i of [0, 1, 2]) {
      fileAll(jobFor('gentle', 0, i, queue));
      fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next drawer' : 'All filed!' }));
    }
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Three timelines filed!' })).toBeInTheDocument());
    expect(save().flags[starFlag('index-timeline', 1)]).toBe(true);
    expect(save().items.knot).toBe(defaultSave().items.knot + 1);
  });
});
