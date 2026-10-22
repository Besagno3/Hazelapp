import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// Reduced motion: no zoom and no spinning, so a round plays straight through.
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

async function open() {
  render(<MiniGameStage game="clocktower-gears" />);
  fireEvent.click(screen.getByRole('button', { name: 'Let’s tinker!' }));
  return screen.findByRole('heading', { name: 'Step 1 · Place the gears' });
}

/** Puts a gear on each named peg. */
function place(...names: RegExp[]) {
  for (const n of names) fireEvent.click(peg(n));
}

describe('⚙️ the title card', () => {
  it('names the game, Tock’s hello and the machines', () => {
    render(<MiniGameStage game="clocktower-gears" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Clocktower Gears' })).toBeInTheDocument();
    expect(screen.getByText('Clocktower Machines: 0 of 9')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Let’s tinker!' })).toHaveFocus();
  });
});

describe('⚙️ Clocktower Gears, a whole round (docs/DESIGN-MINIGAMES.md §5.3)', () => {
  it('Gentle: a gap is said back, a full train turns it; three machines, then the reward', async () => {
    const start = await open();
    expect(start).toHaveFocus();
    expect(start).toHaveAccessibleDescription('Join the crank to the Great Hands so it turns.');
    // Nothing on: the crank waits.
    expect(screen.getByRole('button', { name: 'Put a gear on first' })).toHaveAttribute('aria-disabled', 'true');

    // The middle row: the crank's peg, one more, and the machine's — a gap.
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Middle row, peg 4:/);
    expect(screen.getByText('Three gears on the pegs.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    expect(screen.getByRole('heading', { name: 'Not joined yet' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Not joined yet' })).toHaveAccessibleDescription(/don’t reach the Great Hands yet/);
    expect(save().flags[pageFlag('clocktower-gears', 'hands')]).toBeUndefined();

    // Fill the gap: it works, and teaches.
    fireEvent.click(screen.getByRole('button', { name: 'Change the gears' }));
    place(/^Middle row, peg 3:/);
    fireEvent.click(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    expect(screen.getByRole('heading', { name: 'It works!' })).toHaveFocus();
    expect(screen.getByText(/Each gear turns the other way from the gear it touches\. The Great Hands is in your book!/)).toBeInTheDocument();
    expect(save().flags[pageFlag('clocktower-gears', 'hands')]).toBe(true);
    expect(addXp).toHaveBeenLastCalledWith(MINIGAME_PAGE_XP);

    // Two more machines, by the top row then the bottom.
    fireEvent.click(screen.getByRole('button', { name: 'Next machine' }));
    expect(await screen.findByText('Machine 2 of 3')).toBeInTheDocument();
    place(/^Middle row, peg 1:/, /^Top row, peg 1:/, /^Top row, peg 2:/, /^Top row, peg 3:/, /^Middle row, peg 2:/);
    fireEvent.click(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    expect(screen.getByRole('heading', { name: 'It works!' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next machine' }));
    await screen.findByText('Machine 3 of 3');
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Bottom row, peg 1:/, /^Bottom row, peg 2:/, /^Middle row, peg 3:/);
    fireEvent.click(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next — that’s the last one!' }));

    expect(screen.getByRole('heading', { level: 1, name: 'The Clocktower ticks again!' })).toHaveFocus();
    expect(save().flags[starFlag('clocktower-gears', 1)]).toBe(true);
    expect(save().items.spark).toBe(defaultSave().items.spark + 1);
  });

  it('a peg works from the keyboard, and a gear taken off is gone', async () => {
    await open();
    const p = peg(/^Middle row, peg 1:/);
    expect(p).toHaveAccessibleName('Middle row, peg 1: empty. Put a gear on. It touches the crank.');
    fireEvent.keyDown(p, { key: 'Enter' });
    expect(peg(/^Middle row, peg 1:/)).toHaveAccessibleName('Middle row, peg 1: a gear. Take it off. It touches the crank.');
    fireEvent.keyDown(peg(/^Middle row, peg 1:/), { key: ' ' });
    expect(screen.getByText('No gears on the pegs yet.')).toBeInTheDocument();
  });

  it('Medium: four gears between turn it the wrong way; one more on the way turns it right', () => {
    setUp(5);
    render(<ClocktowerGears def={MINIGAMES['clocktower-gears']} band="medium" round={0} onPage={() => true} onFinish={() => {}} />);
    expect(screen.getByText('Make the Great Hands turn clockwise ↻.', { selector: '#cg-job' })).toBeInTheDocument();
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Middle row, peg 3:/, /^Middle row, peg 4:/);
    fireEvent.click(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    expect(screen.getByRole('heading', { name: 'The wrong way round' })).toHaveAccessibleDescription(/turned anticlockwise ↺ — four gears between/);
    fireEvent.click(screen.getByRole('button', { name: 'Change the gears' }));
    // Take the middle two off and go up and over the top: five between.
    place(/^Middle row, peg 2:/, /^Middle row, peg 3:/, /^Top row, peg 1:/, /^Top row, peg 2:/, /^Top row, peg 3:/);
    fireEvent.click(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    expect(screen.getByRole('heading', { name: 'It works!' })).toHaveAccessibleDescription(/Five gears between the crank and the Great Hands: an odd number/);
  });

  it('three gears that all touch jam, and say which', () => {
    setUp(5);
    render(<ClocktowerGears def={MINIGAMES['clocktower-gears']} band="medium" round={0} onPage={() => true} onFinish={() => {}} />);
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Top row, peg 1:/);
    fireEvent.click(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    expect(screen.getByRole('heading', { name: 'Jammed!' })).toHaveAccessibleDescription(/push each other both ways at once/);
  });

  it('Tricky: the crank’s gear sets the speed', () => {
    setUp(9);
    render(<ClocktowerGears def={MINIGAMES['clocktower-gears']} band="tricky" round={0} onPage={() => true} onFinish={() => {}} />);
    const sizes = screen.getByRole('group', { name: 'The crank’s gear' });
    expect(within(sizes).getAllByRole('button')).toHaveLength(3);
    // Up and over the top: five between, so it turns the crank's way.
    place(/^Middle row, peg 1:/, /^Top row, peg 1:/, /^Top row, peg 2:/, /^Top row, peg 3:/, /^Middle row, peg 4:/);
    fireEvent.click(within(sizes).getByRole('button', { name: /^Big/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    expect(screen.getByRole('heading', { name: 'A bit too fast' })).toHaveAccessibleDescription(/three times as fast as the crank\. Too fast!/);
    fireEvent.click(screen.getByRole('button', { name: 'Change the gears' }));
    // The gears stay as they were; only the crank's gear changes.
    fireEvent.click(within(screen.getByRole('group', { name: 'The crank’s gear' })).getByRole('button', { name: /^Medium/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    expect(screen.getByRole('heading', { name: 'It works!' })).toHaveAccessibleDescription(/16 teeth turning 8 made the Great Hands turn twice as fast/);
  });

  it('a round brings machines not in the book first', async () => {
    setUp(2, { [pageFlag('clocktower-gears', 'hands')]: true, [pageFlag('clocktower-gears', 'bell')]: true, [pageFlag('clocktower-gears', 'cuckoo')]: true });
    await open();
    expect(screen.getByRole('heading', { name: 'Step 1 · Place the gears' })).toHaveAccessibleDescription('Join the crank to the Weathervane so it turns.');
  });
});
