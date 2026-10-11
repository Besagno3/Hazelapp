import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, act, fireEvent } from '@testing-library/react';
import { create } from 'zustand';

// The canvas is KaPlay — stand in a div.
vi.mock('./WorldCanvas', () => ({ default: () => <div data-testid="canvas" /> }));
vi.mock('canvas-confetti', () => ({ default: Object.assign(vi.fn(), { reset: vi.fn() }) }));
vi.mock('../../lib/audio', () => ({ playMusic: vi.fn(), sfx: vi.fn(), unlockAudio: vi.fn() }));
vi.mock('../../lib/questions', () => ({
  prefetchQuestions: vi.fn(),
  fetchQuestions: vi.fn(async (topic: string, _age: number, level: number, count: number) =>
    Array.from({ length: count }, (_, i) => ({ id: `${topic}-${i}`, topic, level, text: `${i} + 2?`, options: ['a', 'b', 'c', 'd'], correctIndex: 0 })),
  ),
  BATTLE_QUESTION_COUNT: 3,
}));
// The game-flow machine, reduced to which overlay is open.
const flow = create<{ overlay: string | null }>(() => ({ overlay: null }));
vi.mock('../../machines/gameFlow', () => ({
  sendFlow: (e: { type: string }) => {
    if (e.type === 'CLOSE') flow.setState({ overlay: null });
    if (e.type === 'OPEN_MENU') flow.setState({ overlay: 'menu' });
  },
  useFlow: <T,>(sel: (s: unknown) => T) => {
    const overlay = flow((s) => s.overlay);
    return sel({
      matches: (v: { world: string }) => overlay !== null && v.world === overlay,
      context: { npcId: null, service: null, pathTarget: null },
    });
  },
}));

// Browsers reflect `el.inert` to the attribute (`el.inert = false` removes it);
// jsdom has no such property, so a stray `.inert =` would go unseen. Mirror the
// browser here, so these tests catch it (#75 item 14b review).
if (!('inert' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'inert', {
    get(this: HTMLElement) {
      return this.hasAttribute('inert');
    },
    set(this: HTMLElement, v: boolean) {
      if (v) this.setAttribute('inert', '');
      else this.removeAttribute('inert');
    },
    configurable: true,
  });
}

const { default: WorldScreen } = await import('./WorldScreen');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { defaultSave } = await import('../../lib/save');
const { INTRO_SEEN, DAWNREACH_SEEN, EMBER_HATCHED, SPIRE_CLEARED, ENDING_SEEN, ACT2_SEEN } = await import('../../content/story');
const { addFakeActTwoCrystal } = await import('../../test/fakeCrystal');
const { actCrystals, crystalFlag } = await import('../../content/topics');

const switchPlayer = () => within(screen.getByTestId('world-topbar')).getByRole('button', { name: /Switch player/, hidden: true });
const isInert = (el: Element) => el.closest('[inert]') !== null;

/** Every crystal restored and its scene seen — the Spire is open. */
const ALL_CRYSTALS: Record<string, boolean> = {
  [INTRO_SEEN]: true,
  [DAWNREACH_SEEN]: true,
  [EMBER_HATCHED]: true,
  'ember-hatch-seen': true,
  'spire-awake-seen': true,
  'ending-seen': true,
  ...Object.fromEntries(
    actCrystals(1).flatMap((t) => [
      [crystalFlag(t.id), true],
      [crystalFlag(t.id).replace('-restored', '-scene-seen'), true],
    ]),
  ),
};

/** Read through the Spire's opening lines (each ignores a tap in its first 250 ms). */
async function readIntro() {
  for (let i = 0; i < 12 && !screen.queryByRole('button', { name: '🚪 Leave the Spire' }); i++) {
    await act(() => new Promise((r) => setTimeout(r, 260)));
    const next = screen.queryByText('▼ tap to continue');
    if (next) fireEvent.click(next);
  }
  expect(screen.getByRole('button', { name: '🚪 Leave the Spire' })).toBeInTheDocument();
}

