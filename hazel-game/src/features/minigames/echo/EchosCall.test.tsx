import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

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
// A step's buttons always ready here (the wait after a step starts is tested in EchosCall.taps.test).
vi.mock('../useSettled', () => ({ useSettled: () => () => true, SETTLE_MS: 450 }));
const playTone = vi.fn();
const wakeTones = vi.fn();
vi.mock('../../../lib/tones', () => ({ playTone: (...a: unknown[]) => playTone(...a), wakeTones: () => wakeTones() }));

const { default: MiniGameStage } = await import('../MiniGameStage');
const { default: EchosCall } = await import('./EchosCall');
const { useSaveStore } = await import('../../../store/saveStore');
const { useProfileStore } = await import('../../../store/profileStore');
const { useSettingsStore } = await import('../../../store/settingsStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES, pageFlag, starFlag } = await import('../../../content/minigames');
const { CHIME, STAFF_LINES, TUNE_BY_ID, echoFor, learnedLine, roundQueue, shape, staffY } = await import('../../../lib/minigames/echo');
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
  wakeTones.mockClear();
  setUp(2);
  useSettingsStore.setState({ sfx: false });
});

afterEach(() => {
  vi.useRealTimers();
});

const save = () => useSaveStore.getState().save!;
const chimes = () => screen.getByRole('group', { name: 'The chimes, low to high' });
const chime = (n: string) => within(chimes()).getByRole('button', { name: new RegExp(`^${n},`) });
const heard = () => document.querySelector('[role="status"].sr-only')?.textContent ?? '';
/** What Lyra says: her bubble (the live region). */
const lyra = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';
const slots = () => Array.from(document.querySelectorAll<HTMLElement>('ol li'));
const listenButton = () => screen.getByRole('button', { name: /^(▶ Listen|↻ Listen again|♪ Listening…)$/ });
const SHAPE_LABEL = { higher: 'Higher', lower: 'Lower', same: 'The same' } as const;

function play(band: Band, round = 0, page = true) {
  const onPage = vi.fn(() => page);
  const onFinish = vi.fn();
  const r = render(<EchosCall def={MINIGAMES['echos-call']} band={band} round={round} onPage={onPage} onFinish={onFinish} />);
  return { onPage, onFinish, unmount: r.unmount };
}

/** Lyra plays to the end. */
function listen() {
  fireEvent.click(listenButton());
  act(() => {
    vi.advanceTimersByTime(10_000);
  });
}

