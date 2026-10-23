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
const { ringAt } = await import('./hit');
const { RING_WIDTH, TREE_BY_ID, dateAsk, datedWords, fitOffset, growthWord, jobFor, learnedLine, lineUpWords, matchWords, rainfall, ringMm, ringsOf, roundQueue, weather } = await import('../../../lib/minigames/rings');
type Band = import('../../../content/minigames').PlayBand;
type Job = import('../../../lib/minigames/rings').Job;

const addXp = vi.fn(async () => {});
const recordActivity = vi.fn(async () => {});

function setUp(level: number, flags: Record<string, boolean> = {}, age = 9) {
  localStorage.clear();
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: new Date().getFullYear() - age, birthMonth: 1, skillLevels: { nature: level }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
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
/** Ringwood's bubble (the beam's rings, for a reader, are live too). */
const bubble = () => document.querySelector('[aria-live="polite"]:not(#rr-under)')?.textContent ?? '';
/** What Ringwood says, without his name. */
const said = () => bubble().replace(/^Old Ringwood/, '');
/** A ring pressed from the keyboard (a pointer's tap is the wood's: see the tap test). */
const ring = (k: number) => fireEvent.click(document.querySelector<HTMLButtonElement>(`[data-ring="${k}"]`)!);
/** A finger's tap at a point: pressed and lifted. */
function tapAt(el: Element, x: number, y = 0) {
  fireEvent.pointerDown(el, { clientX: x, clientY: y, button: 0 });
  fireEvent.pointerUp(el, { clientX: x, clientY: y, button: 0 });
}
const box = (el: Element, width: number, height = width) => {
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON() {} }) as DOMRect;
};

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
    expect(slice).toHaveAccessibleDescription('Tap the rings from the middle out — one ring, one year. 0 of 4 counted. The arrow keys move from ring to ring.');
    // Focus on the first ring, said by where it is and how it grew.
    expect(document.querySelector('[data-ring="0"]')).toHaveFocus();
    expect(document.querySelector('[data-ring="1"]')).toHaveAccessibleName('The second ring from the middle, thin');
    // Out of order: where to count next.
    ring(2);
    expect(screen.getAllByText('Count from the middle out: start with the first ring, right by the middle.')).toHaveLength(2);
    ring(0);
    expect(screen.getAllByText('One!')).toHaveLength(2);
    ring(0);
    expect(screen.getAllByText('That one’s counted already — the next is just outside it.')).toHaveLength(2);
    ring(1);
    ring(2);
    ring(3);
    // With what to do next: on a short screen nothing else says it (UX review round 2).
    expect(bubble()).toContain('Four! The last ring, right by the bark — four rings, so the tree was four years old. Now tap the widest ring — its wettest year!');
    expect(screen.getByRole('heading', { name: 'The wettest year' })).toBeInTheDocument();
    ring(1);
    expect(screen.getAllByText('That ring is thin — a dry year, when the tree hardly grew. The wet year’s ring is the widest.')).toHaveLength(2);
    ring(3);
    const head = screen.getByRole('heading', { name: 'Silver Birch!' });
    expect(head).toHaveFocus();
    expect(head).toHaveAccessibleDescription(`${learnedLine(job)} Silver Birch is in the grove book!`);
    expect(onPage).toHaveBeenCalledWith('birch', 'Silver Birch');
    // Why it's right, then his cheer (UX review round 1: the why was lost).
    expect(bubble()).toContain('Yes — the widest ring: 2019 was a wet year, so the tree grew a lot. Hrrrm! Just as I remember it. Another?');

    for (const i of [1, 2]) {
      fireEvent.click(screen.getByRole('button', { name: 'Next tree' }));
      // The next tree starts at its first ring (code review round 1: the last tree's ring kept the tab stop).
      expect(document.querySelector('[data-ring="0"]')).toHaveFocus();
      readAll(jobFor('gentle', 0, i, queue));
    }
    fireEvent.click(screen.getByRole('button', { name: 'All done!' }));
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three trees read!', learned: learnedLine(jobFor('gentle', 0, 2, queue)) });
  });

  it('a tap acts as the finger lifts — a swipe or a cancelled press taps nothing; the ring the step wants is easy to hit, however thin', () => {
    play('gentle');
    // Silver Birch, 2016–2019: rings 2.4–12.3, 12.3–17.25 (thin), 17.25–27.15 and 27.15–42 of the slice's 100; 400 px, 4 px each.
    const slice = screen.getByRole('group', { name: 'The slice, its rings from the middle out' });
    box(slice, 400);
    const at = (r: number) => 200 + r * 4;
    // A press that moves (the page scrolling), or is cancelled: nothing (code review round 1: it counted rings).
    fireEvent.pointerDown(slice, { clientX: at(10), clientY: 200, button: 0 });
    fireEvent.pointerMove(slice, { clientX: at(10), clientY: 170, button: 0 });
    fireEvent.pointerUp(slice, { clientX: at(10), clientY: 170, button: 0 });
    fireEvent.pointerDown(slice, { clientX: at(10), clientY: 200, button: 0 });
    fireEvent.pointerCancel(slice, { clientX: at(10), clientY: 200 });
    fireEvent.pointerUp(slice, { clientX: at(10), clientY: 200, button: 0 });
    expect(screen.queryByText('One!')).not.toBeInTheDocument();
    // The very middle (the pith, a dot) is the first ring's.
    tapAt(slice, 200, 200);
    expect(screen.getAllByText('One!')).toHaveLength(2);
    // A finger's tap — then the click that follows on a ring's button: one tap, not "counted already" (code review round 2).
    fireEvent.click(document.querySelector('[data-ring="0"]')!, { detail: 1 });
    expect(screen.getAllByText('One!')).toHaveLength(2);
    // The thin second ring is the one to count: a tap just past it, in the third, is it (code review round 1).
    tapAt(slice, at(18.5), 200);
    expect(screen.getAllByText('Two!')).toHaveLength(2);
    // But not back into a ring counted: the outer edge of the second, with the third to count, is the second.
    tapAt(slice, at(16.8), 200);
    expect(screen.getAllByText('That one’s counted already — the next is just outside it.')).toHaveLength(2);
    // Each ring's button sits where a press is that ring, whatever the step wants (code review round 2: the first's was
    // the second's, for a reader whose press is a tap there).
    const ends = Array.from(slice.querySelectorAll('circle[data-band]')).map((c) => Number(c.getAttribute('r'))).reverse();
    const hit = ends.map((to, k) => ({ from: k ? ends[k - 1] : 0, to }));
    slice.querySelectorAll<HTMLButtonElement>('[data-ring]').forEach((b, k) => {
      const r = 50 - parseFloat(b.style.top);
      for (const want of [() => false, (j: number) => (j === k + 1 ? ('out' as const) : false), (j: number) => j === k - 1 || j === k + 1]) expect(ringAt(r, hit, 0.25, want, 14), `ring ${k}`).toBe(k);
    });
    // A corner, far past the bark: nothing.
    tapAt(slice, 2, 2);
    expect(screen.getAllByText('That one’s counted already — the next is just outside it.')).toHaveLength(2);
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
    const core = screen.getByRole('group', { name: 'The core, its rings out to the bark' });
    const bark = job.rings[job.rings.length - 1];
    expect(within(core).getAllByRole('button').at(-1)).toHaveAccessibleName(new RegExp(`^The ring by the bark, \\w+: ${bark}$`));
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
    // The next tree starts at its bark ring.
    fireEvent.click(screen.getByRole('button', { name: 'Next tree' }));
    expect(within(screen.getByRole('group', { name: 'The core, its rings out to the bark' })).getAllByRole('button').at(-1)).toHaveFocus();
  });

  it('Medium, by a finger: the rings measured inside the core’s border; a press and its click are one tap', () => {
    setUp(5);
    play('medium');
    const job = jobFor('medium', 0, 0, roundQueue('medium', () => false, 0));
    if (job.kind !== 'date') throw new Error('a date job');
    expect(job.rings).toEqual([2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023]); // 21 units: 2017 is 7–8, 2022 17–18
    const core = screen.getByRole('group', { name: 'The core, its rings out to the bark' });
    // 346 px with a 3 px border: the rings in 340 (code review round 1: measured over 346, a thin ring's edge was its neighbour's).
    box(core, 346, 96);
    Object.defineProperty(core, 'clientLeft', { value: 3 });
    Object.defineProperty(core, 'clientWidth', { value: 340 });
    const px = (u: number) => 3 + (u / 21) * 340;
    tapAt(core, px(17.5));
    expect(screen.getAllByText(/^That ring is 2022: /)).toHaveLength(2);
    tapAt(core, px(5.5)); // 2016, the bridge
    expect(screen.getByRole('heading', { name: 'The dry years' })).toBeInTheDocument();
    // A finger's tap on 2017 — then the click that follows on its button: one tap, not two ("found already").
    const k = job.rings.indexOf(2017);
    tapAt(core, px(7.5));
    fireEvent.click(document.querySelector(`[data-ring="${k}"]`)!, { detail: 1 });
    expect(screen.getAllByText('2017 — a dry year! One more to find.')).toHaveLength(2);
    // Just past the thin 2022, in 2023: the dry year still to find (it's what the step wants).
    tapAt(core, px(18.4));
    expect(screen.getByRole('heading', { name: 'Old Oak!' })).toBeInTheDocument();
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
    expect(screen.getAllByText(matchWords(job, 0))).toHaveLength(2);
    // As it slides, a reader hears what's under the beam (UX review round 1: nothing changed for a reader).
    expect(document.getElementById('rr-under')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Slide the beam');
    fireEvent.click(screen.getByRole('button', { name: 'Slide ▶' }));
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Check the match');
    // A tap along the tree's core brings the beam's middle under it (UX review round 1: up to 19 presses).
    const svg = document.querySelector('[aria-label^="Two cores"] svg')!;
    const units = job.rings.reduce((a, y) => a + RING_WIDTH[weather(y)], 0);
    box(svg, units * 10, 136);
    const k = fitOffset(job) + Math.floor(job.beam.length / 2);
    const mid = job.rings.slice(0, k).reduce((a, y) => a + RING_WIDTH[weather(y)], 0) + RING_WIDTH[weather(job.rings[k])] / 2;
    // At either end, it stops there (code review round 2).
    tapAt(svg, 1, 20);
    expect(screen.getByRole('button', { name: '◀ Slide' })).toHaveAttribute('aria-disabled', 'true');
    tapAt(svg, units * 10 - 1, 20);
    expect(screen.getByRole('button', { name: 'Slide ▶' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Do they match?' }));
    const notYet = bubble();
    // A tap where it is already: nothing changes, what Ringwood said stays.
    tapAt(svg, units * 10 - 1, 20);
    expect(bubble()).toBe(notYet);
    tapAt(svg, mid * 10, 20);
    expect(screen.getByRole('button', { name: 'Slide ▶' })).toHaveAccessibleDescription(`The beam’s rings: ${job.beam.map(growthWord).join(', ')}. The tree’s rings above them: ${job.beam.map(growthWord).join(', ')}.`);
    fireEvent.click(screen.getByRole('button', { name: 'Do they match?' }));
    const end = job.beam[job.beam.length - 1];
    // The beam's year, not the living tree's name (UX review round 2).
    expect(screen.getByRole('heading', { name: `Cut in ${end}!` })).toHaveAccessibleDescription(new RegExp(`was cut in ${end}\\.`));
    expect(screen.getByText(`The beam: ${job.beam[0]}–${end}`)).toBeInTheDocument();
    expect(bubble()).toMatch(/They match! .+ Hrrrm! Just as I remember it\. Another\?$/);
  });

  it('Expert: the beam’s measured rings slid along the rainfall record — a wrong place says what’s wrong; lined up, dated from four; spot on 2 of 3, the missed beam’s lesson', () => {
    setUp(6, {}, 14);
    const { onFinish } = play('expert');
    const queue = roundQueue('expert', () => false, 0);
    const [first, second, third] = [0, 1, 2].map((i) => jobFor('expert', 0, i, queue));
    if (first.kind !== 'rain' || second.kind !== 'rain' || third.kind !== 'rain') throw new Error('rain jobs');
    const end = first.beam[first.beam.length - 1];
    expect(screen.getByRole('heading', { name: 'Line it up' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Line it up' })).toHaveAccessibleDescription(
      'A silver birch beam from the old mill, its rings measured, and the grove’s rainfall record from 1995. Slide the beam till its thin rings sit under the dry years, then date its last ring.',
    );
    expect(said()).toBe('An old beam, its rings measured, and the grove’s rainfall record. Slide the beam till its thin rings sit under the dry years.');
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Line it up');
    // The record: a bar a year, the dry line; the years every fifth; the beam's years not given till it's dated.
    const record = screen.getByRole('group', { name: /^The grove’s rainfall record/ });
    expect(record.querySelectorAll('rect[data-year]')).toHaveLength(30);
    expect(within(record).getByText('dry: under 500')).toBeInTheDocument();
    expect(['1995', '2000', '2005', '2010', '2015', '2020'].every((y) => within(record).queryByText(y))).toBe(true);
    expect(within(record).getByText('The beam’s rings, mm')).toBeInTheDocument();
    // A reader hears the rings' widths and the rain over them, and where the beam is on the record.
    expect(screen.getByRole('button', { name: 'Slide ▶' })).toHaveAccessibleDescription(
      `The beam’s rings, mm: ${first.beam.map(ringMm).join(', ')}. The rain above them, mm: ${first.rings.slice(0, 10).map(rainfall).join(', ')}. The record runs from 1995 to 2024; the beam’s first ring is under its year 1.`,
    );
    // Checked in the wrong place: what's wrong and one thing to try — and the seal's gone for this beam.
    fireEvent.click(screen.getByRole('button', { name: 'Do they line up?' }));
    expect(said()).toBe(lineUpWords(first, 0));
    for (let k = 0; k < fitOffset(first); k++) fireEvent.click(screen.getByRole('button', { name: 'Slide ▶' }));
    fireEvent.click(screen.getByRole('button', { name: 'Do they line up?' }));
    expect(screen.getByRole('heading', { name: 'Date it' })).toHaveFocus();
    expect(said()).toBe(`They line up: every thin ring sits under a dry year, every wide one under a wet year. ${dateAsk}`);
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Date it');
    const years = within(screen.getByRole('group', { name: 'Date it' }));
    expect(years.getAllByRole('button').map((b) => b.textContent)).toEqual(['1996', '2004', '2005', '2006']);
    fireEvent.click(years.getByRole('button', { name: '2004' }));
    expect(said()).toBe(datedWords(first, 2004));
    fireEvent.click(years.getByRole('button', { name: String(end) }));
    expect(screen.getByRole('heading', { name: `Cut in ${end}` })).toHaveAccessibleDescription(`${learnedLine(first)} Silver Birch is in the grove book.`);
    expect(screen.getByText(`The beam’s rings, mm: 1996–${end}`)).toBeInTheDocument();
    // Plain, and not "Right." after a miss.
    expect(said()).toBe(`${datedWords(first, end)} Dated, with a miss on the way. Next beam.`);
    fireEvent.click(screen.getByRole('button', { name: 'Next beam' }));

    // The next two right first time.
    for (const job of [second, third]) {
      if (job.kind !== 'rain') throw new Error('a rain job');
      expect(screen.getByRole('heading', { name: 'Line it up' })).toBeInTheDocument();
      for (let k = 0; k < fitOffset(job); k++) fireEvent.click(screen.getByRole('button', { name: 'Slide ▶' }));
      fireEvent.click(screen.getByRole('button', { name: 'Do they line up?' }));
      fireEvent.click(screen.getByRole('button', { name: String(job.beam[job.beam.length - 1]) }));
      expect(bubble()).toMatch(job === second ? /That’s the year\. Next beam\.$/ : /Right\. That’s all three\.$/);
      fireEvent.click(screen.getByRole('button', { name: job === second ? 'Next beam' : 'All done' }));
    }
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ spotOn: { right: 2, of: 3 }, learned: learnedLine(first) }));
  });

  it('Expert, through the stage: offered at 14; its own hello and steps', () => {
    setUp(6, {}, 14);
    render(<MiniGameStage game="ringwoods-rings" />);
    const bands = within(screen.getByRole('group', { name: 'How tricky?' }));
    expect(bands.getAllByRole('button').map((b) => b.textContent)).toEqual(['Gentle', 'Medium', 'Tricky', 'Expert']);
    expect(bands.getByRole('button', { name: 'Expert' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/I keep a rainfall record now, a bar a year/)).toBeInTheDocument();
    expect(screen.getByText(/Every beam lined up and dated first time wins the Expert seal\. No clock\./)).toBeInTheDocument();
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
