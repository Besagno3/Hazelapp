import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';

// A double tap, a double Enter and a held one (code and UX review round 1: the main tests stand in an always-ready wait):
// a step's buttons wait a moment as it starts, and after a wrong try. The clock is stood in for (performance.now).
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  sfx: () => {},
}));

const { default: WordForge } = await import('./WordForge');
const { SETTLE_MS } = await import('../useSettled');
const { useSaveStore } = await import('../../../store/saveStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES, pageFlag } = await import('../../../content/minigames');
const { jobFor, rootChoices, rootWords } = await import('../../../lib/minigames/forge');

let now = 0;
beforeEach(() => {
  now = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  useSaveStore.setState({ userId: null, save: defaultSave(), status: 'ready', remoteError: null });
  fireEvent.pointerDown(document.body);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const wait = (ms = SETTLE_MS) => act(() => void (now += ms));
const dot = () => (document.querySelector('[aria-live="polite"]')?.textContent ?? '').replace(/\u2060/g, '');
const tray = () => screen.getByRole('group', { name: /^The tray of word parts/ });
const tile = (name: string) => within(tray()).getByRole('button', { name: new RegExp(`^${name}(,|$)`) });
const slot = (k: number) => screen.getByRole('button', { name: new RegExp(`^${k === 0 ? 'First' : 'Second'} part`) });
const hammer = () => screen.getByRole('button', { name: '🔨 Hammer!' });
const play = () => render(<WordForge def={MINIGAMES['word-forge']} band="gentle" round={0} onPage={() => true} onFinish={() => {}} />);

describe('🔨 a double tap', () => {
  it('a part tapped as a word starts does nothing; a double tap on Hammer after a wrong try keeps what Dot said (code and UX review round 1)', () => {
    play();
    fireEvent.click(tile('sun'));
    expect(slot(0)).toHaveAccessibleName('First part, empty');
    wait();
    fireEvent.click(tile('flower'));
    fireEvent.click(tile('sun'));
    fireEvent.click(hammer());
    const said = dot();
    expect(said).toContain('Flowersun isn’t a word — try them the other way round!');
    // The second tap of the double: not "Two parts on the anvil first".
    fireEvent.click(hammer());
    expect(dot()).toBe(said);
    wait();
    fireEvent.click(hammer());
    expect(dot()).toContain('Two parts on the anvil first — two to go.');
  });

  it('Next tapped as the forged word’s card comes does nothing — it lands where Hammer was (code review round 2: untested)', () => {
    play();
    wait();
    const [a, b] = jobFor('gentle', 0, 0).word.parts;
    fireEvent.click(tile(a));
    fireEvent.click(tile(b));
    fireEvent.click(hammer());
    expect(screen.getByRole('heading', { name: 'Sunflower!' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next word' }), { detail: 1 });
    expect(screen.getByRole('heading', { name: 'Sunflower!' })).toBeInTheDocument();
    wait();
    fireEvent.click(screen.getByRole('button', { name: 'Next word' }), { detail: 1 });
    expect(screen.queryByRole('heading', { name: 'Sunflower!' })).not.toBeInTheDocument();
  });

  it('Next from a key acts at once (no click count): only a tap’s second press is held back', () => {
    play();
    wait();
    const [a, b] = jobFor('gentle', 0, 0).word.parts;
    fireEvent.click(tile(a));
    fireEvent.click(tile(b));
    fireEvent.click(hammer());
    fireEvent.click(screen.getByRole('button', { name: 'Next word' }), { detail: 0 });
    expect(screen.queryByRole('heading', { name: 'Sunflower!' })).not.toBeInTheDocument();
  });

  it('a place on the anvil or a page of the wall tapped as a word starts does nothing (code review round 2: untested)', () => {
    useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags: { [pageFlag('word-forge', 'rain')]: true } }, status: 'ready', remoteError: null });
    play();
    const before = dot();
    fireEvent.click(slot(0));
    expect(dot()).toBe(before);
    const page = screen.getByRole('button', { name: 'Rain words. Read the page' });
    fireEvent.click(page, { detail: 1 });
    expect(page).toHaveAttribute('aria-pressed', 'false');
    wait();
    fireEvent.click(slot(0));
    expect(dot()).toContain('Tap a part in the tray — it goes on the anvil.');
    fireEvent.click(page, { detail: 1 });
    expect(page).toHaveAttribute('aria-pressed', 'true');
  });

  it('a page opened comes into sight, and a tap as it does is let be — it could land on another page; a key acts at once (UX review round 2)', () => {
    useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags: { [pageFlag('word-forge', 'rain')]: true, [pageFlag('word-forge', 'sun')]: true } }, status: 'ready', remoteError: null });
    const scrolled = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(2000);
    const to = vi.fn();
    HTMLElement.prototype.scrollTo = to;
    play();
    wait();
    to.mockClear();
    const rain = screen.getByRole('button', { name: 'Rain words. Read the page' });
    const sun = screen.getByRole('button', { name: 'Sun words. Read the page' });
    fireEvent.click(rain, { detail: 1 });
    expect(rain).toHaveAttribute('aria-pressed', 'true');
    expect(to).toHaveBeenCalled();
    // The second tap of a double, on the page now under the finger: nothing.
    fireEvent.click(sun, { detail: 2 });
    expect(rain).toHaveAttribute('aria-pressed', 'true');
    expect(sun).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(sun, { detail: 0 });
    expect(sun).toHaveAttribute('aria-pressed', 'true');
    wait();
    fireEvent.click(sun, { detail: 1 });
    expect(sun).toHaveAttribute('aria-pressed', 'false');
    scrolled.mockRestore();
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
  });
});

