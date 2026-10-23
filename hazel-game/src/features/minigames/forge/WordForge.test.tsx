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
const { default: WordForge } = await import('./WordForge');
const { useSaveStore } = await import('../../../store/saveStore');
const { useProfileStore } = await import('../../../store/profileStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES, pageFlag, starFlag } = await import('../../../content/minigames');
const { FAMILY_BY_ID, jobFor, learnedLine, roundQueue } = await import('../../../lib/minigames/forge');
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
});

const save = () => useSaveStore.getState().save!;
const dot = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';
const tray = () => screen.getByRole('group', { name: /^The tray of word parts/ });
const tile = (name: string) => within(tray()).getByRole('button', { name: new RegExp(`^${name.replace(/[-+]/g, '\\$&')}(,|$)`) });
const slot = (k: number) => screen.getByRole('button', { name: new RegExp(`^${k === 0 ? 'First' : 'Second'} part`) });
const hammer = () => fireEvent.click(screen.getByRole('button', { name: '🔨 Hammer!' }));

function play(band: Band, round = 0, page = true) {
  const onPage = vi.fn(() => page);
  const onFinish = vi.fn();
  render(<WordForge def={MINIGAMES['word-forge']} band={band} round={round} onPage={onPage} onFinish={onFinish} />);
  return { onPage, onFinish };
}

