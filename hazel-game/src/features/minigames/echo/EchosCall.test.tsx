import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

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
const playMusic = vi.fn();
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  playMusic: (...a: unknown[]) => playMusic(...a),
  sfx: () => {},
}));
// A step's buttons always ready here (the wait after a step starts is tested with Mirror Mural's: useSettled).
vi.mock('../useSettled', () => ({ useSettled: () => () => true, SETTLE_MS: 450 }));
const playTone = vi.fn();
vi.mock('../../../lib/tones', () => ({ playTone: (...a: unknown[]) => playTone(...a) }));

const { default: MiniGameStage } = await import('../MiniGameStage');
const { default: EchosCall } = await import('./EchosCall');
const { useSaveStore } = await import('../../../store/saveStore');
const { useProfileStore } = await import('../../../store/profileStore');
const { useSettingsStore } = await import('../../../store/settingsStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES, pageFlag, starFlag } = await import('../../../content/minigames');
const { CHIME, TUNE_BY_ID, echoFor, learnedLine, roundQueue, shape } = await import('../../../lib/minigames/echo');
type Echo = import('../../../lib/minigames/echo').Echo;
type Band = import('../../../content/minigames').Band;

const addXp = vi.fn(async () => {});
const recordActivity = vi.fn(async () => {});

function setUp(level: number, flags: Record<string, boolean> = {}) {
  localStorage.clear();
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: new Date().getFullYear() - 9, birthMonth: 1, skillLevels: { music: level }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
    addXp,
    recordActivity,
  });
}

beforeEach(() => {
  addXp.mockClear();
  recordActivity.mockClear();
  playTone.mockClear();
  setUp(2);
  useSettingsStore.setState({ sfx: false });
});

afterEach(() => {
  vi.useRealTimers();
});

const save = () => useSaveStore.getState().save!;
const chime = (n: string) => within(screen.getByRole('group', { name: 'The chimes, low to high' })).getByRole('button', { name: new RegExp(`^${n},`) });
const heard = () => document.querySelector('[role="status"].sr-only')?.textContent ?? '';

function play(band: Band, round = 0) {
  const onPage = vi.fn(() => true);
  const onFinish = vi.fn();
  render(<EchosCall def={MINIGAMES['echos-call']} band={band} round={round} onPage={onPage} onFinish={onFinish} />);
  return { onPage, onFinish };
}

/** Lyra plays to the end. */
function listen() {
  fireEvent.click(screen.getByRole('button', { name: /^(▶ Listen|↻ Listen again)$/ }));
  act(() => {
    vi.advanceTimersByTime(10_000);
  });
}

/** An ear echo, start to end: listen, the shape, the notes. */
function echoByEar(e: Echo) {
  listen();
  fireEvent.click(screen.getByRole('button', { name: /^Next — / }));
  fireEvent.click(screen.getByRole('button', { name: { higher: 'Higher', lower: 'Lower', same: 'The same' }[shape(e.notes)] }));
  for (const n of e.notes) fireEvent.click(chime(n));
}