/** An ear echo, start to end: listen, the shape, the notes. */
function echoByEar(e: Echo) {
  listen();
  fireEvent.click(screen.getByRole('button', { name: /^Next — / }));
  fireEvent.click(screen.getByRole('button', { name: SHAPE_LABEL[shape(e.notes)] }));
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
    const e = echoFor('gentle', 0, 0, queue); // Hot Cross Buns: E D
    expect(e.notes.join(' ')).toBe('E D');
    expect(screen.getByRole('heading', { name: 'Step 1 · Listen' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Step 1 · Listen' })).toHaveAccessibleDescription('Listen to Lyra’s two notes, then play them back on the chimes.');
    // Three chimes on Gentle, each its letter and colour.
    expect(within(chimes()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['C, red', 'D, orange', 'E, yellow']);
    // Next to her question is kept a place, out of sight, till she's played.
    expect(screen.queryByRole('button', { name: 'Next — up or down?' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '▶ Listen' }));
    // The sound's woken in the tap (her notes ring from a timer).
    expect(wakeTones).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '♪ Listening…' })).toHaveAttribute('aria-disabled', 'true');
    expect(lyra()).toContain('Watch the chimes light up!');
    act(() => {
      vi.advanceTimersByTime(800);
    });
    // The first note lights its chime (a ♪ over it) and rings.
    expect(chime('E').textContent).toContain('♪');
    expect(playTone).toHaveBeenCalledWith(CHIME.E.hz);
    expect(chime('E')).toHaveAttribute('aria-disabled', 'true');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(heard()).toBe('Lyra played 2 notes: E (yellow), D (orange).');
    expect(playTone).toHaveBeenCalledTimes(2);
    expect(lyra()).toContain('Again, or on to my question?');

    fireEvent.click(screen.getByRole('button', { name: 'Next — up or down?' }));
    expect(screen.getByRole('heading', { name: 'Step 2 · Up or down?' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Higher' }));
    // Said by Lyra, and in the step's card by the chimes (her bubble's below the fold on a phone).
    expect(screen.getAllByText('Not quite: it starts on E and ends on D — a longer chime, further left. Lower!')).toHaveLength(2);

    // Playing it back: focus on the first chime, which the step describes; a wrong one says where the right one is.
    expect(chime('C')).toHaveFocus();
    expect(chimes()).toHaveAccessibleDescription('Tap the chimes in the same order. 0 of 2 played.');
    fireEvent.click(chime('C'));
    expect(screen.getAllByText('That was C. The first note is higher — a shorter chime, further right.')).toHaveLength(2);
    expect(screen.getByRole('list', { name: '0 of 2 notes played' })).toBeInTheDocument();
    fireEvent.click(chime('E'));
    expect(screen.getByRole('list', { name: '1 of 2 notes played' })).toBeInTheDocument();
    expect(lyra()).toContain('E — yes! 1 of 2.');
    // Too high a chime is a miss too: where the right one is, and nothing more played.
    fireEvent.click(chime('E'));
    expect(screen.getAllByText('That was E. The second note is lower — a longer chime, further left.')).toHaveLength(2);
    expect(screen.getByRole('list', { name: '1 of 2 notes played' })).toBeInTheDocument();
    // One note short isn't the tune.
    expect(screen.getByRole('heading', { name: 'Step 3 · Play it back' })).toBeInTheDocument();
    expect(onPage).not.toHaveBeenCalled();
    fireEvent.click(chime('D'));

    const name = TUNE_BY_ID[e.tune].name;
    expect(screen.getByRole('heading', { name: `${name}!` })).toHaveFocus();
    expect(screen.getByRole('heading', { name: `${name}!` })).toHaveAccessibleDescription(`${learnedLine(e)} ${name} is in the Songbook!`);
    expect(onPage).toHaveBeenCalledTimes(1);
    expect(onPage).toHaveBeenCalledWith(e.tune, name);
    // Lyra cheers (not "That's the whole tune!" again) — in the card too; the chimes light up low to high, then rest.
    expect(lyra()).toContain('Bravo! That’s just how it goes. Ready for the next one?');
    expect(screen.getAllByText('Bravo! That’s just how it goes. Ready for the next one?')).toHaveLength(2);

    // Two more, each a note longer, then the round.
    fireEvent.click(screen.getByRole('button', { name: 'Next tune' }));
    const e2 = echoFor('gentle', 0, 1, queue);
    expect(e2.notes).toHaveLength(3);
    echoByEar(e2);
    expect(lyra()).toContain('La la LAAA — a perfect echo! Ready for the next one?');
    fireEvent.click(screen.getByRole('button', { name: 'Next tune' }));
    const e3 = echoFor('gentle', 0, 2, queue);
    expect(e3.notes).toHaveLength(4);
    echoByEar(e3);
    expect(lyra()).toContain('Take a bow!');
    fireEvent.click(screen.getByRole('button', { name: 'Take a bow!' }));
    expect(onFinish).toHaveBeenCalledWith({ title: 'Three tunes echoed!', learned: learnedLine(e3) });
  });

  it('Listen is one button, kept as she plays and after — “Listen again” — with Next under it, so focus stays and a tap again replays', () => {
    vi.useFakeTimers();
    play('gentle');
    const button = screen.getByRole('button', { name: '▶ Listen' });
    expect(button).toHaveClass('bg-amber-300');
    expect(document.querySelector('[aria-current="step"]')).toHaveTextContent('Listen');
    button.focus();
    fireEvent.click(button);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(button).toHaveAccessibleName('↻ Listen again');
    expect(button).toHaveFocus();
    // Gold till heard, then quiet: Next is the gold one now.
    expect(button).not.toHaveClass('bg-amber-300');
    // Next comes after it.
    const next = screen.getByRole('button', { name: 'Next — up or down?' });
    expect(button.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Pressed again while she plays: nothing new (no second tune over the first).
    fireEvent.click(button);
    fireEvent.click(button);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(playTone).toHaveBeenCalledTimes(4);
  });

  it('a wrong chime shakes the slot it was for, ringed red — till a right one; the next slot doesn’t; the next tune starts still', () => {
    vi.useFakeTimers();
    play('gentle');
    const shaking = () => slots().flatMap((li, k) => (li.hasAttribute('data-shake') ? [k] : []));
    listen();
    fireEvent.click(screen.getByRole('button', { name: 'Next — up or down?' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lower' }));
    expect(shaking()).toEqual([]);
    fireEvent.click(chime('C'));
    expect(shaking()).toEqual([0]);
    expect(slots()[0]).toHaveClass('border-red-400');
    fireEvent.click(chime('E'));
    expect(shaking()).toEqual([]);
    fireEvent.click(chime('D'));
    fireEvent.click(screen.getByRole('button', { name: 'Next tune' }));
    // Tune two: nothing carried over — not the notes, the shake, what was heard or said.
    expect(screen.getByRole('button', { name: '▶ Listen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next — up or down?' })).toBeNull();
    expect(heard()).toBe('');
    expect(lyra()).toContain('Here’s the start of a tune: 3 notes.');
    listen();
    fireEvent.click(screen.getByRole('button', { name: 'Next — up or down?' }));
    // Her question, not the last tune's words.
    expect(lyra()).toContain('Did the tune end higher, lower or the same as it started?');
    fireEvent.click(screen.getByRole('button', { name: 'Lower' }));
    expect(screen.getByRole('list', { name: '0 of 3 notes played' })).toBeInTheDocument();
    expect(shaking()).toEqual([]);
  });

  it('Listen again in the play step lights the slots already played as she passes them', () => {
    vi.useFakeTimers();
    play('gentle');
    listen();
    fireEvent.click(screen.getByRole('button', { name: 'Next — up or down?' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lower' }));
    fireEvent.click(chime('E'));
    fireEvent.click(screen.getByRole('button', { name: '↻ Listen again' }));
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(slots()[0].style.background).toBe('rgb(255, 255, 255)');
    expect(lyra()).toContain('Watch the chimes light up!');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(slots()[0].style.background).not.toBe('rgb(255, 255, 255)');
  });

  it('a chime tapped before playing back just rings — not judged; none while Lyra plays', () => {
    vi.useFakeTimers();
    play('gentle');
    fireEvent.click(chime('D'));
    expect(playTone).toHaveBeenLastCalledWith(CHIME.D.hz, 500);
    expect(screen.getByRole('heading', { name: 'Step 1 · Listen' })).toBeInTheDocument();
    expect(lyra()).toContain('Here’s the start of a tune');
    expect(screen.getByRole('list', { name: '0 of 2 notes played' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '▶ Listen' }));
    playTone.mockClear();
    fireEvent.click(chime('C'));
    expect(playTone).not.toHaveBeenCalled();
  });

  it('a held Enter on a chime rings once; the arrow keys move along the chimes', () => {
    play('gentle');
    const held = new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true });
    chime('C').dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);
    chime('C').focus();
    fireEvent.keyDown(chime('C'), { key: 'ArrowRight' });
    expect(chime('D')).toHaveFocus();
    fireEvent.keyDown(chime('D'), { key: 'ArrowUp' });
    expect(chime('E')).toHaveFocus();
    fireEvent.keyDown(chime('E'), { key: 'ArrowRight' });
    expect(chime('E')).toHaveFocus();
    fireEvent.keyDown(chime('E'), { key: 'ArrowLeft' });
    expect(chime('D')).toHaveFocus();
    fireEvent.keyDown(chime('D'), { key: 'ArrowDown' });
    expect(chime('C')).toHaveFocus();
  });

  it('answering while she plays stops her: the chimes are ready at once', () => {
    vi.useFakeTimers();
    play('gentle');
    listen();
    fireEvent.click(screen.getByRole('button', { name: 'Next — up or down?' }));
    fireEvent.click(screen.getByRole('button', { name: '↻ Listen again' }));
    act(() => {
      vi.advanceTimersByTime(800);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lower' }));
    expect(chime('C')).not.toHaveAttribute('aria-disabled');
    playTone.mockClear();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(playTone).not.toHaveBeenCalled();
  });

  it('Next tune while she plays it again stops her; leaving mid-tune rings nothing more', () => {
    vi.useFakeTimers();
    const { unmount } = play('gentle');
    echoByEar(echoFor('gentle', 0, 0));
    fireEvent.click(screen.getByRole('button', { name: '▶ Hear it again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next tune' }));
    playTone.mockClear();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(playTone).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '▶ Listen' })).not.toHaveAttribute('aria-disabled');
    fireEvent.click(screen.getByRole('button', { name: '▶ Listen' }));
    unmount();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(playTone).not.toHaveBeenCalled();
  });

  it('a tune echoed again (its page already in the Songbook) says what was learned, not “in the Songbook”', () => {
    vi.useFakeTimers();
    play('gentle', 0, false);
    const e = echoFor('gentle', 0, 0);
    echoByEar(e);
    expect(screen.getByRole('heading', { name: 'Hot Cross Buns!' })).toHaveAccessibleDescription(learnedLine(e));
  });

  it('with the sound off, Lyra asks for it on — or to watch; with it on, just Listen', () => {
    play('gentle');
    expect(lyra()).toContain('Here’s the start of a tune: 2 notes. My chimes are quiet — tap 🔇 Sounds to hear them, or just watch them light up!');
    act(() => useSettingsStore.setState({ sfx: true }));
    expect(lyra()).toContain('Here’s the start of a tune: 2 notes. Press Listen!');
  });

  it('Gentle, every tune its chimes play already in the Songbook: Lyra says there are more on Medium', () => {
    const all = Object.fromEntries(roundQueue('gentle', () => false, 0).map((id) => [pageFlag('echos-call', id), true]));
    setUp(2, all);
    play('gentle');
    expect(lyra()).toContain('You know every tune my three chimes can play — try Medium for three more!');
    // Not when there's a page still to find.
    cleanup();
    setUp(2, { [pageFlag('echos-call', 'mary')]: true });
    play('gentle');
    expect(lyra()).not.toContain('You know every tune');
  });

  it('Medium: all five chimes and four to six notes', () => {
    vi.useFakeTimers();
    setUp(5);
    play('medium');
    expect(within(chimes()).getAllByRole('button')).toHaveLength(5);
    // Long to short, low to high.
    const tall = within(chimes())
      .getAllByRole('button')
      .map((b) => parseFloat(b.style.height));
    expect(tall).toEqual([...tall].sort((a, b) => b - a));
    expect(new Set(tall).size).toBe(5);
    expect(screen.getByRole('heading', { name: 'Step 1 · Listen' })).toHaveAccessibleDescription('Listen to Lyra’s four notes, then play them back on the chimes.');
  });

  it('Tricky: read the staff (no listening till it’s played); spot the note Lyra plays wrong; play it right — and hear it right', () => {
    vi.useFakeTimers();
    setUp(9);
    play('tricky');
    const queue = roundQueue('tricky', () => false, 0);
    const read = echoFor('tricky', 0, 0, queue); // Hot Cross Buns, five: E D C E D
    expect(screen.getByRole('heading', { name: 'Step 1 · Read the staff' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: /Listen/ })).toBeNull();
    // Each note is said by its place on the staff, not its name.
    const staff = within(screen.getByRole('group', { name: 'The staff' }));
    expect(staff.getAllByRole('img').map((x) => x.getAttribute('aria-label'))).toEqual([
      'Note 1: on the bottom line',
      'Note 2: just under the staff',
      'Note 3: on a little line below the staff',
      'Note 4: on the bottom line',
      'Note 5: just under the staff',
    ]);
    // Drawn where they're said: each head on its line or space, the ledger line under C alone.
    const heads = staff.getAllByRole('img').map((c) => Number(c.querySelector('ellipse')!.getAttribute('cy')));
    expect(heads).toEqual(read.notes.map(staffY));
    expect(heads[0]).toBe(STAFF_LINES[4]); // E: the bottom line
    expect(staff.getAllByRole('img').map((c) => !!c.querySelector('[data-ledger]'))).toEqual(read.notes.map((n) => n === 'C'));
    fireEvent.click(screen.getByRole('button', { name: SHAPE_LABEL[shape(read.notes)] }));
    expect(screen.getAllByText('Yes — lower: it starts on the bottom line and ends just under the staff, lower down.')).toHaveLength(2);
    // The note to play next is outlined; a miss rings it red.
    const col = (k: number) => staff.getAllByRole('img')[k];
    expect(col(0)).toHaveClass('outline-dashed');
    fireEvent.click(chime('C'));
    expect(col(0)).toHaveClass('cg-shake');
    expect(lyra()).not.toMatch(/\bon [A-G]\b/);
    for (const n of read.notes) fireEvent.click(chime(n));
    expect(staff.getAllByRole('img')[0]).toHaveAccessibleName('Note 1: on the bottom line, played: E');
    expect(screen.getByRole('button', { name: '▶ Hear it again' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next tune' }));

    // Mary, six: E D C D E E — Lyra plays the C as a D.
    const spot = echoFor('tricky', 0, 1, queue);
    expect(spot.mode).toBe('wrong');
    // As she plays, the note she's on is marked (an ink ring and a ▼).
    fireEvent.click(screen.getByRole('button', { name: '▶ Listen' }));
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(staff.getAllByRole('img')[0].querySelector('[data-marker]')).not.toBeNull();
    expect(staff.getAllByRole('img')[1].querySelector('[data-marker]')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(lyra()).toContain('Again, or on to the wrong note?');
    // Nothing left lit once she's done.
    expect(within(chimes()).getAllByRole('button').some((b) => b.textContent?.includes('♪'))).toBe(false);
    expect(heard()).toBe('Lyra played 6 notes: E (yellow), D (orange), D (orange), D (orange), E (yellow), E (yellow).');
    fireEvent.click(screen.getByRole('button', { name: 'Next — which was wrong?' }));
    // A chime tapped here just rings, and says where to look.
    fireEvent.click(chime('D'));
    expect(screen.getAllByText('That chime just rings — tap the note on the staff that didn’t match it.')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /^Note 1:/ })).toHaveClass('border-dashed');
    screen.getByRole('button', { name: /^Note 1:/ }).focus();
    // Focus on the staff's first note, its group described by what to do.
    expect(screen.getByRole('button', { name: /^Note 1:/ })).toHaveFocus();
    expect(screen.getByRole('group', { name: 'The staff' })).toHaveAccessibleDescription('Tap the note on the staff that Lyra played wrong.');
    fireEvent.click(screen.getByRole('button', { name: /^Note 1:/ }));
    expect(screen.getAllByText('The first note was right: the staff says E, and Lyra played E. Watch the chimes again!')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Step 2 · Which note was wrong?' })).toBeInTheDocument();
    // Picked while she plays it again: she stops.
    fireEvent.click(screen.getByRole('button', { name: '↻ Listen again' }));
    act(() => {
      vi.advanceTimersByTime(800);
    });
    fireEvent.click(screen.getByRole('button', { name: /^Note 3:/ }));
    expect(screen.getAllByText('Yes — the third note! Lyra played D, but the staff says C.')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Step 3 · Play it right' })).toBeInTheDocument();
    expect(chimes()).toHaveAccessibleDescription('Play what the staff says — with the right note. 0 of 6 played.');
    // Heard again now, it's as written.
    listen();
    expect(heard()).toBe('Lyra played 6 notes: E (yellow), D (orange), C (red), D (orange), E (yellow), E (yellow).');
    for (const n of spot.notes) fireEvent.click(chime(n));
    expect(screen.getByRole('heading', { name: 'Mary Had a Little Lamb!' })).toHaveAccessibleDescription(`${learnedLine(spot)} Mary Had a Little Lamb is in the Songbook!`);
    fireEvent.click(screen.getByRole('button', { name: '▶ Hear it again' }));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(heard()).toBe('Lyra played 6 notes: E (yellow), D (orange), C (red), D (orange), E (yellow), E (yellow).');

    // The third: read from the staff again — no listening, the steps from the start.
    fireEvent.click(screen.getByRole('button', { name: 'Next tune' }));
    expect(screen.getByRole('heading', { name: 'Step 1 · Read the staff' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: /Listen/ })).toBeNull();
    expect(document.querySelector('[aria-current="step"]')).toHaveTextContent('Read: up or down?');
  });

  it('each step on a phone scrolls the page back to the board’s top — as little as shows its gold button; a tune’s result, to its Next', () => {
    vi.useFakeTimers();
    const { container } = render(<EchosCall def={MINIGAMES['echos-call']} band="gentle" round={0} onPage={() => true} onFinish={() => {}} />);
    const page = container.firstElementChild as HTMLElement;
    const board = document.querySelector('section[aria-labelledby="ec-step"]') as HTMLElement;
    // A page that scrolls: 500 tall, its board 100 down, every button's bottom at 900.
    Object.defineProperty(page, 'scrollHeight', { value: 1500 });
    Object.defineProperty(page, 'clientHeight', { value: 500 });
    const scrollTo = vi.fn();
    page.scrollTo = scrollTo as unknown as typeof page.scrollTo;
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON() {} }) as DOMRect;
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this === page) return rect(0, 500);
      if (this === board) return rect(100, 800);
      return rect(0, 900);
    });
    try {
      listen();
      fireEvent.click(screen.getByRole('button', { name: 'Next — up or down?' }));
      // The shape step: the board's top (100), not as far as its buttons (900 + 12 − 500 = 412).
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 100, behavior: 'auto' });
      fireEvent.click(screen.getByRole('button', { name: 'Lower' }));
      fireEvent.click(chime('E'));
      fireEvent.click(chime('D'));
      // The result: on to Next.
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 412, behavior: 'auto' });
    } finally {
      spy.mockRestore();
    }
  });

  it('where the page doesn’t scroll (a split screen), the step’s gold button is brought into view instead', () => {
    const into = vi.fn();
    const was = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = into;
    try {
      play('gentle');
      // The listen step's: Next's place, kept under Listen.
      expect(into.mock.contexts.at(-1)).toHaveTextContent('Next — up or down?');
    } finally {
      Element.prototype.scrollIntoView = was;
    }
  });

  it('the sound switch: always “Sounds”, pressed when on; turned on, it rings a chime at once', () => {
    play('gentle');
    const sw = screen.getAllByRole('button', { name: 'Sounds' })[0];
    expect(sw).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(sw);
    expect(useSettingsStore.getState().sfx).toBe(true);
    expect(playTone).toHaveBeenCalledWith(CHIME.E.hz, 400);
    expect(screen.getAllByRole('button', { name: 'Sounds' })[0]).toHaveAttribute('aria-pressed', 'true');
    playTone.mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: 'Sounds' })[0]);
    expect(useSettingsStore.getState().sfx).toBe(false);
    expect(playTone).not.toHaveBeenCalled();
  });

  it('the Songbook: only pages echoed, each read out by Lyra and under the book, with its notes; tunes not in it come first', () => {
    setUp(5, { [pageFlag('echos-call', 'hot-cross-buns')]: true, [pageFlag('echos-call', 'mary')]: true });
    play('medium');
    const book = within(screen.getByRole('region', { name: 'Songbook' }));
    expect(screen.getByText('2 of 8 pages')).toBeInTheDocument();
    expect(book.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Hot Cross Buns. Read the page', 'Mary Had a Little Lamb. Read the page']);
    expect(book.getAllByRole('img', { name: 'A tune not echoed yet' })).toHaveLength(6);
    expect(screen.getByText('ECHO FRÈRE JACQUES')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mary Had a Little Lamb. Read the page' }));
    expect(screen.getAllByText(/same three notes as Hot Cross Buns/)).toHaveLength(2);
    expect(book.getByText('Starts:').parentElement).toHaveTextContent('Starts:EDCDEEE');
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
