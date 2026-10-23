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
const { MINIGAMES } = await import('../../../content/minigames');
const { jobFor } = await import('../../../lib/minigames/forge');

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
const dot = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';
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
    expect(slot(0)).toHaveAccessibleName(`First part: ${first}`);
    expect(document.activeElement).toBe(tile(second));
    // A double Enter's second, on the part focus moved to: nothing.
    fireEvent.click(tile(second), { detail: 0 });
    expect(slot(1)).toHaveAccessibleName('Second part, empty');
    wait();
    fireEvent.click(tile(second), { detail: 0 });
    expect(slot(1)).toHaveAccessibleName(`Second part: ${second}`);
    expect(document.activeElement).toBe(hammer());
    // A held Enter's repeats press nothing.
    expect(fireEvent.keyDown(hammer(), { key: 'Enter', repeat: true })).toBe(false);
    expect(fireEvent.keyDown(tile(third), { key: 'Enter', repeat: true })).toBe(false);
    expect(fireEvent.keyDown(hammer(), { key: 'Enter' })).toBe(true);
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
