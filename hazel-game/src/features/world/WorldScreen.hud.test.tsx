import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';

// The canvas is KaPlay — stand in a div.
vi.mock('./WorldCanvas', () => ({ default: () => <div data-testid="canvas" /> }));
vi.mock('canvas-confetti', () => ({ default: Object.assign(vi.fn(), { reset: vi.fn() }) }));
vi.mock('../../lib/questions', () => ({
  prefetchQuestions: vi.fn(),
  fetchQuestions: vi.fn(() => new Promise(() => {})),
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
// The Spire climb, exploring a floor: its status and way out go where the HUD says.
vi.mock('./SpireOverlay', () => ({
  default: ({ hudSlot }: { hudSlot?: HTMLElement | null }) =>
    hudSlot ? createPortal(<button>🚪 Leave the Spire</button>, hudSlot) : <button>🚪 Leave the Spire (floating)</button>,
}));

const { default: WorldScreen } = await import('./WorldScreen');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { defaultSave } = await import('../../lib/save');
const { INTRO_SEEN, DAWNREACH_SEEN } = await import('../../content/story');

/** Is any ancestor of `el` positioned fixed (by class)? */
const floats = (el: HTMLElement | null): boolean => {
  for (let e = el; e; e = e.parentElement) if (/(^|\s)fixed(\s|$)/.test(e.className)) return true;
  return false;
};

describe('the world top bar (#75 item 14b, #102i)', () => {
  beforeEach(() => {
    flow.setState({ overlay: null });
    useSaveStore.setState({
      userId: null,
      status: 'ready',
      save: { ...defaultSave(), avatarId: 'a3', zoneId: 'clockwork-depths-b2', flags: { [INTRO_SEEN]: true, [DAWNREACH_SEEN]: true } },
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

  it('holds the level, the streak and Sign out in the page — nothing floats over the place name', () => {
    render(<WorldScreen />);
    const bar = screen.getByTestId('world-topbar');
    expect(within(bar).getByText('Level 3')).toBeInTheDocument();
    expect(within(bar).getByText('Streak: 5 days')).toBeInTheDocument(); // read aloud; "🔥 5" on a phone
    expect(within(bar).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(floats(bar)).toBe(false);
    // The floor's title comes after the bar, in the HUD, uncovered.
    const title = screen.getByRole('heading', { level: 1 });
    expect(title.textContent).toContain('The Gear Halls');
    expect(bar.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('in the Spire, the climb\'s "Leave the Spire" takes Menu\'s place in the HUD row', () => {
    flow.setState({ overlay: 'spire' });
    render(<WorldScreen />);
    const slot = screen.getByTestId('spire-hud-slot');
    expect(within(slot.parentElement!).getByRole('button', { name: '🚪 Leave the Spire' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '📜 Menu' })).toBeNull();
    expect(floats(slot)).toBe(false);
  });
});
