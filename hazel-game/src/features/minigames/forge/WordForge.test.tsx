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
const { EXPERT_PAGES, FAMILY_BY_ID, PART_MEANS, builtLine, jobFor, keepHyphens, learnedLine, partText, rootAsk, rootChoices, roundQueue } = await import('../../../lib/minigames/forge');
type Band = import('../../../content/minigames').PlayBand;
type Job = import('../../../lib/minigames/forge').Job;

const addXp = vi.fn(async () => {});
const recordActivity = vi.fn(async () => {});

function setUp(level: number, flags: Record<string, boolean> = {}, age = 9) {
  localStorage.clear();
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: new Date().getFullYear() - age, birthMonth: 1, skillLevels: { words: level }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
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
// Dot's bubble, without the word joiners that keep an end part's hyphen with it.
const dot = () => (document.querySelector('[aria-live="polite"]')?.textContent ?? '').replace(/\u2060/g, '');
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
    expect(slot(0)).toHaveAccessibleName('First part: flower (take it back)');
    // It's left the tray (code review round 2: untested).
    expect(within(tray()).queryByRole('button', { name: /^flower/ })).toBeNull();
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
    // The round's three words (UX review round 2: only the last).
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three words forged!', learned: keepHyphens([0, 1, 2].map((i) => builtLine(jobFor('gentle', 0, i, queue))).join(' ')) });
    expect(onFinish.mock.calls[0][0].learned).toMatch(/^Sunflower: sun \+ flower\. Rainbow: rain \+ bow\. Cats: cat \+ -\u2060s\.$/);
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
    expect(slot(1)).toHaveAccessibleName('Second part: flower (take it back)');

    fireEvent.click(slot(0));
    expect(dot()).toContain('“sun” is back in the tray.');
    expect(slot(0)).toHaveAccessibleName('First part, empty');
    expect(slot(1)).toHaveAccessibleName('Second part: flower (take it back)');
    // The next part goes first: the steps say so (UX review round 2: "Then the second").
    expect(chip()).toContain('Pick the first part');
    fireEvent.click(tile('sun'));
    expect(slot(0)).toHaveAccessibleName('First part: sun (take it back)');
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
    // An end part's hyphen kept with it on a line (UX review round 2).
    expect(screen.getByRole('heading', { name: 'Helpful!' })).toHaveAccessibleDescription(/^Helpful: help \+ -\u2060ful\./);
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

  it('the word wall: a page read under the wall, in a place kept for it — Dot’s line not changed, so nothing moves; closed when tapped again; a tray tap closes it too; families not on it come first', () => {
    setUp(2, { [pageFlag('word-forge', 'sun')]: true });
    play('gentle');
    expect(screen.getByText('1 of 9 families')).toBeInTheDocument();
    // Not "RAIN WORDS" before it's forged (UX review round 1: the ticket gave the word away).
    expect(screen.getByText('WORD 1 OF 3')).toBeInTheDocument();
    expect(jobFor('gentle', 0, 0, roundQueue('gentle', (id) => id === 'sun', 0)).family).toBe('rain');
    const page = screen.getByRole('button', { name: 'Sun words. Read the page' });
    expect(screen.getByText('Tap a page to read it.')).toBeInTheDocument();
    // Not said: only a page read is (UX review round 2: "Tap a page to read it." was said after every Next).
    expect(screen.getByText('Tap a page to read it.').closest('[aria-live]')).toBeNull();
    const before = dot();
    fireEvent.click(page);
    expect(page).toHaveAttribute('aria-pressed', 'true');
    // Under the wall, said as it opens (UX review round 2: Dot's bubble grew with it, and the page tapped moved).
    expect(screen.getByText(FAMILY_BY_ID.sun.note, { exact: false }).closest('[aria-live]')).not.toBeNull();
    expect(dot()).toBe(before);
    fireEvent.click(page);
    expect(page).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryAllByText(FAMILY_BY_ID.sun.note, { exact: false })).toHaveLength(0);
    expect(screen.getByText('Tap a page to read it.')).toBeInTheDocument();
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

  it('through the stage on Tricky: the new pages’ names, each with a comma in it, kept apart in the reward (code review round 2: untested)', async () => {
    setUp(6, {}, 14);
    render(<MiniGameStage game="word-forge" />);
    fireEvent.click(within(screen.getByRole('group', { name: 'How tricky?' })).getByRole('button', { name: 'Tricky' }));
    fireEvent.click(screen.getByRole('button', { name: 'Let’s forge!' }));
    await screen.findByRole('group', { name: /^The tray of word parts/ });
    const queue = roundQueue('tricky', () => false, 0);
    for (const i of [0, 1, 2]) {
      forge(jobFor('tricky', 0, i, queue));
      fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next word' : 'All forged!' }));
    }
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Three words forged!' })).toBeInTheDocument());
    expect(queue.map((id) => FAMILY_BY_ID[id].name)).toEqual(['Tele, “far”', 'Micro, “small”', 'Graph, “write”']);
    expect(screen.getByText('New Word wall pages: Tele, “far”; Micro, “small”; Graph, “write”.')).toBeInTheDocument();
  });
});

