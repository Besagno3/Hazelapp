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
const { default: RingwoodsRings } = await import('./RingwoodsRings');
const { useSaveStore } = await import('../../../store/saveStore');
const { useProfileStore } = await import('../../../store/profileStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES, pageFlag, starFlag } = await import('../../../content/minigames');
const { TREE_BY_ID, fitOffset, jobFor, learnedLine, ringsOf, roundQueue, weather } = await import('../../../lib/minigames/rings');
type Band = import('../../../content/minigames').Band;
type Job = import('../../../lib/minigames/rings').Job;

const addXp = vi.fn(async () => {});
const recordActivity = vi.fn(async () => {});

function setUp(level: number, flags: Record<string, boolean> = {}) {
  localStorage.clear();
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: new Date().getFullYear() - 9, birthMonth: 1, skillLevels: { nature: level }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
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
const lyra = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';
/** A ring pressed from the keyboard (a pointer's tap is the wood's: see the tap test). */
const ring = (k: number) => fireEvent.click(document.querySelector<HTMLButtonElement>(`[data-ring="${k}"]`)!);

function play(band: Band, round = 0, page = true) {
  const onPage = vi.fn(() => page);
  const onFinish = vi.fn();
  render(<RingwoodsRings def={MINIGAMES['ringwoods-rings']} band={band} round={round} onPage={onPage} onFinish={onFinish} />);
  return { onPage, onFinish };
}

/** A job read right through. */
function readAll(job: Job) {
  if (job.kind === 'count') {
    job.rings.forEach((_, k) => ring(k));
    ring(job.rings.findIndex((y) => weather(y) === 'wet'));
  } else if (job.kind === 'date') {
    ring(job.rings.indexOf(job.event.year));
    for (const y of ringsOf(job.rings, 'dry')) ring(job.rings.indexOf(y));
  } else {
    for (let k = 0; k < fitOffset(job); k++) fireEvent.click(screen.getByRole('button', { name: 'Slide ▶' }));
    fireEvent.click(screen.getByRole('button', { name: 'Do they match?' }));
  }
}

describe('🌳 the title card', () => {
  it('names the game, Ringwood’s hello and the grove book', () => {
    render(<MiniGameStage game="ringwoods-rings" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Ringwood’s Rings' })).toBeInTheDocument();
    expect(screen.getByText('Grove book: 0 of 8')).toBeInTheDocument();
    expect(screen.getByText(/I keep losing count of my rings/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Let’s count!' })).toHaveFocus();
  });
});

describe('🌳 Ringwood’s Rings, a round (docs/DESIGN-MINIGAMES.md §5.7)', () => {
  it('Gentle: count the slice from the middle out — a slip says where; the wettest year; its page; three, then the round', () => {
    const { onPage, onFinish } = play('gentle');
    const queue = roundQueue('gentle', () => false, 0);
    const job = jobFor('gentle', 0, 0, queue); // Silver Birch, 2016–2019
    expect(job.kind).toBe('count');
    if (job.kind !== 'count') return;
    const slice = screen.getByRole('group', { name: 'The slice, its rings from the middle out' });
    expect(slice).toHaveAccessibleDescription('Tap the rings from the middle out — one ring, one year. 0 of 4 counted.');
    // Focus on the first ring, said by where it is and how it grew.
    expect(document.querySelector('[data-ring="0"]')).toHaveFocus();
    expect(document.querySelector('[data-ring="1"]')).toHaveAccessibleName('The second ring from the middle, thin');
    // Out of order: where to count next.
    ring(2);
    expect(screen.getAllByText('Count from the middle out: the next ring is the first, just outside the last one counted.')).toHaveLength(2);
    ring(0);
    expect(screen.getAllByText('One!')).toHaveLength(2);
    ring(0);
    expect(screen.getAllByText('That one’s counted already — the next is just outside it.')).toHaveLength(2);
    ring(1);
    ring(2);
    ring(3);
    expect(lyra()).toContain('Four! That’s the bark — four rings, so the tree was four years old.');
    expect(screen.getByRole('heading', { name: 'The wettest year' })).toBeInTheDocument();
    ring(1);
    expect(screen.getAllByText('That ring is thin — a dry year, when the tree hardly grew. The wet year’s ring is the widest.')).toHaveLength(2);
    ring(3);
    const head = screen.getByRole('heading', { name: 'Silver Birch!' });
    expect(head).toHaveFocus();
    expect(head).toHaveAccessibleDescription(`${learnedLine(job)} Silver Birch is in the grove book!`);
    expect(onPage).toHaveBeenCalledWith('birch', 'Silver Birch');
    expect(lyra()).toContain('Hrrrm! Just as I remember it. Another?');

    for (const i of [1, 2]) {
      fireEvent.click(screen.getByRole('button', { name: 'Next tree' }));
      readAll(jobFor('gentle', 0, i, queue));
    }
    fireEvent.click(screen.getByRole('button', { name: 'All done!' }));
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three trees read!', learned: learnedLine(jobFor('gentle', 0, 2, queue)) });
  });

  it('a tap anywhere near a ring is that ring, however thin; far outside the bark, nothing', () => {
    play('gentle');
    const slice = screen.getByRole('group', { name: 'The slice, its rings from the middle out' });
    slice.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect;
    // Just outside the middle (radius 7 of 100, the slice 400 px): the first ring.
    fireEvent.pointerDown(slice, { clientX: 200 + 4 * 9, clientY: 200, button: 0 });
    expect(screen.getAllByText('One!')).toHaveLength(2);
    // A corner, far past the bark: nothing.
    fireEvent.pointerDown(slice, { clientX: 2, clientY: 2, button: 0 });
    expect(screen.getAllByText('One!')).toHaveLength(2);
    // The arrow keys move out and in.
    const first = document.querySelector<HTMLButtonElement>('[data-ring="0"]')!;
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.querySelector('[data-ring="1"]')).toHaveFocus();
  });

  it('Medium: a core — the year counted back from the bark (a miss says which way), then every dry year', () => {
    setUp(5);
    play('medium');
    const job = jobFor('medium', 0, 0, roundQueue('medium', () => false, 0));
    if (job.kind !== 'date') throw new Error('a date job');
    const core = screen.getByRole('group', { name: 'The core, from the middle to the bark' });
    const bark = job.rings[job.rings.length - 1];
    expect(within(core).getAllByRole('button').at(-1)).toHaveAccessibleName(new RegExp(`^The bark ring, \\w+: ${bark}$`));
    expect(within(core).getAllByRole('button').at(-1)).toHaveFocus();
    const k = job.rings.indexOf(job.event.year);
    ring(k + 1);
    expect(screen.getAllByText(new RegExp(`${job.event.year} is further in\\.$`))).toHaveLength(2);
    ring(k);
    expect(screen.getAllByText(new RegExp(`^Yes — ${job.event.year}: `))).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'The dry years' })).toBeInTheDocument();
    const dry = ringsOf(job.rings, 'dry');
    const notDry = job.rings.findIndex((y) => weather(y) !== 'dry' && y !== job.event.year);
    ring(notDry);
    expect(screen.getAllByText(/isn’t thin — not a dry year/)).toHaveLength(2);
    ring(job.rings.indexOf(dry[0]));
    ring(job.rings.indexOf(dry[0]));
    expect(screen.getAllByText(new RegExp(`^${dry[0]} is found already`))).toHaveLength(2);
    for (const y of dry.slice(1)) ring(job.rings.indexOf(y));
    expect(screen.getByRole('heading', { name: `${TREE_BY_ID[job.tree].name}!` })).toHaveAccessibleDescription(new RegExp(`its thin rings were dry years — ${dry.length > 1 ? `${dry.slice(0, -1).join(', ')} and ${dry[dry.length - 1]}` : dry[0]}\\.`));
  });

  it('Tricky: slide the beam — a wrong place says to look at the thin rings — till it matches; the year it was cut', () => {
    setUp(9);
    play('tricky');
    const job = jobFor('tricky', 0, 0, roundQueue('tricky', () => false, 0));
    if (job.kind !== 'match') throw new Error('a match job');
    expect(screen.getByRole('heading', { name: 'Match the rings' })).toHaveFocus();
    expect(screen.getByRole('button', { name: '◀ Slide' })).toHaveAttribute('aria-disabled', 'true');
    // A reader hears both sets of rings.
    expect(screen.getByRole('button', { name: 'Slide ▶' })).toHaveAccessibleDescription(/^The beam’s rings: .+\. The tree’s rings above them: .+\.$/);
    fireEvent.click(screen.getByRole('button', { name: 'Do they match?' }));
    expect(screen.getAllByText('Not yet — look at the thin dark rings: do the beam’s sit right under the tree’s?')).toHaveLength(2);
    readAll(job);
    const end = job.beam[job.beam.length - 1];
    expect(screen.getByRole('heading', { name: `${TREE_BY_ID[job.tree].name}!` })).toHaveAccessibleDescription(new RegExp(`was cut in ${end}\\.`));
    expect(screen.getByText(`The beam: ${job.beam[0]}–${end}`)).toBeInTheDocument();
  });

  it('the grove book: a page read out by Ringwood and under the book; trees not in it come first', () => {
    setUp(2, { [pageFlag('ringwoods-rings', 'birch')]: true });
    play('gentle');
    expect(screen.getByText('1 of 8 pages')).toBeInTheDocument();
    expect(screen.getByText('WEEPING WILLOW')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Silver Birch. Read the page' }));
    expect(screen.getAllByText(/its tiny seeds fly far on the wind/)).toHaveLength(2);
  });

  it('a tree read again (its page in the book already) says what was learned, not “in the grove book”', () => {
    play('gentle', 0, false);
    const job = jobFor('gentle', 0, 0);
    readAll(job);
    expect(screen.getByRole('heading', { name: 'Silver Birch!' })).toHaveAccessibleDescription(learnedLine(job));
  });

  it('through the stage: three trees, the reward, star 1 and a Lucky Clover', async () => {
    render(<MiniGameStage game="ringwoods-rings" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s count!' }));
    await screen.findByRole('group', { name: 'The slice, its rings from the middle out' });
    const queue = roundQueue('gentle', () => false, 0);
    for (const i of [0, 1, 2]) {
      readAll(jobFor('gentle', 0, i, queue));
      fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next tree' : 'All done!' }));
    }
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Three trees read!' })).toBeInTheDocument());
    expect(save().flags[starFlag('ringwoods-rings', 1)]).toBe(true);
    expect(save().items.clover).toBe(defaultSave().items.clover + 1);
  });
});