/** A word's two parts tapped in order, then hammered (Gentle and Medium tiles show add-ons with their hyphen). */
function forge(job: Job) {
  const show = (p: string) => (job.band === 'tricky' ? p : ['un', 're', 'pre'].includes(p) ? `${p}-` : ['ful', 'less', 'er', 'est', 's', 'es'].includes(p) ? `-${p}` : p);
  for (const p of job.word.parts) fireEvent.click(tile(show(p)));
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
  it('Gentle: two words into one; a part tapped goes on the anvil in the next place; the wrong way round said, the parts float back; forged → its family’s page; three, then the round', () => {
    const { onPage, onFinish } = play('gentle');
    const queue = roundQueue('gentle', () => false, 0);
    const job = jobFor('gentle', 0, 0, queue);
    expect(job.word.word).toBe('sunflower');
    expect(within(tray()).getAllByRole('button')).toHaveLength(4);
    expect(within(tray()).getAllByRole('button')[0]).toHaveFocus();
    expect(document.getElementById('wf-do')).toHaveTextContent('A word that means“a tall flower that turns to face the sun”');
    expect(dot()).toContain('I need a word that means “a tall flower that turns to face the sun”. Which two parts make it?');
    // Hammer waits for two parts.
    expect(screen.getByRole('button', { name: '🔨 Hammer!' })).toHaveAttribute('aria-disabled', 'true');
    hammer();
    expect(dot()).toContain('Two parts on the anvil first — two to go.');

    fireEvent.click(tile('flower'));
    expect(slot(0)).toHaveAccessibleName('First part: flower');
    expect(dot()).toContain('And the second part? Tap it in the tray.');
    fireEvent.click(tile('sun'));
    expect(screen.getByText('flowersun')).toBeInTheDocument();
    hammer();
    expect(screen.getAllByText('Flowersun isn’t a word — try them the other way round!')).toHaveLength(2);
    // Both float back; the anvil's empty.
    expect(slot(0)).toHaveAccessibleName('First part, empty');
    expect(tile('flower')).toBeInTheDocument();

    forge(job);
    const head = screen.getByRole('heading', { name: 'Sunflower!' });
    expect(head).toHaveFocus();
    expect(head).toHaveAccessibleDescription(`${learnedLine(job)} Sun words are on the word wall!`);
    expect(onPage).toHaveBeenCalledWith('sun', 'Sun words');
    expect(dot()).toContain('Clang! A real word, hot off the anvil! Another?');

    for (const i of [1, 2]) {
      fireEvent.click(screen.getByRole('button', { name: 'Next word' }));
      forge(jobFor('gentle', 0, i, queue));
    }
    fireEvent.click(screen.getByRole('button', { name: 'All forged!' }));
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three words forged!', learned: learnedLine(jobFor('gentle', 0, 2, queue)) });
  });

  it('a part on the anvil tapped comes back to the tray (its place fills next); an empty place says how; a full anvil says so', () => {
    play('gentle');
    fireEvent.click(slot(1));
    expect(dot()).toContain('Tap a part in the tray — it goes on the anvil.');
    fireEvent.click(tile('sun'));
    fireEvent.click(tile('flower'));
    fireEvent.click(slot(0));
    expect(dot()).toContain('sun is back in the tray.');
    expect(slot(0)).toHaveAccessibleName('First part, empty');
    expect(slot(1)).toHaveAccessibleName('Second part: flower');
  });

  it('Medium: add-ons shown with their hyphen; a real word that means something else said, with what it means', () => {
    setUp(5);
    play('medium');
    const job = jobFor('medium', 0, 0, roundQueue('medium', () => false, 0));
    expect(job.word.word).toBe('helpful');
    expect(within(tray()).getAllByRole('button')).toHaveLength(5);
    expect(tile('-ful')).toBeInTheDocument();
    // Help and another add-on of the tray's: a real word meaning something else (helpless, helper), or not a word, with a hint.
    const other = job.tiles.find((p) => p !== 'help' && p !== 'ful' && ['less', 'er', 'est'].includes(p))!;
    fireEvent.click(tile('help'));
    fireEvent.click(tile(`-${other}`));
    hammer();
    expect(dot()).toContain(other === 'est' ? 'Helpest isn’t a word. It ends with a part meaning “full of”.' : `is a real word — it means`);
    forge(job);
    expect(screen.getByRole('heading', { name: 'Helpful!' })).toBeInTheDocument();
  });

  it('Tricky: each root says what it means; the card says how the word’s built', () => {
    setUp(9);
    play('tricky');
    const job = jobFor('tricky', 0, 0, roundQueue('tricky', () => false, 0));
    expect(job.word.word).toBe('telescope');
    expect(within(tray()).getAllByRole('button')).toHaveLength(6);
    expect(tile('tele')).toHaveAccessibleName('tele, meaning “far”');
    forge(job);
    expect(screen.getByRole('heading', { name: 'Telescope!' })).toHaveAccessibleDescription(/^Telescope: tele \(“far”\) \+ scope \(“look”\)\./);
  });

  it('the word wall: a page read out by Dot and under the wall; families not on it come first', () => {
    setUp(2, { [pageFlag('word-forge', 'sun')]: true });
    play('gentle');
    expect(screen.getByText('1 of 9 families')).toBeInTheDocument();
    expect(screen.getByText('RAIN WORDS')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sun words. Read the page' }));
    expect(screen.getAllByText(FAMILY_BY_ID.sun.note, { exact: false })).toHaveLength(2);
  });

  it('a word forged again (its family on the wall already) says what was learned, not “on the word wall”', () => {
    play('gentle', 0, false);
    const job = jobFor('gentle', 0, 0);
    forge(job);
    expect(screen.getByRole('heading', { name: 'Sunflower!' })).toHaveAccessibleDescription(learnedLine(job));
  });

  it('through the stage: three words, the reward, star 1 and a Focus Tea', async () => {
    render(<MiniGameStage game="word-forge" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s forge!' }));
    await screen.findByRole('group', { name: /^The tray of word parts/ });
    const queue = roundQueue('gentle', () => false, 0);
    for (const i of [0, 1, 2]) {
      forge(jobFor('gentle', 0, i, queue));
      fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next word' : 'All forged!' }));
    }
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Three words forged!' })).toBeInTheDocument());
    expect(save().flags[starFlag('word-forge', 1)]).toBe(true);
    expect(save().items.tea).toBe(defaultSave().items.tea + 1);
  });
});