describe('🔨 Expert (docs/DESIGN-MINIGAMES.md §8.5): Latin and Greek roots, their tiles plain; then what a root means', () => {
  const meanings = () => within(screen.getByRole('group', { name: 'What does it mean?' }));
  // The box under the meanings: what Dot said of the last pick, where a phone sees it (code review round 1: untested).
  const box = () => screen.getByRole('group', { name: 'What does it mean?' }).nextElementSibling?.textContent;

  it('forged from roots that don’t say; then what one means, from four — a wrong one said, marked and picked again; the root named; spot on counted, the first missed word’s lesson kept', () => {
    setUp(6, {}, 14);
    const { onFinish } = play('expert');
    const queue = roundQueue('expert', () => false, 0);
    const [solar, aqueduct, polygon] = [0, 1, 2].map((i) => jobFor('expert', 0, i, queue));
    expect([solar, aqueduct, polygon].map((j) => j.word.word)).toEqual(['solar', 'aqueduct', 'polygon']);
    expect(within(screen.getByRole('list', { name: 'Steps' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1Forge the word', '2What a root means', '3Its page']);
    // The tiles: the roots alone, no meanings.
    expect(tile('sol')).toHaveAccessibleName('sol');
    expect(within(tray()).getAllByRole('button').map((b) => b.textContent)).toEqual(solar.tiles);
    expect(document.getElementById('wf-do')).toHaveTextContent('“powered by daylight, like a panel on a roof”');
    // The wrong way round: said plainly; two on the anvil, plainly too (code review round 1: untested).
    fireEvent.click(tile('ar'));
    fireEvent.click(tile('sol'));
    expect(dot()).toContain('“ar” and “sol” are on the anvil — hammer them together.');
    hammer();
    expect(dot()).toContain('Arsol isn’t a word — try them the other way round.');
    forge(solar);
    // The root: asked in the card, four meanings — Dot just says the word (UX review round 1: a reader heard the question twice).
    const head = screen.getByRole('heading', { name: 'What does it mean?' });
    expect(head).toHaveFocus();
    expect(head).toHaveAccessibleDescription('What does “sol” mean in solar?');
    expect(chip()).toBe('2What a root means');
    expect(dot()).toMatch(/Solar\. Powered by daylight, like a panel on a roof\.\u200b?$/);
    expect(dot()).not.toContain('What does');
    expect(meanings().getAllByRole('button').map((b) => b.textContent)).toEqual(rootChoices(solar));
    fireEvent.click(meanings().getByRole('button', { name: '“people”' }));
    expect(dot()).toContain('Not “people”. Think of parasol: what does it share with solar?');
    expect(box()).toBe('Not “people”. Think of parasol: what does it share with solar?');
    expect(meanings().getByRole('button', { name: '“people”, tried' })).toBeInTheDocument();
    // A held Enter on a meaning picks nothing again (code review round 1: untested).
    const held = new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true });
    meanings().getByRole('button', { name: '“people”, tried' }).dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);
    fireEvent.click(meanings().getByRole('button', { name: '“to do with”' }));
    expect(dot()).toContain('Not “to do with”: that’s “ar”, the other part of solar.');
    fireEvent.click(meanings().getByRole('button', { name: '“sun”' }));
    // Its card, plain, the page by its Expert name; Dot names the root (UX review round 1: "That’s the word.").
    const done = screen.getByRole('heading', { name: 'Solar' });
    expect(done).toHaveFocus();
    expect(done).toHaveAccessibleDescription(`${learnedLine(solar)} A new page on the word wall: Sol words.`);
    expect(learnedLine(solar)).toBe('Solar: sol (“sun”) + ar (“to do with”). More with “sol”: parasol and solstice.');
    expect(chip()).toBe('3Its page');
    expect(dot()).toContain('“sol” means “sun”, with a miss on the way. Next word.');
    expect(dot()).not.toContain('!');
    fireEvent.click(screen.getByRole('button', { name: 'Next word' }));

    // Aqueduct: forged and its root right first time.
    expect(chip()).toBe('1Forge the word');
    forge(aqueduct);
    expect(rootAsk(aqueduct)).toBe('What does “duct” mean in aqueduct?');
    fireEvent.click(meanings().getByRole('button', { name: '“lead”' }));
    expect(dot()).toContain('“duct” means “lead”. Next word.');
    fireEvent.click(screen.getByRole('button', { name: 'Next word' }));
    // Polygon: forged first time, but the other part's meaning picked first. "people", tried on solar, isn't marked here
    // (code review round 1: untested).
    forge(polygon);
    expect(meanings().getByRole('button', { name: '“people”' })).toBeInTheDocument();
    fireEvent.click(meanings().getByRole('button', { name: '“many”' }));
    expect(dot()).toContain('Not “many”: that’s “poly”, the other part of polygon.');
    fireEvent.click(meanings().getByRole('button', { name: '“angle”' }));
    expect(dot()).toContain('“gon” means “angle”, with a miss on the way. That’s three.');
    fireEvent.click(screen.getByRole('button', { name: 'All forged' }));
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three words forged!', learned: learnedLine(solar), spotOn: { right: 1, of: 3 } });
  });

  it('a wrong hammer costs the seal, though the root’s right first pick; spot on otherwise, the first miss’s lesson (code review round 1: untested)', () => {
    setUp(6, {}, 14);
    const { onFinish } = play('expert', 1);
    const queue = roundQueue('expert', () => false, 1);
    const jobs = [0, 1, 2].map((i) => jobFor('expert', 1, i, queue));
    expect(jobs.map((j) => j.word.word)).toEqual(['support', 'benevolent', 'inspect']);
    // Support: the wrong way round first.
    fireEvent.click(tile('port'));
    fireEvent.click(tile('sup'));
    hammer();
    for (const [i, job] of jobs.entries()) {
      forge(job);
      fireEvent.click(meanings().getByRole('button', { name: ['“under”', '“wishing”', '“into”'][i] }));
      if (i === 0) expect(dot()).toContain('“sup” means “under”, with a miss on the way. Next word.');
      fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next word' : 'All forged' }));
    }
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three words forged!', learned: learnedLine(jobs[0]), spotOn: { right: 2, of: 3 } });
  });

  it('spot on every time: the seal’s three, and the lesson the round’s builds', () => {
    setUp(6, {}, 14);
    const { onFinish } = play('expert', 2);
    const jobs = [0, 1, 2].map((i) => jobFor('expert', 2, i));
    expect(jobs.map((j) => j.word.word)).toEqual(['teleport', 'micrometer', 'geography']);
    for (const [i, job] of jobs.entries()) {
      forge(job);
      fireEvent.click(meanings().getByRole('button', { name: ['“carry”', '“measure”', '“earth”'][i] }));
      fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next word' : 'All forged' }));
    }
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three words forged!', learned: jobs.map(builtLine).join(' '), spotOn: { right: 3, of: 3 } });
  });

  it('the wall on Expert: its own page names and a plain mark, no meaning in them; a page shut while a word’s on the anvil, and on a card for the next two words’ families — marked 🔒 (code and UX review rounds 1 and 2)', () => {
    const on = ['sun', 'rain', 'more', 'graph'] as const;
    setUp(6, Object.fromEntries(on.map((id) => [pageFlag('word-forge', id), true])), 14);
    const { onPage } = play('expert');
    const li = (id: string) => document.querySelector<HTMLElement>(`[data-family="${id}"]`)!;
    const page = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}(, new)?(, opens (between words|after its word))?\\. Read the page$`) });
    const read = () => li('sun').closest('section')!.querySelector('[aria-live]')!.textContent;
    // Seen: the name and the one mark, no picture of a meaning (code review round 2: ☀️ by “sol”, "Water words" by “aqua”).
    expect(li('graph').querySelector('button')).toHaveTextContent(/^📜Graph words$/);
    expect(li('rain').querySelector('button')).toHaveTextContent(/^📜Aqua words$/);
    expect(screen.queryByRole('button', { name: /“write”|Sun words|Water words/ })).toBeNull();
    // While the word's on the anvil, every page shut, and marked (UX review round 2: it looked open; the line read as its page).
    for (const id of on) expect(li(id)).toHaveTextContent(/^🔒/);
    expect(page('Sol words')).toHaveAccessibleName('Sol words, opens between words. Read the page');
    fireEvent.click(page('Sol words'));
    expect(read()).toBe('Sol words — pages open between words: forge this one and name its root first.');
    expect(screen.getByText('Sol words', { selector: 'b' })).toBeInTheDocument();
    fireEvent.click(page('Sol words'));
    forge(jobFor('expert', 0, 0));
    fireEvent.click(page('Graph words'));
    expect(read()).toMatch(/^Graph words — pages open between words/);
    fireEvent.click(page('Graph words'));
    fireEvent.click(within(screen.getByRole('group', { name: 'What does it mean?' })).getByRole('button', { name: '“sun”' }));
    // Filed: its page, by its Expert name everywhere it's said.
    expect(onPage).toHaveBeenLastCalledWith('sun', 'Sol words');
    expect(screen.getByText('SOL WORDS')).toBeInTheDocument();
    // Open: its note and its three Expert words (UX review round 1: it taught -s and compound words); the others' too —
    fireEvent.click(page('Sol words'));
    expect(read()).toBe(`Sol words — ${EXPERT_PAGES.sun.note} solar, solstice, parasol.`);
    fireEvent.click(page('Graph words'));
    expect(read()).toMatch(/^Graph words — Geo is Greek for earth/);
    expect(li('graph')).not.toHaveTextContent('🔒');
    // — but not the next two words’ (code and UX review round 2: a card opened the page with the next word's answer).
    for (const id of ['rain', 'more']) expect(li(id)).toHaveTextContent(/^🔒/);
    expect(page('Aqua words')).toHaveAccessibleName('Aqua words, opens after its word. Read the page');
    fireEvent.click(page('Aqua words'));
    expect(read()).toBe('Aqua words — its word’s coming up, so its page opens once that’s filed.');
    fireEvent.click(screen.getByRole('button', { name: 'Next word' }));
    // Aqueduct, filed: Aqua words on the card, the ticket and to the stage; Poly and multi's next, and support's family.
    forge(jobFor('expert', 0, 1));
    fireEvent.click(within(screen.getByRole('group', { name: 'What does it mean?' })).getByRole('button', { name: '“lead”' }));
    expect(screen.getByRole('heading', { name: 'Aqueduct' })).toHaveAccessibleDescription(/ A new page on the word wall: Aqua words\.$/);
    expect(onPage).toHaveBeenLastCalledWith('rain', 'Aqua words');
    expect(screen.getByText('AQUA WORDS')).toBeInTheDocument();
    expect(page('Poly and multi words')).toHaveAccessibleName('Poly and multi words, opens after its word. Read the page');
    expect(page('Sol words')).toHaveAccessibleName('Sol words. Read the page');
  });

  it('through the stage: a teen’s title card — Expert’s hello and steps', async () => {
    setUp(6, {}, 14);
    render(<MiniGameStage game="word-forge" />);
    expect(within(screen.getByRole('group', { name: 'How tricky?' })).getByRole('button', { name: 'Expert' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Today’s words are built from Latin and Greek roots/)).toBeInTheDocument();
    expect(screen.getByText(/Every word forged and every root right first time wins the Expert seal\. No clock\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Let’s forge!' }));
    await screen.findByRole('group', { name: /^The tray of word parts/ });
    expect(screen.getByRole('button', { name: 'sol' })).toBeInTheDocument();
  });
});