describe('🔨 Expert’s root, a double tap', () => {
  it('a meaning tapped as the question comes (Hammer was under the finger) isn’t picked; a moment later it is; a key at once', () => {
    render(<WordForge def={MINIGAMES['word-forge']} band="expert" round={0} onPage={() => true} onFinish={() => {}} />);
    wait();
    const job = jobFor('expert', 0, 0);
    const [a, b] = job.word.parts;
    fireEvent.click(tile(a));
    wait();
    fireEvent.click(tile(b));
    wait();
    fireEvent.click(hammer());
    expect(screen.getByRole('heading', { name: 'What does it mean?' })).toBeInTheDocument();
    const wrong = rootChoices(job).find((m) => !rootWords(job, m).right)!;
    const right = rootChoices(job).find((m) => rootWords(job, m).right)!;
    fireEvent.click(screen.getByRole('button', { name: `“${wrong}”` }), { detail: 1 });
    expect(dot()).not.toContain(`Not “${wrong}”`);
    fireEvent.click(screen.getByRole('button', { name: `“${wrong}”` }), { detail: 0 });
    expect(dot()).toContain(`Not “${wrong}”`);
    expect(screen.getByRole('button', { name: `“${wrong}”, tried` })).toBeInTheDocument();
    wait();
    fireEvent.click(screen.getByRole('button', { name: `“${right}”` }), { detail: 1 });
    expect(screen.getByRole('heading', { name: 'Solar' })).toBeInTheDocument();
  });
});

describe('🔨 the keyboard', () => {
  afterEach(() => {
    fireEvent.pointerDown(document.body);
  });

  it('from a key: the first part focused; each part placed moves focus on to the next, then Hammer — a quick second Enter there does nothing (code and UX review round 1: focus fell out of the game)', () => {
    fireEvent.keyDown(document.body, { key: 'Tab' });
    play();
    const job = jobFor('gentle', 0, 0);
    const [first, second, third] = job.tiles;
    expect(document.activeElement).toBe(tile(first));
    wait();
    // A key's click (no pointer, no click count) on the focused part.
    fireEvent.click(tile(first), { detail: 0 });
    expect(slot(0)).toHaveAccessibleName(`First part: ${first} (take it back)`);
    expect(document.activeElement).toBe(tile(second));
    // A double Enter's second, on the part focus moved to: nothing.
    fireEvent.click(tile(second), { detail: 0 });
    expect(slot(1)).toHaveAccessibleName('Second part, empty');
    wait();
    fireEvent.click(tile(second), { detail: 0 });
    expect(slot(1)).toHaveAccessibleName(`Second part: ${second} (take it back)`);
    expect(document.activeElement).toBe(hammer());
    // A double Enter's second on Hammer, where focus moved: nothing (code review round 2: untested).
    const both = dot();
    fireEvent.click(hammer(), { detail: 0 });
    expect(dot()).toBe(both);
    // A held Enter's repeats press nothing.
    expect(fireEvent.keyDown(hammer(), { key: 'Enter', repeat: true })).toBe(false);
    expect(fireEvent.keyDown(tile(third), { key: 'Enter', repeat: true })).toBe(false);
    expect(fireEvent.keyDown(hammer(), { key: 'Enter' })).toBe(true);
  });

  it('from a key: focus goes to the part after the one placed; a quick press on another part isn’t held back (code review round 2: untested)', () => {
    fireEvent.keyDown(document.body, { key: 'Tab' });
    play();
    wait();
    const tiles = jobFor('gentle', 0, 0).tiles;
    tile(tiles[1]).focus();
    fireEvent.click(tile(tiles[1]), { detail: 0 });
    expect(document.activeElement).toBe(tile(tiles[2]));
    // Not where focus moved: placed at once.
    fireEvent.click(tile(tiles[0]), { detail: 0 });
    expect(slot(1)).toHaveAccessibleName(`Second part: ${tiles[0]} (take it back)`);
  });

  it('from a key: after a wrong try, focus back on the tray’s first part', () => {
    fireEvent.keyDown(document.body, { key: 'Tab' });
    play();
    wait();
    const job = jobFor('gentle', 0, 0);
    const [a, b] = job.word.parts;
    tile(b).focus();
    fireEvent.click(tile(b), { detail: 0 });
    wait();
    fireEvent.click(tile(a), { detail: 0 });
    expect(document.activeElement).toBe(hammer());
    wait();
    fireEvent.click(hammer(), { detail: 0 });
    expect(dot()).toContain('try them the other way round!');
    expect(document.activeElement).toBe(tile(job.tiles[0]));
  });

  it('from a tap: focus stays in the game — the tray, no ring on a part', () => {
    play();
    wait();
    const job = jobFor('gentle', 0, 0);
    tile(job.tiles[0]).focus();
    fireEvent.pointerDown(tile(job.tiles[0]));
    fireEvent.click(tile(job.tiles[0]));
    expect(tray()).toHaveFocus();
  });
});