describe('🎵 the title card', () => {
  it('names the game, Lyra’s hello and the Songbook', () => {
    render(<MiniGameStage game="echos-call" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Echo’s Call' })).toBeInTheDocument();
    // No music over the chimes.
    expect(playMusic).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Songbook: 0 of 8')).toBeInTheDocument();
    expect(screen.getByText(/I play the start of a tune — you play it back!/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Let’s play!' })).toHaveFocus();
  });
});

describe('🎵 Echo’s Call, a round (docs/DESIGN-MINIGAMES.md §5.5)', () => {
  it('Gentle: Lyra plays and the chimes light up in turn — said once she’s done; up or down, said kindly; a wrong chime says where the right one is; the tune played back is a page', () => {
    vi.useFakeTimers();
    const { onPage, onFinish } = play('gentle');
    const queue = roundQueue('gentle', () => false, 0);
    const e = echoFor('gentle', 0, 0, queue);
    expect(screen.getByRole('heading', { name: 'Step 1 · Listen' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Step 1 · Listen' })).toHaveAccessibleDescription('Listen to Lyra’s two notes, then play them back on the chimes.');
    // Three chimes on Gentle, each its letter and colour.
    expect(within(screen.getByRole('group', { name: 'The chimes, low to high' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['C, red', 'D, orange', 'E, yellow']);

    fireEvent.click(screen.getByRole('button', { name: '▶ Listen' }));
    expect(screen.getByRole('button', { name: '♪ Listening…' })).toHaveAttribute('aria-disabled', 'true');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    // The first note lights its chime (a ♪ over it) and rings.
    expect(chime(e.played[0]).textContent).toContain('♪');
    expect(playTone).toHaveBeenCalledWith(CHIME[e.played[0]].hz);
    expect(chime(e.played[0])).toHaveAttribute('aria-disabled', 'true');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(heard()).toBe(`Lyra played 2 notes: ${e.notes.map((n) => `${n} (${CHIME[n].name})`).join(', ')}.`);
    expect(playTone).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Next — up or down?' }));
    expect(screen.getByRole('heading', { name: 'Step 2 · Up or down?' })).toHaveFocus();
    const wrongShape = shape(e.notes) === 'higher' ? 'Lower' : 'Higher';
    fireEvent.click(screen.getByRole('button', { name: wrongShape }));
    expect(screen.getByText(/^Not quite: it starts/)).toBeInTheDocument();

    // Playing it back: focus on the first chime; a wrong one says where the right one is, and nothing's lost.
    expect(chime('C')).toHaveFocus();
    const wrong = e.notes[0] === 'C' ? 'E' : 'C';
    fireEvent.click(chime(wrong));
    expect(screen.getByText(new RegExp(`^That was ${wrong}\\. The first note is (higher|lower) — try another chime\\.$`))).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '0 of 2 notes played' })).toBeInTheDocument();
    fireEvent.click(chime(e.notes[0]));
    expect(screen.getByRole('list', { name: '1 of 2 notes played' })).toBeInTheDocument();
    fireEvent.click(chime(e.notes[1]));

    const name = TUNE_BY_ID[e.tune].name;
    expect(screen.getByRole('heading', { name: `${name}!` })).toHaveFocus();
    expect(screen.getByRole('heading', { name: `${name}!` })).toHaveAccessibleDescription(`${learnedLine(e)} ${name} is in the Songbook!`);
    expect(onPage).toHaveBeenCalledWith(e.tune, name);

    // Two more, each a note longer, then the round.
    fireEvent.click(screen.getByRole('button', { name: 'Next tune' }));
    const e2 = echoFor('gentle', 0, 1, queue);
    expect(e2.notes).toHaveLength(3);
    echoByEar(e2);
    fireEvent.click(screen.getByRole('button', { name: 'Next tune' }));
    const e3 = echoFor('gentle', 0, 2, queue);
    expect(e3.notes).toHaveLength(4);
    echoByEar(e3);
    fireEvent.click(screen.getByRole('button', { name: 'Take a bow!' }));
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three tunes echoed!', learned: learnedLine(e3) });
  });

  it('a held Enter on a chime rings once', () => {
    play('gentle');
    const held = new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true });
    chime('C').dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);
  });

  it('a chime tapped before playing back just rings; none while Lyra plays', () => {
    vi.useFakeTimers();
    play('gentle');
    fireEvent.click(chime('D'));
    expect(playTone).toHaveBeenLastCalledWith(CHIME.D.hz, 500);
    expect(screen.getByRole('heading', { name: 'Step 1 · Listen' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '▶ Listen' }));
    playTone.mockClear();
    fireEvent.click(chime('C'));
    expect(playTone).not.toHaveBeenCalled();
  });

  it('Medium: all five chimes and four to six notes', () => {
    vi.useFakeTimers();
    setUp(5);
    play('medium');
    expect(within(screen.getByRole('group', { name: 'The chimes, low to high' })).getAllByRole('button')).toHaveLength(5);
    expect(screen.getByRole('heading', { name: 'Step 1 · Listen' })).toHaveAccessibleDescription('Listen to Lyra’s four notes, then play them back on the chimes.');
  });

  it('Tricky: read the staff (no listening till it’s played); spot the note Lyra plays wrong; play it right', () => {
    vi.useFakeTimers();
    setUp(9);
    play('tricky');
    const queue = roundQueue('tricky', () => false, 0);
    const read = echoFor('tricky', 0, 0, queue);
    expect(screen.getByRole('heading', { name: 'Step 1 · Read the staff' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: /Listen/ })).toBeNull();
    // Each note is said by its place on the staff, not its name.
    const staff = within(screen.getByRole('group', { name: 'The staff' }));
    expect(staff.getAllByRole('img').map((x) => x.getAttribute('aria-label'))).toHaveLength(5);
    expect(staff.getAllByRole('img')[0]).toHaveAccessibleName(read.notes[0] === 'E' ? 'Note 1: on the bottom line' : /^Note 1: /);
    fireEvent.click(screen.getByRole('button', { name: { higher: 'Higher', lower: 'Lower', same: 'The same' }[shape(read.notes)] }));
    expect(screen.getByText(/^Yes — /)).toBeInTheDocument();
    for (const n of read.notes) fireEvent.click(chime(n));
    expect(staff.getAllByRole('img')[0]).toHaveAccessibleName(new RegExp(`, played: ${read.notes[0]}$`));
    expect(screen.getByRole('button', { name: '▶ Hear it again' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next tune' }));

    const spot = echoFor('tricky', 0, 1, queue);
    expect(spot.mode).toBe('wrong');
    listen();
    expect(heard()).toContain(`${spot.played[spot.wrongAt!]} (`);
    fireEvent.click(screen.getByRole('button', { name: 'Next — which was wrong?' }));
    expect(screen.getByRole('heading', { name: 'Step 2 · Which note was wrong?' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: /^Note 1:/ }));
    expect(screen.getByText(/^The first note was right/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Step 2 · Which note was wrong?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Note ${spot.wrongAt! + 1}:`) }));
    expect(screen.getByRole('heading', { name: 'Step 3 · Play it right' })).toBeInTheDocument();
    for (const n of spot.notes) fireEvent.click(chime(n));
    expect(screen.getByRole('heading', { name: `${TUNE_BY_ID[spot.tune].name}!` })).toHaveAccessibleDescription(new RegExp(`a step too (high|low)\\.`));
  });

  it('the sound switch turns the device’s sound effects on and off', () => {
    play('gentle');
    const sw = screen.getAllByRole('button', { name: /^Chime sounds (on|off)$/ })[0];
    expect(sw).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(sw);
    expect(useSettingsStore.getState().sfx).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Chime sounds on' })[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('the Songbook: a page read out by Lyra and under the book, with its notes; tunes not in it come first', () => {
    setUp(5, { [pageFlag('echos-call', 'hot-cross-buns')]: true, [pageFlag('echos-call', 'mary')]: true });
    play('medium');
    expect(screen.getByText('2 of 8 pages')).toBeInTheDocument();
    expect(screen.getByText('ECHO FRÈRE JACQUES')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mary Had a Little Lamb. Read the page' }));
    expect(screen.getAllByText(/same three notes as Hot Cross Buns/)).toHaveLength(2);
    expect(within(screen.getByRole('region', { name: 'Songbook' })).getByText('Starts:').parentElement).toHaveTextContent('Starts:EDCDEEE');
  });

  it('through the stage: three tunes, the reward, star 1 and a Rainbow Ward', async () => {
    render(<MiniGameStage game="echos-call" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s play!' }));
    await screen.findByRole('heading', { name: 'Step 1 · Listen' });
    vi.useFakeTimers();
    const queue = roundQueue('gentle', () => false, 0);
    for (const i of [0, 1, 2]) {
      echoByEar(echoFor('gentle', 0, i, queue));
      fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next tune' : 'Take a bow!' }));
    }
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Three tunes echoed!' })).toBeInTheDocument());
    expect(save().flags[starFlag('echos-call', 1)]).toBe(true);
    expect(save().items.ward).toBe(defaultSave().items.ward + 1);
    expect(Object.keys(save().flags).filter((f) => f.startsWith('mg:echos-call:page:'))).toHaveLength(3);
  });
});
