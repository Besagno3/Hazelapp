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
// A step's buttons always ready here (the wait after a step starts: WordForge.taps.test).
vi.mock('../useSettled', () => ({ useSettled: () => () => true, SETTLE_MS: 450 }));

const { default: MiniGameStage } = await import('../MiniGameStage');
const { default: WordForge } = await import('./WordForge');
const { useSaveStore } = await import('../../../store/saveStore');
const { useProfileStore } = await import('../../../store/profileStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES, pageFlag, starFlag } = await import('../../../content/minigames');
const { FAMILY_BY_ID, PART_MEANS, jobFor, learnedLine, partText, roundQueue } = await import('../../../lib/minigames/forge');
type Band = import('../../../content/minigames').Band;
type Job = import('../../../lib/minigames/forge').Job;

const addXp = vi.fn(async () => {});
const recordActivity = vi.fn(async () => {});

function setUp(level: number, flags: Record<string, boolean> = {}) {
  localStorage.clear();
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: new Date().getFullYear() - 9, birthMonth: 1, skillLevels: { words: level }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
    addXp,
    recordActivity,
  });
}

beforeEach(() => {
  addXp.mockClear();
  recordActivity.mockClear();
  setUp(2);
  // The last thing done a tap, not a key (`lastInput.ts`).
  fireEvent.pointerDown(document.body);
});

const save = () => useSaveStore.getState().save!;
const dot = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';
const tray = () => screen.getByRole('group', { name: /^The tray of word parts/ });
const tile = (name: string) => within(tray()).getByRole('button', { name: new RegExp(`^${name.replace(/[-+]/g, '\\$&')}(,|$)`) });
const slot = (k: number) => screen.getByRole('button', { name: new RegExp(`^${k === 0 ? 'First' : 'Second'} part`) });
const hammerButton = () => screen.getByRole('button', { name: '🔨 Hammer!' });
const hammer = () => fireEvent.click(hammerButton());
const chip = () => screen.getByRole('list', { name: 'Steps' }).querySelector('[aria-current="step"]')?.textContent;

function play(band: Band, round = 0, page = true) {
  const onPage = vi.fn(() => page);
  const onFinish = vi.fn();
  render(<WordForge def={MINIGAMES['word-forge']} band={band} round={round} onPage={onPage} onFinish={onFinish} />);
  return { onPage, onFinish };
}

/** A word's two parts tapped in order, then hammered (Gentle and Medium tiles show add-ons with their hyphen). */
function forge(job: Job) {
  for (const p of job.word.parts) fireEvent.click(tile(partText(p, job.band)));
  hammer();
}