describe('keyboard and screen readers reach every overlay (#75 item 14b review)', () => {
  beforeEach(() => {
    flow.setState({ overlay: null });
    useSaveStore.setState({
      userId: null,
      status: 'ready',
      save: { ...defaultSave(), avatarId: 'a3', zoneId: 'clockwork-depths-b2', flags: { [INTRO_SEEN]: true, [DAWNREACH_SEEN]: true } },
      flush: vi.fn(async () => {}),
    });
    useProfileStore.setState({
      profile: {
        id: 'u1',
        birthYear: 2016,
        birthMonth: 3,
        skillLevels: {},
        xp: 250,
        powerUps: {},
        currentStreak: 5,
        longestStreak: 9,
        lastPlayedOn: null,
      },
    });
  });

  it('walking, nothing is inert', () => {
    render(<WorldScreen />);
    expect(document.querySelector('[inert]')).toBeNull();
  });

  it('📜 Menu: the page behind is inert, focus moves in, and comes back to 📜 Menu when it closes', () => {
    render(<WorldScreen />);
    const menu = screen.getByRole('button', { name: '📜 Menu' });
    menu.focus();
    fireEvent.click(menu);
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(isInert(switchPlayer())).toBe(true);
    expect(isInert(menu)).toBe(true);
    expect(isInert(screen.getByTestId('canvas'))).toBe(true);

    act(() => flow.setState({ overlay: null }));
    expect(document.querySelector('[inert]')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '📜 Menu' }));
  });

  it('the Spire: its panels cover the top bar (no Tab, Enter, Enter to Switch player mid-climb); walking a floor leaves it live', async () => {
    useSaveStore.setState({ save: { ...defaultSave(), avatarId: 'a3', zoneId: 'crystal-spire', flags: ALL_CRYSTALS } });
    flow.setState({ overlay: 'spire' });
    render(<WorldScreen />);
    // The opening lines: a modal panel, its "▼ tap to continue" focused, the top bar out of reach.
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(screen.getByRole('dialog', { name: 'The Crystal Spire' })).toHaveAttribute('aria-modal', 'true');
    expect(document.activeElement?.textContent).toContain('tap to continue');
    expect(isInert(switchPlayer())).toBe(true);

    await readIntro();
    expect(isInert(switchPlayer())).toBe(false);
    expect(document.querySelector('[inert]')).toBeNull();

    // Leave → Escape: back on the floor, focus on Leave again.
    fireEvent.click(screen.getByRole('button', { name: '🚪 Leave the Spire' }));
    const ask = screen.getByRole('alertdialog', { name: 'Leave the Spire?' });
    expect(isInert(switchPlayer())).toBe(true);
    expect(screen.getByRole('button', { name: '🗼 Keep climbing' })).toHaveFocus();
    fireEvent.keyDown(ask, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: '🚪 Leave the Spire' })).toHaveFocus();
    expect(isInert(switchPlayer())).toBe(false);

    // Leave → Keep climbing: the same.
    fireEvent.click(screen.getByRole('button', { name: '🚪 Leave the Spire' }));
    fireEvent.click(screen.getByRole('button', { name: '🗼 Keep climbing' }));
    expect(screen.getByRole('button', { name: '🚪 Leave the Spire' })).toHaveFocus();
  });

  it('the finale story, opening as the Spire closes, keeps the top bar inert (no effect undoes it)', () => {
    useSaveStore.setState({
      save: { ...defaultSave(), avatarId: 'a3', zoneId: 'crystal-spire', flags: { ...ALL_CRYSTALS, [SPIRE_CLEARED]: true } },
    });
    flow.setState({ overlay: 'spire' });
    render(<WorldScreen />);
    act(() => flow.setState({ overlay: null }));
    expect(screen.getByRole('dialog', { name: 'Story' })).toBeInTheDocument();
    expect(isInert(switchPlayer())).toBe(true);
  });

  it('with an Act II crystal in the game, Act I\'s four still play the ending, and the HUD counts 4/4 (#75 item 14c)', () => {
    const remove = addFakeActTwoCrystal();
    try {
      const { [ENDING_SEEN]: _seen, ...beforeEnding } = ALL_CRYSTALS;
      void _seen;
      useSaveStore.setState({ save: { ...defaultSave(), avatarId: 'a3', zoneId: 'dawnreach', flags: beforeEnding } });
      render(<WorldScreen />);
      expect(screen.getByText('💎 4/4 crystals restored')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Story' })).toHaveTextContent('The four Crystals of Knowing rise');
    } finally {
      remove();
    }
  });

  it('once Act II opens, the HUD counts its crystal too: 4/5 (#75 item 14c)', () => {
    const remove = addFakeActTwoCrystal();
    try {
      useSaveStore.setState({
        save: {
          ...defaultSave(),
          avatarId: 'a3',
          zoneId: 'dawnreach',
          flags: { ...ALL_CRYSTALS, [SPIRE_CLEARED]: true, 'spire-victory-seen': true, [ACT2_SEEN]: true },
        },
      });
      render(<WorldScreen />);
      expect(screen.getByText('💎 4/5 crystals restored')).toBeInTheDocument();
    } finally {
      remove();
    }
  });

  it('"Pick an avatar first" still has a way to switch player', () => {
    useSaveStore.setState({ save: { ...defaultSave(), avatarId: null } });
    render(<WorldScreen />);
    expect(screen.getByText('Pick an avatar first to enter the world.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch player' })).toBeInTheDocument();
  });
});
