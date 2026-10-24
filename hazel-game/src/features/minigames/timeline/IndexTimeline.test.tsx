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
const { SET_BY_ID, check, clueFor, jobFor, learnedLine, roundQueue, spanAsk, spanRight, spanWords } = await import('../../../lib/minigames/timeline');
type Band = import('../../../content/minigames').PlayBand;
type Job = import('../../../lib/minigames/timeline').Job;

const addXp = vi.fn(async () => {});
const recordActivity = vi.fn(async () => {});

function setUp(level: number, flags: Record<string, boolean> = {}, age = 9) {
  localStorage.clear();
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: new Date().getFullYear() - age, birthMonth: 1, skillLevels: { history: level }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
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

describe('📜 Expert (docs/DESIGN-MINIGAMES.md §8.5): centuries, the years between, what led to what', () => {
  const many = (n: number) => n.toLocaleString('en-GB');
  /** A drawer put in order; `slip`: two cards swapped first, checked, then put right. */
  function order(job: Job, slip = false) {
    if (slip) {
      const names = job.events.map((ev) => ev.name);
      [names[3], names[4]] = [names[4], names[3]];
      for (const name of names) fireEvent.click(card(name));
      fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
      for (const ev of job.events) if (within(tray()).queryByRole('button', { name: new RegExp(`^${ev.name}`) })) fireEvent.click(card(ev.name));
    } else for (const ev of job.events) fireEvent.click(card(ev.name));
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
  }
  const years = () => within(screen.getByRole('group', { name: 'How many years?' }));

  it('seven cards dated by century or year; in order, their years out and how many years between two; a miss on the way; the reward keeps the first miss’s lesson', () => {
    const { onPage, onFinish } = play('expert');
    const queue = roundQueue(() => false, 0);
    const job = jobFor('expert', 0, 0, queue); // Light
    expect(within(tray()).getAllByRole('button')).toHaveLength(7);
    expect(card('Candles')).toHaveAccessibleName('Candles, 5th century BCE');
    expect(card('Gas street lamps')).toHaveAccessibleName('Gas street lamps, 1807');
    expect(within(card('Candles')).getByText('5th century BCE')).toBeInTheDocument();
    // Plainly, with a century's years as it starts (§8.3).
    expect(index()).toContain('The light cards are out of their drawer. Which came first? Tap the oldest card. Some give a century, not a year. The 5th century BCE is the years 500 to 401 BCE.');
    expect(box()).toBe('Which came first? Tap the oldest card. The 5th century BCE is the years 500 to 401 BCE.');
    expect(screen.getByText(/^Light: put the seven cards in order, oldest first\. A card gives its century/)).toBeInTheDocument();
    const steps = () => within(screen.getByRole('list', { name: 'Steps' })).getAllByRole('listitem');
    expect(steps().map((li) => li.textContent)).toEqual(['1Put them in order', '2Count the years', '3What led to what']);
    expect(steps()[0]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText(/Expert · No timer/)).toBeInTheDocument();

    // In order at the first check: the years come out, and the question.
    order(job);
    const head = screen.getByRole('heading', { name: 'How many years?' });
    expect(head).toHaveFocus();
    expect(steps()[1]).toHaveAttribute('aria-current', 'step');
    expect(head).toHaveAccessibleDescription(spanAsk(job));
    expect(place(2)).toHaveAccessibleName('Place 3 of 7: Candles, about 500 BCE, right');
    expect(index()).toContain(`All in order. Firelight in caves first, the first LED light last. ${spanAsk(job)}`);
    expect(onPage).not.toHaveBeenCalled();
    expect(years().getAllByRole('button').map((b) => b.textContent)).toEqual(['1,307', '2,306', '2,307']);
    expect(screen.getByText('BCE years count back to year 1; CE years count on from it.')).toBeInTheDocument();
    // The cards on the line stay put.
    fireEvent.click(place(0));
    expect(place(0)).toHaveAccessibleName('Place 1 of 7, the oldest: Firelight in caves, about 400,000 BCE, right');
    // A wrong one: what's wrong with it; pick again.
    fireEvent.click(years().getByRole('button', { name: '2,307 years' }));
    expect(index()).toContain(spanWords(job, 2307));
    expect(within(document.querySelector<HTMLElement>('[data-bar]')!).getByText(spanWords(job, 2307))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How many years?' })).toBeInTheDocument();
    fireEvent.click(years().getByRole('button', { name: `${many(spanRight(job))} years` }));
    const done = screen.getByRole('heading', { name: 'Light, in order.' });
    expect(done).toHaveFocus();
    expect(done).toHaveAccessibleDescription(`${learnedLine(job)} Light is in the timeline book.`);
    expect(learnedLine(job)).toContain(SET_BY_ID.light.led);
    expect(onPage).toHaveBeenCalledWith('light', 'Light');
    expect(index()).toContain(`${spanWords(job, spanRight(job))} Filed, with a miss on the way. Next drawer.`);
    expect(index()).not.toMatch(/!/);

    // Spot on: in order and counted at the first go.
    fireEvent.click(screen.getByRole('button', { name: 'Next drawer' }));
    const second = jobFor('expert', 0, 1, queue);
    order(second);
    fireEvent.click(years().getByRole('button', { name: `${many(spanRight(second))} years` }));
    expect(index()).toContain('That’s the drawer. Next drawer.');
    // A slip in the order costs it too: plainly, the clue with the century's years.
    fireEvent.click(screen.getByRole('button', { name: 'Next drawer' }));
    const third = jobFor('expert', 0, 2, queue);
    order(third, true);
    expect(index()).toMatch(/^(?:Old Index|Index)?.*All in order\./);
    fireEvent.click(years().getByRole('button', { name: `${many(spanRight(third))} years` }));
    expect(index()).toContain('Filed, with a miss on the way. That’s the catalog.');
    fireEvent.click(screen.getByRole('button', { name: 'Finish the round' }));
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three timelines filed!', learned: learnedLine(job), spotOn: { right: 1, of: 3 } });
  });

  it('a wrong check, plainly: how many stayed, and the clue with a century’s years', () => {
    // Every other set in the book: Medicine comes first.
    setUp(9, Object.fromEntries(['light', 'travel', 'writing', 'flight', 'food', 'music', 'buildings'].map((id) => [pageFlag('index-timeline', id), true])));
    play('expert', 0);
    const job = jobFor('expert', 0, 0, ['medicine']);
    const names = job.events.map((ev) => ev.name);
    [names[3], names[4]] = [names[4], names[3]];
    for (const name of names) fireEvent.click(card(name));
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
    const clue = 'After the microscope came the first vaccine — the 18th century is the years 1701 to 1800.';
    expect(index()).toContain(`Six in order. ${clue}`);
    expect(box()).toBe(clue);
    expect(within(tray()).getByRole('button')).toHaveAccessibleName('First vaccine, 18th century');
  });

  it('spot on every time: the last drawer’s lesson, 3 of 3', () => {
    const { onFinish } = play('expert', 1);
    const queue = roundQueue(() => false, 1);
    for (const i of [0, 1, 2]) {
      const job = jobFor('expert', 1, i, queue);
      order(job);
      fireEvent.click(years().getByRole('button', { name: `${many(spanRight(job))} years` }));
      fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next drawer' : 'Finish the round' }));
    }
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three timelines filed!', learned: learnedLine(jobFor('expert', 1, 2, queue)), spotOn: { right: 3, of: 3 } });
  });

  it('through the stage: a teen’s title card — Expert’s hello, steps and pictures', async () => {
    setUp(6, {}, 14);
    render(<MiniGameStage game="index-timeline" />);
    expect(within(screen.getByRole('group', { name: 'How tricky?' })).getByRole('button', { name: 'Expert' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/some give only a century: the 19th century is the years 1801 to 1900/)).toBeInTheDocument();
    expect(screen.getByText(/From a BCE year to a CE year, add the two, then take 1/)).toBeInTheDocument();
    expect(screen.getByText(/In order and counted right first time wins the Expert seal\. No clock\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Let’s file!' }));
    await screen.findByRole('group', { name: /^The washed-up cards: 7 to place/ });
  });
});