describe('🔨 the title card', () => {
  it('names the game, Dot’s hello and the word wall', () => {
    render(<MiniGameStage game="word-forge" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Word Forge' })).toBeInTheDocument();
    expect(screen.getByText('Word wall: 0 of 9')).toBeInTheDocument();
    expect(screen.getByText(/the way a key is made of teeth/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Let’s forge!' })).toHaveFocus();
  });
});

describe('🔨 Word Forge, a round (docs/DESIGN-MINIGAMES.md §5.10)', () => {
  it('Gentle: two words into one; a part tapped goes on the anvil in the next place, said; the wrong way round said, the parts float back; forged → a new page; three, then the round', () => {
    const { onPage, onFinish } = play('gentle');
    const queue = roundQueue('gentle', () => false, 0);
    const job = jobFor('gentle', 0, 0, queue);
    expect(job.word.word).toBe('sunflower');
    expect(within(tray()).getAllByRole('button')).toHaveLength(4);
    // From a tap: the tray, not its first part, so no ring lights a part as if picked (code and UX review round 1).
    expect(tray()).toHaveFocus();
    expect(tray()).toHaveAccessibleDescription(/A word that means“a tall flower with a big round face like the sun”$/);
    expect(dot()).toContain('I need a word that means “a tall flower with a big round face like the sun”. Which two parts make it?');
    expect(chip()).toContain('Pick the first part');
    // Hammer waits for two parts.
    expect(hammerButton()).toHaveAttribute('aria-disabled', 'true');
    hammer();
    expect(dot()).toContain('Two parts on the anvil first — two to go.');

    fireEvent.click(tile('flower'));
    expect(slot(0)).toHaveAccessibleName('First part: flower');
    // What landed, said (UX review round 1: a reader never heard).
    expect(dot()).toContain('“flower” is on the anvil. And the second part? Tap it in the tray.');
    expect(chip()).toContain('Then the second');
    fireEvent.click(tile('sun'));
    expect(screen.getByText('flowersun')).toBeInTheDocument();
    expect(dot()).toContain('“flower” and “sun” are on the anvil — hammer them together!');
    expect(hammerButton()).not.toHaveAttribute('aria-disabled');
    expect(chip()).toContain('Hammer!');
    hammer();
    expect(dot()).toContain('Flowersun isn’t a word — try them the other way round!');
    expect(screen.getAllByText('Flowersun isn’t a word — try them the other way round!').length).toBeGreaterThan(0);
    // Both float back — a fade where they sit, not a shake; the anvil's empty.
    expect(slot(0)).toHaveAccessibleName('First part, empty');
    expect(tile('flower')).toHaveClass('wf-back');
    expect(tile('sun')).toHaveClass('wf-back');

    forge(job);
    const head = screen.getByRole('heading', { name: 'Sunflower!' });
    expect(head).toHaveFocus();
    // Not "Sun words are on the word wall!" (UX review round 1: "Graph, “write” are…").
    expect(head).toHaveAccessibleDescription(`${learnedLine(job)} A new page on the word wall: Sun words!`);
    expect(onPage).toHaveBeenCalledWith('sun', 'Sun words');
    expect(dot()).toContain('Clang! A real word, hot off the anvil! Another?');
    // The family's named once its word's forged, not before.
    expect(screen.getByText('SUN WORDS')).toBeInTheDocument();
    // The anvil's places wait now.
    expect(slot(0)).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(slot(0));
    expect(screen.getByRole('heading', { name: 'Sunflower!' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next word' }));
    // A fresh word: what Dot said of the last is gone (code review round 1: untested), the tray focused again.
    expect(screen.getByText('Tap two parts in the tray, in order.')).toBeInTheDocument();
    expect(screen.getByText('WORD 2 OF 3')).toBeInTheDocument();
    expect(tray()).toHaveFocus();
    forge(jobFor('gentle', 0, 1, queue));
    fireEvent.click(screen.getByRole('button', { name: 'Next word' }));
    forge(jobFor('gentle', 0, 2, queue));
    fireEvent.click(screen.getByRole('button', { name: 'All forged!' }));
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three words forged!', learned: learnedLine(jobFor('gentle', 0, 2, queue)) });
  });

  it('a part on the anvil tapped comes back to the tray (its place fills next); an empty place says how; a full anvil says so; the same words again re-read', () => {
    play('gentle');
    fireEvent.click(slot(1));
    const first = dot();
    expect(first).toContain('Tap a part in the tray — it goes on the anvil.');
    // Said again: read again (a zero-width space every other time — code and UX review round 1: silent).
    fireEvent.click(slot(1));
    expect(dot()).toContain('Tap a part in the tray — it goes on the anvil.');
    expect(dot()).not.toBe(first);

    fireEvent.click(tile('sun'));
    fireEvent.click(tile('flower'));
    const other = within(tray()).getAllByRole('button')[0];
    fireEvent.click(other);
    expect(dot()).toContain('The anvil holds two parts — tap one on it to take it off.');
    expect(slot(1)).toHaveAccessibleName('Second part: flower');

    fireEvent.click(slot(0));
    expect(dot()).toContain('“sun” is back in the tray.');
    expect(slot(0)).toHaveAccessibleName('First part, empty');
    expect(slot(1)).toHaveAccessibleName('Second part: flower');
    fireEvent.click(tile('sun'));
    expect(slot(0)).toHaveAccessibleName('First part: sun');
  });

  it('more than one: both endings in the tray; the wrong one said, with the rule', () => {
    const queue = roundQueue('gentle', () => false, 0);
    const k = queue.indexOf('more');
    play('gentle');
    for (let i = 0; i < k; i++) {
      forge(jobFor('gentle', 0, i, queue));
      fireEvent.click(screen.getByRole('button', { name: 'Next word' }));
    }
    expect(jobFor('gentle', 0, k, queue).word.word).toBe('cats');
    expect(tile('-s')).toBeInTheDocument();
    fireEvent.click(tile('cat'));
    fireEvent.click(tile('-es'));
    hammer();
    expect(dot()).toContain('Just -s here: cats.');
  });

  it('Medium: add-ons shown with their hyphen; a real word that means something else said, with what it means; a hint from what was right', () => {
    setUp(5);
    play('medium');
    const job = jobFor('medium', 0, 0, roundQueue('medium', () => false, 0));
    expect(job.word.word).toBe('helpful');
    expect(within(tray()).getAllByRole('button')).toHaveLength(5);
    expect(tile('-ful')).toBeInTheDocument();
    const other = job.tiles.find((p) => p !== 'help' && p !== 'ful' && ['less', 'er', 'est'].includes(p))!;
    fireEvent.click(tile('help'));
    fireEvent.click(tile(`-${other}`));
    hammer();
    expect(dot()).toContain(other === 'est' ? 'Helpest isn’t a word. “help” first is right — now an end part meaning “full of”.' : `is a real word:`);
    forge(job);
    expect(screen.getByRole('heading', { name: 'Helpful!' })).toHaveAccessibleDescription(/^Helpful: help \+ -ful\./);
  });

  it('Tricky: each root says what it means (not “wave” under wave); the card says how the word’s built', () => {
    setUp(9);
    const round = [...Array(30).keys()].find((r) => jobFor('tricky', r, 0).tiles.includes('wave'))!;
    play('tricky', round);
    const job = jobFor('tricky', round, 0, roundQueue('tricky', () => false, round));
    expect(within(tray()).getAllByRole('button')).toHaveLength(6);
    const [a, b] = job.word.parts;
    expect(tile('wave')).toHaveAccessibleName('wave');
    expect(tile(a)).toHaveAccessibleName(`${a}, meaning “${PART_MEANS[a]}”`);
    forge(job);
    expect(screen.getByRole('heading', { name: `${job.word.word.charAt(0).toUpperCase()}${job.word.word.slice(1)}!` })).toHaveAccessibleDescription(new RegExp(`\\(“`));
    expect(learnedLine(job)).toContain(`${a} (“`);
    expect(learnedLine(job)).toContain(`${b} (“`);
  });

  it('the word wall: a page read out by Dot and under the wall, closed when tapped again; a tray tap closes it too; families not on it come first', () => {
    setUp(2, { [pageFlag('word-forge', 'sun')]: true });
    play('gentle');
    expect(screen.getByText('1 of 9 families')).toBeInTheDocument();
    // Not "RAIN WORDS" before it's forged (UX review round 1: the ticket gave the word away).
    expect(screen.getByText('WORD 1 OF 3')).toBeInTheDocument();
    expect(jobFor('gentle', 0, 0, roundQueue('gentle', (id) => id === 'sun', 0)).family).toBe('rain');
    const page = screen.getByRole('button', { name: 'Sun words. Read the page' });
    fireEvent.click(page);
    expect(page).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText(FAMILY_BY_ID.sun.note, { exact: false })).toHaveLength(2);
    fireEvent.click(page);
    expect(page).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryAllByText(FAMILY_BY_ID.sun.note, { exact: false })).toHaveLength(0);
    fireEvent.click(page);
    fireEvent.click(within(tray()).getAllByRole('button')[0]);
    expect(page).toHaveAttribute('aria-pressed', 'false');
  });

  it('a word forged again (its family on the wall already) says what was learned, not “a new page”', () => {
    play('gentle', 0, false);
    const job = jobFor('gentle', 0, 0);
    forge(job);
    expect(screen.getByRole('heading', { name: 'Sunflower!' })).toHaveAccessibleDescription(learnedLine(job));
  });

  it('through the stage: three words, a new page marked “New!”, the reward, star 1 and a Focus Tea', async () => {
    render(<MiniGameStage game="word-forge" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s forge!' }));
    await screen.findByRole('group', { name: /^The tray of word parts/ });
    const queue = roundQueue('gentle', () => false, 0);
    for (const i of [0, 1, 2]) {
      forge(jobFor('gentle', 0, i, queue));
      if (i === 0) expect(screen.getByRole('button', { name: 'Sun words, new. Read the page' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next word' : 'All forged!' }));
    }
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Three words forged!' })).toBeInTheDocument());
    expect(save().flags[starFlag('word-forge', 1)]).toBe(true);
    expect(save().items.tea).toBe(defaultSave().items.tea + 1);
  });
});
