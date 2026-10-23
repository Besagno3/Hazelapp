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
const { SET_BY_ID, check, clueFor, jobFor, learnedLine, roundQueue } = await import('../../../lib/minigames/timeline');
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
// The step's box, by the timeline: what Index said, or the last check's clue, or what to do now.
const box = () => document.querySelector('[data-bar] p.min-h-\\[5\\.25rem\\]')?.textContent ?? '';
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
  it('Gentle: each card tapped goes in the next place, oldest first; a check keeps the longest run in order, each card in its place, and sends the rest back with a clue; in order → its page; three, then the round', () => {
    const { onPage, onFinish } = play('gentle');
    const queue = roundQueue(() => false, 0);
    const job = jobFor('gentle', 0, 0, queue); // Light: firelight, gas lamps, LEDs
    expect(job.events.map((ev) => ev.name)).toEqual(['Firelight in caves', 'Gas street lamps', 'First LED light']);
    // Focus on the washed-up cards — no card lit as if it were the answer (UX review round 1), and a Tab goes to the first
    // (UX and code review round 2); no years on Gentle's cards.
    expect(tray()).toHaveFocus();
    expect(tray()).toHaveAccessibleDescription(/^Tap the cards in the order they happened, oldest first/);
    expect(card('First LED light')).toHaveAccessibleName('First LED light');
    expect(place(0)).toHaveAccessibleName('Place 1 of 3, the oldest, empty, next');
    expect(index()).toContain('Which came first? Tap the oldest card.');
    // Check waits till every card's placed.
    expect(screen.getByRole('button', { name: 'Check the order' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
    expect(index()).toContain('Every card on the timeline first — 3 still to place.');

    // Gas lamps first, firelight second (wrong); the LED last (right). Each landing is said (a reader hears it), and what's
    // next names the card before it (UX review round 2: "the card that came after" — after what?).
    fireEvent.click(card('Gas street lamps'));
    expect(place(0)).toHaveAccessibleName('Place 1 of 3, the oldest: Gas street lamps');
    expect(place(1)).toHaveAccessibleName('Place 2 of 3, empty, next');
    expect(index()).toContain('Gas street lamps: place 1 of 3. What came after gas street lamps? Tap that card.');
    fireEvent.click(card('Firelight in caves'));
    fireEvent.click(card('First LED light'));
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
    const clue = 'Oldest of these: firelight in caves — people have lit the dark with fire for hundreds of thousands of years.';
    // Index says how many stayed; the box by the timeline just the clue — the ticks show how many (UX review round 2).
    expect(index()).toContain(`Two in order! ${clue}`);
    expect(box()).toBe(clue);
    // The gas lamps and the LED, in order, stay — the gas lamps to their own place; firelight's back with the washed-up
    // cards; the next place marked.
    expect(place(1)).toHaveAccessibleName('Place 2 of 3: Gas street lamps, right');
    expect(place(2)).toHaveAccessibleName('Place 3 of 3, the newest: First LED light, right');
    expect(place(0)).toHaveAccessibleName('Place 1 of 3, the oldest, empty, next');
    expect(within(tray()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Firelight in caves']);
    fireEvent.click(place(2));
    expect(index()).toContain('First LED light is in its right place — it stays.');
    expect(box()).toBe('First LED light is in its right place — it stays.');

    // The next card fills the empty place; the clue's back by the timeline till the next check (code review round 2).
    fireEvent.click(card('Firelight in caves'));
    expect(box()).toBe(clue);
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
    const head = screen.getByRole('heading', { name: 'Light, in order!' });
    expect(head).toHaveFocus();
    expect(head).toHaveAccessibleDescription(`${learnedLine(job)} Light is in the timeline book!`);
    expect(onPage).toHaveBeenCalledWith('light', 'Light');
    // The years come out once it's filed.
    // The years come out once it's filed — "years ago" where the cards had none (UX review round 1).
    expect(place(0)).toHaveAccessibleName('Place 1 of 3, the oldest: Firelight in caves, about 400,000 years ago, right');
    expect(index()).toContain('Filed! In order! Ah… Bh… CHOO! Another drawer?');

    for (const i of [1, 2]) {
      fireEvent.click(screen.getByRole('button', { name: 'Next drawer' }));
      fileAll(jobFor('gentle', 0, i, queue));
    }
    fireEvent.click(screen.getByRole('button', { name: 'All filed!' }));
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three timelines filed!', learned: learnedLine(jobFor('gentle', 0, 2, queue)) });
  });

  it('a card on the line tapped comes back to the washed-up cards (its place fills next); an empty place says how', () => {
    play('gentle');
    fireEvent.click(place(1));
    expect(index()).toContain('Tap a washed-up card — it goes in the next empty place.');
    fireEvent.click(card('Gas street lamps'));
    fireEvent.click(card('First LED light'));
    fireEvent.click(place(0));
    expect(index()).toContain('Gas street lamps is back with the washed-up cards.');
    expect(place(0)).toHaveAccessibleName('Place 1 of 3, the oldest, empty, next');
    expect(card('Gas street lamps')).toBeInTheDocument();
    // The next card goes in the first empty place: the one just emptied.
    fireEvent.click(card('Firelight in caves'));
    expect(place(0)).toHaveAccessibleName('Place 1 of 3, the oldest: Firelight in caves');
    expect(place(1)).toHaveAccessibleName('Place 2 of 3: First LED light');
  });

  it('the same words again are read again: an empty place tapped twice (code review round 2)', () => {
    play('gentle');
    fireEvent.click(place(1));
    const once = index();
    fireEvent.click(place(1));
    expect(index()).not.toBe(once);
    expect(index().replace(/\u200b/g, '')).toBe(once.replace(/\u200b/g, ''));
  });

  it('Medium: the oldest put last — the rest stay in order, each in its place, and the oldest goes back (UX review round 2)', () => {
    setUp(5);
    play('medium');
    const job = jobFor('medium', 0, 0, roundQueue(() => false, 0));
    for (const ev of [...job.events.slice(1), job.events[0]]) fireEvent.click(card(ev.name));
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
    expect(index()).toContain(`Four in order! ${clueFor(job, check(job, [...job.events.slice(1), job.events[0]].map((ev) => ev.id)))}`);
    expect(box()).toMatch(/^Oldest of these: /);
    for (let k = 1; k < 5; k++) expect(place(k)).toHaveAccessibleName(new RegExp(`^Place ${k + 1} of 5.*: ${job.events[k].name}, right$`));
    expect(place(0)).toHaveAccessibleName('Place 1 of 5, the oldest, empty, next');
    expect(within(tray()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([job.events[0].name]);
    expect(index()).not.toContain('What came after');
  });

  it('the line holds every card’s face unseen, and a card placed leaves its face unseen in the tray — so nothing moves; long words breakable (code and UX review round 2)', () => {
    play('gentle');
    const job = jobFor('gentle', 0, 0);
    fireEvent.click(card(job.events[0].name));
    // A face's name, its long words breakable (a soft hyphen: "Fire­light").
    const said = (el: Element | null) => el?.textContent?.replace(/\u00ad/g, '');
    const named = (name: string) => (_: string, el: Element | null) => !!el && said(el) === name && !Array.from(el.children).some((c) => said(c) === name);
    expect(within(tray()).getByText(named(job.events[0].name)).textContent).toBe('Fire\u00adlight in caves');
    // Its spot in the tray: the card's face, unseen, not read out.
    expect(within(tray()).getByText(named(job.events[0].name)).closest('[aria-hidden="true"]')).not.toBeNull();
    // Each place: every card's face, none read out (a place's name says what's on it).
    for (let k = 0; k < job.events.length; k++)
      for (const ev of job.events) expect(within(place(k)).getByText(named(ev.name)).closest('[aria-hidden="true"]'), `${k} ${ev.id}`).not.toBeNull();
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
    // Its years said as it starts, where a kid sees them (UX review round 1).
    expect(index()).toContain('BCE means before year 1: the bigger the BCE number, the longer ago.');
    // Swap the second and third (both BCE): five stay in order, and the clue counts the years down.
    const order = job.events.map((ev) => ev.name);
    [order[1], order[2]] = [order[2], order[1]];
    for (const name of order) fireEvent.click(card(name));
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
    expect(index()).toContain('Five in order! After firelight in caves came stone oil lamps — in BCE, a bigger year is longer ago.');
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
