import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// Reduced motion: no zoom and no spinning, so a round plays straight through.
// The main tests stand in an always-ready wait (a step's buttons wait a moment as it starts — ClocktowerGears.taps.test).
vi.mock('../useSettled', () => ({ useSettled: () => () => true, SETTLE_MS: 450 }));
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
const { default: ClocktowerGears } = await import('./ClocktowerGears');
const { useSaveStore } = await import('../../../store/saveStore');
const { useProfileStore } = await import('../../../store/profileStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES, pageFlag, starFlag } = await import('../../../content/minigames');
const { MINIGAME_PAGE_XP } = await import('../../../content/items');
const { MACHINE_IDS, boardBox, jobFor, learnedLine, roundQueue, run, solve } = await import('../../../lib/minigames/gears');
type GearJob = import('../../../lib/minigames/gears').Job;

const addXp = vi.fn(async () => {});
const recordActivity = vi.fn(async () => {});

function setUp(level: number, flags: Record<string, boolean> = {}) {
  localStorage.clear();
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: new Date().getFullYear() - 9, birthMonth: 1, skillLevels: { engineering: level }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
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
const peg = (name: RegExp) => screen.getByRole('button', { name });
const board = () => screen.getByRole('group', { name: /^The gear board/ });
const turnCrank = () => fireEvent.click(screen.getByRole('button', { name: 'Turn the crank ↻' }));

async function open() {
  render(<MiniGameStage game="clocktower-gears" />);
  fireEvent.click(screen.getByRole('button', { name: 'Let’s tinker!' }));
  await screen.findByRole('group', { name: /^The gear board/ });
}

/** Plays a band's game on its own, at a round. */
function play(band: 'gentle' | 'medium' | 'tricky' | 'expert', round = 0) {
  const onPage = vi.fn(() => true);
  const onFinish = vi.fn();
  render(<ClocktowerGears def={MINIGAMES['clocktower-gears']} band={band} round={round} onPage={onPage} onFinish={onFinish} />);
  return { onPage, onFinish };
}

/** Puts a gear on each named peg (or takes it off). */
function place(...names: RegExp[]) {
  for (const n of names) fireEvent.click(peg(n));
}

describe('⚙️ the title card', () => {
  it('names the game, Tock’s hello and the Machine Book; how to play is tap, join, turn', () => {
    render(<MiniGameStage game="clocktower-gears" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Clocktower Gears' })).toBeInTheDocument();
    expect(screen.getByText('Machine Book: 0 of 9')).toBeInTheDocument();
    expect(screen.getAllByText(/Tap a peg/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Join them up/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Let’s tinker!' })).toHaveFocus();
    // The second step's picture: three gears joined.
    expect(document.querySelectorAll('#mg-how li')[1].querySelectorAll('g[transform^="translate"]')).toHaveLength(3);
  });

  it('on Expert, the second step is picking the crank’s gear: a big gear turning a small one (code review round 2: untested)', () => {
    useProfileStore.setState({
      profile: { id: 'kid-1', birthYear: new Date().getFullYear() - 14, birthMonth: 1, skillLevels: { engineering: 6 }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
    });
    render(<MiniGameStage game="clocktower-gears" />);
    expect(within(screen.getByRole('group', { name: 'How tricky?' })).getByRole('button', { name: 'Expert' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText(/Pick the crank’s gear/).length).toBeGreaterThan(0);
    expect(document.querySelectorAll('#mg-how li')[1].querySelectorAll('g[transform^="translate"]')).toHaveLength(2);
  });
});

describe('⚙️ Clocktower Gears, a whole round (docs/DESIGN-MINIGAMES.md §5.3)', () => {
  it('Gentle: a gap is said back, a full train turns it; three machines, then the reward', async () => {
    await open();
    // Focus starts on the crank's peg — the pegs come first (review round 1); the board is described by the job.
    await waitFor(() => expect(peg(/^Middle row, peg 1:/)).toHaveFocus());
    expect(board()).toHaveAccessibleDescription('Join the crank to the Great Hands so it turns.');
    // Nothing on: the crank waits. No crank gear to pick on Gentle.
    expect(screen.getByRole('button', { name: 'Put a gear on first' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('group', { name: 'The crank’s gear' })).toBeNull();

    // The middle row: the crank's peg, one more, and the machine's — a gap.
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Middle row, peg 4:/);
    expect(screen.getByText('Three gears on the pegs.')).toBeInTheDocument();
    turnCrank();
    expect(screen.getByRole('heading', { name: 'Not joined yet' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Not joined yet' })).toHaveAccessibleDescription(/don’t reach the Great Hands yet/);
    // Each peg says what its gear did (review round 1).
    expect(peg(/^Middle row, peg 1:/)).toHaveAccessibleName('Middle row, peg 1: a gear, turning anticlockwise ↺. Take it off. Touches the crank and middle row peg 2.');
    expect(peg(/^Middle row, peg 4:/)).toHaveAccessibleName('Middle row, peg 4: a gear, not turning. Take it off. Touches middle row peg 3 and the Great Hands.');
    expect(save().flags[pageFlag('clocktower-gears', 'hands')]).toBeUndefined();

    // Fill the gap: it works, and teaches.
    fireEvent.click(screen.getByRole('button', { name: 'Change the gears' }));
    expect(peg(/^Middle row, peg 1:/)).toHaveFocus();
    place(/^Middle row, peg 3:/);
    turnCrank();
    expect(screen.getByRole('heading', { name: 'It works!' })).toHaveFocus();
    expect(screen.getByText(/Four gears, each turning the other way from the one before — so the Great Hands turned anticlockwise ↺\. The Great Hands is in your book!/)).toBeInTheDocument();
    // With reduced motion nothing spins or shakes; the arrows still say which way.
    expect(board().querySelectorAll('.animate-spin, .cg-shake')).toHaveLength(0);
    expect(board().querySelectorAll('[data-arrow="cw"], [data-arrow="ccw"]').length).toBeGreaterThan(0);
    expect(screen.getByText(/^Tick… TOCK!/)).toBeInTheDocument();
    expect(save().flags[pageFlag('clocktower-gears', 'hands')]).toBe(true);
    expect(addXp).toHaveBeenLastCalledWith(MINIGAME_PAGE_XP);
    // A machine that runs is done: its pegs are locked.
    const locked = peg(/^Middle row, peg 2:/);
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(locked).toHaveAttribute('tabindex', '-1');
    fireEvent.click(locked);
    expect(peg(/^Middle row, peg 2:/)).toHaveAccessibleName(/a gear, turning/);

    // Two more machines, by the top row then the bottom.
    fireEvent.click(screen.getByRole('button', { name: 'Next machine' }));
    expect(await screen.findByText('Machine 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('No gears on the pegs yet.')).toBeInTheDocument();
    place(/^Middle row, peg 1:/, /^Top row, peg 1:/, /^Top row, peg 2:/, /^Top row, peg 3:/, /^Middle row, peg 2:/);
    turnCrank();
    expect(screen.getByRole('heading', { name: 'It works!' })).toBeInTheDocument();
    expect(screen.getByText(/^Splendid!/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next machine' }));
    await screen.findByText('Machine 3 of 3');
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Bottom row, peg 1:/, /^Bottom row, peg 2:/, /^Middle row, peg 3:/);
    turnCrank();
    fireEvent.click(screen.getByRole('button', { name: 'Next — that’s the last one!' }));

    expect(screen.getByRole('heading', { level: 1, name: 'The Clocktower ticks again!' })).toHaveFocus();
    // The reward keeps the round's last lesson.
    expect(screen.getByText('Five gears, each turning the other way from the one before — so the Cuckoo Door turned clockwise ↻.')).toBeInTheDocument();
    expect(save().flags[starFlag('clocktower-gears', 1)]).toBe(true);
    expect(save().items.spark).toBe(defaultSave().items.spark + 1);
  });

  it('a peg works from the keyboard — once for a held key — and a tap after a run keeps focus on the board (review round 1)', async () => {
    play('gentle');
    const p = peg(/^Middle row, peg 1:/);
    expect(p).toHaveAccessibleName('Middle row, peg 1: empty. Put a gear on. Touches the crank and middle row peg 2.');
    // Space doesn't scroll the page: it's taken.
    expect(fireEvent.keyDown(p, { key: ' ' })).toBe(false);
    expect(peg(/^Middle row, peg 1:/)).toHaveAccessibleName(/^Middle row, peg 1: a gear\./);
    fireEvent.keyDown(peg(/^Middle row, peg 1:/), { key: 'Enter', repeat: true });
    expect(screen.getByText('One gear on the pegs.')).toBeInTheDocument();
    fireEvent.keyDown(peg(/^Middle row, peg 1:/), { key: 'Enter' });
    expect(screen.getByText('No gears on the pegs yet.')).toBeInTheDocument();
    // The machine's peg touches the machine.
    expect(peg(/^Middle row, peg 4:/)).toHaveAccessibleName(/Touches middle row peg 3 and the Great Hands\.$/);

    // After a wrong run, a peg pressed stays focused.
    place(/^Middle row, peg 1:/);
    turnCrank();
    expect(screen.getByRole('heading', { name: 'Not joined yet' })).toHaveFocus();
    const second = peg(/^Middle row, peg 2:/);
    second.focus();
    fireEvent.keyDown(second, { key: 'Enter' });
    expect(peg(/^Middle row, peg 2:/)).toHaveFocus();
    expect(screen.queryByRole('heading', { name: 'Not joined yet' })).toBeNull();
  });

  it('Medium: four gears between turn it the wrong way; one more on the way turns it right', () => {
    play('medium');
    expect(screen.getByText('Make the Great Hands turn clockwise ↻.', { selector: '#cg-job' })).toBeInTheDocument();
    // Before a run the machine shows which way it must turn.
    expect(screen.getByText(/must turn ↻/)).toBeInTheDocument();
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Middle row, peg 3:/, /^Middle row, peg 4:/);
    turnCrank();
    expect(screen.getByRole('heading', { name: 'The wrong way round' })).toHaveAccessibleDescription(/turned anticlockwise ↺ — four gears between/);
    // What it did, and what it must do, both in sight (review round 2).
    expect(screen.getByText(/turned ↺ · must turn ↻/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change the gears' }));
    // Take the middle two off and go up and over the top: five between.
    place(/^Middle row, peg 2:/, /^Middle row, peg 3:/, /^Top row, peg 1:/, /^Top row, peg 2:/, /^Top row, peg 3:/);
    turnCrank();
    expect(screen.getByRole('heading', { name: 'It works!' })).toHaveAccessibleDescription(/Five gears between the crank and the Great Hands: an odd number/);
  });

  it('three gears that all touch jam: all three are marked and said stuck (review round 1)', () => {
    play('medium');
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Top row, peg 1:/);
    turnCrank();
    expect(screen.getByRole('heading', { name: 'Jammed!' })).toHaveAccessibleDescription(/push each other both ways at once\. Take out one of the gears marked !/);
    for (const n of [/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Top row, peg 1:/]) expect(peg(n)).toHaveAccessibleName(/: a gear, stuck! Take it off\./);
    expect(board().querySelectorAll('circle[stroke="#e8483f"][stroke-dasharray]')).toHaveLength(3);
  });

  it('a ring of four gears still marks one ring of three (review round 2: it marked four)', () => {
    play('medium');
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Top row, peg 1:/, /^Top row, peg 2:/);
    turnCrank();
    expect(screen.getByRole('heading', { name: 'Jammed!' })).toBeInTheDocument();
    expect(board().querySelectorAll('circle[stroke="#e8483f"][stroke-dasharray]')).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /stuck!/ })).toHaveLength(3);
  });

  it('Tab follows the train: the pegs left to right from the crank’s (review round 2: the top row came first)', () => {
    play('medium');
    const names = Array.from(board().querySelectorAll('[role="button"]')).map((g) => g.getAttribute('aria-label')!.split(':')[0]);
    expect(names).toEqual(['Middle row, peg 1', 'Top row, peg 1', 'Middle row, peg 2', 'Top row, peg 2', 'Middle row, peg 3', 'Top row, peg 3', 'Middle row, peg 4']);
    // Every peg has its drawn focus ring.
    for (const g of Array.from(board().querySelectorAll('[role="button"]'))) expect(g.querySelector('circle.group-focus-visible\\:opacity-100')).not.toBeNull();
  });

  it('no gear by the crank: only the crank turns, and says so', () => {
    play('gentle');
    // "Put a gear on first" does nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Put a gear on first' }));
    expect(screen.queryByRole('heading', { name: /turned|works|joined/ })).toBeNull();
    place(/^Middle row, peg 3:/);
    turnCrank();
    expect(screen.getByRole('heading', { name: 'Only the crank turned' })).toHaveAccessibleDescription(/no gear touches it yet/);
  });

  it('Take all the gears off clears the board and gives focus back to the crank’s peg (review round 2: it fell to the page)', () => {
    play('gentle');
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/);
    const off = screen.getByRole('button', { name: 'Take all the gears off' });
    off.focus();
    fireEvent.click(off);
    expect(screen.getByText('No gears on the pegs yet.')).toBeInTheDocument();
    expect(peg(/^Middle row, peg 1:/)).toHaveFocus();
  });

  it('the gold button comes into view as a step starts — never on a peg tap (review round 2)', () => {
    const into = vi.fn();
    const was = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = into;
    try {
      play('gentle');
      expect(into).toHaveBeenCalled();
      into.mockClear();
      place(/^Middle row, peg 1:/, /^Middle row, peg 2:/);
      expect(into).not.toHaveBeenCalled();
      turnCrank();
      // What happened comes into view.
      expect(into).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }));
    } finally {
      Element.prototype.scrollIntoView = was;
    }
  });

  it('Tricky: no crank gear to start with; the machine’s teeth said; the crank’s gear sets the speed, and starts over next machine', () => {
    play('tricky');
    // The machine's teeth in words (review round 1: only drawn).
    expect(screen.getByText(/twice as fast as the crank\. Its gear has 8 teeth\./, { selector: '#cg-job' })).toBeInTheDocument();
    expect(board()).toHaveAccessibleName(/the Great Hands on the right \(its gear has 8 teeth\)/);
    // Up and over the top: five between, so it turns the crank's way.
    place(/^Middle row, peg 1:/, /^Top row, peg 1:/, /^Top row, peg 2:/, /^Top row, peg 3:/, /^Middle row, peg 4:/);
    // Never right by default (review round 1): the crank's gear is the kid's to pick.
    const go = screen.getByRole('button', { name: 'Pick the crank’s gear first' });
    expect(go).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(go);
    expect(screen.queryByRole('heading', { name: /It works|too fast/ })).toBeNull();
    const sizes = () => within(screen.getByRole('group', { name: 'The crank’s gear' }));
    // The crank stands faded until its gear is picked, and its label says so.
    expect(screen.getByText(/pick its gear/)).toBeInTheDocument();
    expect(board().querySelector('g[opacity="0.45"]')).not.toBeNull();
    expect(sizes().getAllByRole('button').map((b) => b.textContent)).toEqual(['Small8 teeth', 'Middle16 teeth', 'Big24 teeth']);
    fireEvent.click(sizes().getByRole('button', { name: /^Big/ }));
    turnCrank();
    expect(screen.getByRole('heading', { name: 'Too fast' })).toHaveAccessibleDescription(/three times as fast as the crank\. Too fast!/);
    fireEvent.click(screen.getByRole('button', { name: 'Change the gears' }));
    // The gears stay as they were; only the crank's gear changes.
    fireEvent.click(sizes().getByRole('button', { name: /^Middle/ }));
    turnCrank();
    expect(screen.getByRole('heading', { name: 'It works!' })).toHaveAccessibleDescription(/16 teeth turning 8 made the Great Hands turn twice as fast/);
    fireEvent.click(screen.getByRole('button', { name: 'Next machine' }));
    expect(sizes().getAllByRole('button').every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('a round brings machines not in the book first; one served again pays and says no page', async () => {
    setUp(2, { [pageFlag('clocktower-gears', 'hands')]: true, [pageFlag('clocktower-gears', 'bell')]: true, [pageFlag('clocktower-gears', 'cuckoo')]: true });
    await open();
    expect(board()).toHaveAccessibleDescription('Join the crank to the Weathervane so it turns.');
  });

  it('a machine fixed again says no page; a book page read gives Tock back on the next turn, and on a peg tap', () => {
    setUp(2, Object.fromEntries(MACHINE_IDS.map((id) => [pageFlag('clocktower-gears', id), true])));
    const { onPage } = play('gentle');
    onPage.mockReturnValue(false);
    const bigBen = () => screen.queryAllByText(/Big Ben is the name of the great bell/).length;
    fireEvent.click(screen.getByRole('button', { name: 'Hour Bell. Read the page' }));
    expect(bigBen()).toBeGreaterThan(0);
    place(/^Middle row, peg 1:/);
    expect(bigBen()).toBe(0);
    place(/^Middle row, peg 2:/, /^Middle row, peg 3:/, /^Middle row, peg 4:/);
    fireEvent.click(screen.getByRole('button', { name: 'Hour Bell. Read the page' }));
    turnCrank();
    expect(screen.getByRole('heading', { name: 'It works!' })).toBeInTheDocument();
    expect(screen.queryByText(/is in your book/)).toBeNull();
    expect(bigBen()).toBe(0);
  });

  it('“is in your book!” only for the machine that’s new, not the next (review round 2)', async () => {
    setUp(2, Object.fromEntries(MACHINE_IDS.filter((id) => id !== 'hands').map((id) => [pageFlag('clocktower-gears', id), true])));
    await open();
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Middle row, peg 3:/, /^Middle row, peg 4:/);
    turnCrank();
    expect(screen.getByText(/The Great Hands is in your book!/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next machine' }));
    await screen.findByText('Machine 2 of 3');
    place(/^Middle row, peg 1:/, /^Top row, peg 1:/, /^Top row, peg 2:/, /^Top row, peg 3:/, /^Middle row, peg 2:/);
    turnCrank();
    expect(screen.getByRole('heading', { name: 'It works!' })).toBeInTheDocument();
    expect(screen.queryByText(/is in your book/)).toBeNull();
  });
});

describe('⚙️ Clocktower Gears on Expert: gear ratios in numbers (§8.5)', () => {
  const sizes = () => within(screen.getByRole('group', { name: 'The crank’s gear' }));
  const SIZE_RE: Record<number, RegExp> = { 8: /^Small/, 16: /^Middle/, 24: /^Big(?!gest)/, 32: /^Biggest/ };
  const ROWS = ['Top row', 'Middle row', 'Bottom row'];
  /** Does a job the fewest-gears way (`solve`), and turns the crank. */
  function solveIt(job: GearJob) {
    const s = solve(job)!;
    for (const i of s.placed) {
      const p = job.board.pegs[i];
      fireEvent.click(peg(new RegExp(`^${ROWS[p.r]}, peg ${job.board.pegs.filter((q) => q.r === p.r && q.c <= p.c).length}:`)));
    }
    fireEvent.click(sizes().getByRole('button', { name: SIZE_RE[s.crank] }));
    turnCrank();
    return s;
  }

  it('turns a minute: four crank gears, a miss said in numbers with the rule, the ratio on a right run; a miss, then two right — spot on 2 of 3', () => {
    const { onFinish } = play('expert');
    expect(screen.getByText('Make the Great Hands turn clockwise ↻, 45 times a minute. The crank turns 15 times a minute; the machine’s gear has 8 teeth.', { selector: '#cg-job' })).toBeInTheDocument();
    // Tock, plainly (§8.3) — and not the job again (UX review round 1); the job in the step card too, for a short screen.
    expect(screen.getByText('Work out the ratio from the job, then pick the crank’s gear and join them up.')).toBeInTheDocument();
    expect(screen.getAllByText(/^Make the Great Hands turn clockwise ↻, 45 times a minute\./)).toHaveLength(2);
    // The frame holds Expert's 32 (code review round 1).
    const f = boardBox(jobFor('expert', 0, 0).board, 32);
    expect(board()).toHaveAttribute('viewBox', `${f.x * 100} ${f.y * 100} ${f.w * 100} ${f.h * 100}`);
    expect(sizes().getAllByRole('button').map((b) => b.textContent)).toEqual(['Small8 teeth', 'Middle16 teeth', 'Big24 teeth', 'Biggest32 teeth']);
    expect(sizes().getAllByRole('button').every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    // Up and over the top: five between, so it turns the crank's way.
    place(/^Middle row, peg 1:/, /^Top row, peg 1:/, /^Top row, peg 2:/, /^Top row, peg 3:/, /^Middle row, peg 4:/);
    fireEvent.click(sizes().getByRole('button', { name: /^Middle/ }));
    turnCrank();
    expect(screen.getByRole('heading', { name: 'Too slow' })).toHaveAccessibleDescription(
      'The Great Hands turned 30 times a minute, not 45. Turns out = turns in × crank teeth ÷ machine teeth.',
    );
    expect(screen.getByText('Not yet. Look at what turned, then change the gears.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change the gears' }));
    fireEvent.click(sizes().getByRole('button', { name: /^Big(?!gest)/ }));
    turnCrank();
    expect(screen.getByRole('heading', { name: 'It works' })).toHaveAccessibleDescription(
      /^The gear ratio, machine : crank, is 8 : 24 = 1 : 3: the machine turns 3 times for each turn of the crank, so 15 turns a minute became 45, with a third of the crank’s turning force\. The Great Hands is in your book\.$/,
    );
    expect(screen.getByText('Right. Next machine.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next machine' }));

    // Turning force, right first time: four times the force is a quarter of the speed.
    expect(screen.getByText('Make the Hour Bell turn anticlockwise ↺ with four times the crank’s turning force. The machine’s gear has 32 teeth.', { selector: '#cg-job' })).toBeInTheDocument();
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Middle row, peg 3:/, /^Middle row, peg 4:/);
    fireEvent.click(sizes().getByRole('button', { name: /^Small/ }));
    turnCrank();
    expect(screen.getByRole('heading', { name: 'It works' })).toHaveAccessibleDescription(
      /^The gear ratio, machine : crank, is 32 : 8 = 4 : 1: the machine turns once for every 4 turns of the crank — a quarter as fast as the crank, with four times the crank’s turning force: speed traded for force\./,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next machine' }));

    // 20 a minute to 40, on a 16: the biggest crank gear.
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Middle row, peg 3:/, /^Middle row, peg 4:/);
    fireEvent.click(sizes().getByRole('button', { name: /^Biggest/ }));
    turnCrank();
    expect(screen.getByRole('heading', { name: 'It works' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next — that’s the last one' }));
    // Spot on 2 of 3 — and the reward keeps the missed machine's working, not the round's last (UX review round 1).
    const hands = jobFor('expert', 0, 0);
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ spotOn: { right: 2, of: 3 }, learned: learnedLine(hands, run(hands.board, new Set([3, 0, 1, 2, 6]), 24, hands.teeth), 24) }),
    );
  });

  it('a jam on Expert is said plainly, and costs the seal (code review round 1: only that the round went on was checked)', () => {
    // Round 1's first job: the Weathervane, on a board with a top row.
    const { onFinish } = play('expert', 1);
    const queue = roundQueue(() => false, 1);
    // Three that all touch: the crank's peg, the one after it, and the one above both.
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Top row, peg 1:/);
    fireEvent.click(sizes().getByRole('button', { name: /^Small/ }));
    turnCrank();
    expect(screen.getByRole('heading', { name: 'Jammed' })).toHaveAccessibleDescription('Three gears that all touch push each other both ways. Take out one of the gears marked !.');
    fireEvent.click(screen.getByRole('button', { name: 'Change the gears' }));
    fireEvent.click(screen.getByRole('button', { name: 'Take all the gears off' }));
    for (let i = 0; i < 3; i++) {
      solveIt(jobFor('expert', 1, i, queue));
      expect(screen.getByRole('heading', { name: 'It works' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    }
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ spotOn: { right: 2, of: 3 } }));
  });

  it('two machines missed, one too much force: the reward keeps the first missed one’s working (code review round 2: untested)', () => {
    const { onFinish } = play('expert', 2);
    const queue = roundQueue(() => false, 2);
    const [bellJob, beltJob, hands] = [0, 1, 2].map((i) => jobFor('expert', 2, i, queue));
    // Twice the crank's force, with the Small gear: four times — too much.
    expect(bellJob.force).toBe(true);
    const s1 = solve(bellJob)!;
    expect(s1.crank).toBe(16);
    for (const i of s1.placed) {
      const p = bellJob.board.pegs[i];
      fireEvent.click(peg(new RegExp(`^${ROWS[p.r]}, peg ${bellJob.board.pegs.filter((q) => q.r === p.r && q.c <= p.c).length}:`)));
    }
    fireEvent.click(sizes().getByRole('button', { name: /^Small/ }));
    turnCrank();
    expect(screen.getByRole('heading', { name: 'Too much force' })).toHaveAccessibleDescription(/^.* got four times the crank’s turning force, not twice\. /);
    fireEvent.click(screen.getByRole('button', { name: 'Change the gears' }));
    fireEvent.click(sizes().getByRole('button', { name: /^Middle/ }));
    turnCrank();
    const firstMissed = learnedLine(bellJob, run(bellJob.board, s1.placed, 16, bellJob.teeth), 16);
    fireEvent.click(screen.getByRole('button', { name: 'Next machine' }));
    // The second missed too: a size too small, then right.
    const s2 = solve(beltJob)!;
    const smaller = ({ 16: 8, 24: 16, 32: 24 } as Record<number, number>)[s2.crank];
    for (const i of s2.placed) {
      const p = beltJob.board.pegs[i];
      fireEvent.click(peg(new RegExp(`^${ROWS[p.r]}, peg ${beltJob.board.pegs.filter((q) => q.r === p.r && q.c <= p.c).length}:`)));
    }
    fireEvent.click(sizes().getByRole('button', { name: SIZE_RE[smaller] }));
    turnCrank();
    fireEvent.click(screen.getByRole('button', { name: 'Change the gears' }));
    fireEvent.click(sizes().getByRole('button', { name: SIZE_RE[s2.crank] }));
    turnCrank();
    fireEvent.click(screen.getByRole('button', { name: 'Next machine' }));
    solveIt(hands);
    fireEvent.click(screen.getByRole('button', { name: 'Next — that’s the last one' }));
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ spotOn: { right: 1, of: 3 }, learned: firstMissed }));
  });

  it('a round right first time keeps the last machine’s working, and wins the seal’s tally', () => {
    const { onFinish } = play('expert');
    let last = '';
    for (let i = 0; i < 3; i++) {
      const job = jobFor('expert', 0, i);
      const s = solveIt(job);
      last = learnedLine(job, run(job.board, s.placed, s.crank, job.teeth), s.crank);
      fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    }
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ spotOn: { right: 3, of: 3 }, learned: last }));
  });

  it('a run with no gear touching the crank costs the seal too; a force job’s miss is headed in force (UX review round 1: "Too fast" over too little force)', () => {
    const { onFinish } = play('expert');
    place(/^Middle row, peg 4:/);
    fireEvent.click(sizes().getByRole('button', { name: /^Small/ }));
    turnCrank();
    expect(screen.getByRole('heading', { name: 'Only the crank turned' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change the gears' }));
    fireEvent.click(screen.getByRole('button', { name: 'Take all the gears off' }));
    solveIt(jobFor('expert', 0, 0));
    fireEvent.click(screen.getByRole('button', { name: 'Next machine' }));
    // The Hour Bell wants four times the force: the Middle gives twice — not enough; then right.
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Middle row, peg 3:/, /^Middle row, peg 4:/);
    fireEvent.click(sizes().getByRole('button', { name: /^Middle/ }));
    turnCrank();
    expect(screen.getByRole('heading', { name: 'Not enough force' })).toHaveAccessibleDescription(
      'The Hour Bell got twice the crank’s turning force, not four times. Force out = force in × machine teeth ÷ crank teeth.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Change the gears' }));
    fireEvent.click(sizes().getByRole('button', { name: /^Small/ }));
    turnCrank();
    fireEvent.click(screen.getByRole('button', { name: 'Next machine' }));
    solveIt(jobFor('expert', 0, 2));
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ spotOn: { right: 1, of: 3 } }));
  });
});

