import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { create } from 'zustand';

// The canvas is KaPlay — stand in a div that says which map it's drawing.
vi.mock('./WorldCanvas', () => ({
  default: (p: { zoneId: string; spireFloor: string | null }) => (
    <div data-testid="canvas" data-zone={p.zoneId} data-floor={p.spireFloor ?? ''} />
  ),
}));
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
// The Spire's own last panel: "The Spire is yours! … 🌟 See how it ends".
vi.mock('./SpireOverlay', async () => {
  const { sendFlow } = await import('../../machines/gameFlow');
  const { useSpireStore } = await import('../../store/spireStore');
  return {
    default: () => (
      <button
        onClick={() => {
          useSpireStore.getState().reset();
          sendFlow({ type: 'CLOSE' });
        }}
      >
        🌟 See how it ends
      </button>
    ),
  };
});

const { default: WorldScreen } = await import('./WorldScreen');
const { useSaveStore } = await import('../../store/saveStore');
const { useSpireStore } = await import('../../store/spireStore');
const { defaultSave, restAtHomeInn } = await import('../../lib/save');
const { HUB_ZONE } = await import('../../content/zones');
const { SPIRE_FLOORS } = await import('../../content/spire');
const { WAKE_MS } = await import('../../components/WakeFade');
const story = await import('../../content/story');
const { actCrystals, crystalFlag } = await import('../../content/topics');

/** Every story beat of Act I seen, and Umbra just beaten. */
function umbraBeaten(): Record<string, boolean> {
  const flags: Record<string, boolean> = {
    [story.INTRO_SEEN]: true,
    [story.EMBER_HATCHED]: true,
    [story.EMBER_HATCH_SEEN]: true,
    [story.SPIRE_AWAKE_SEEN]: true,
    [story.ENDING_SEEN]: true,
    [story.DAWNREACH_SEEN]: true,
    [story.SPIRE_CLEARED]: true,
  };
  for (const t of actCrystals(1)) {
    flags[crystalFlag(t.id)] = true;
    flags[story.crystalSceneFlag(t.id)] = true;
  }
  return flags;
}

/** Reads on through a story, waiting for each panel to fade in first. */
function readOn(times: number) {
  for (let i = 0; i < times; i++) {
    act(() => vi.advanceTimersByTime(1500));
    fireEvent.click(screen.getByRole('button', { name: '▼ Next' }));
  }
  act(() => vi.advanceTimersByTime(1500));
}

const menu = () => screen.getByRole('button', { name: '📜 Menu', hidden: true });
const canvas = () => screen.getByTestId('canvas').dataset;

describe('after Umbra: the walk home, a night at the inn, Act II in the morning (#75 item 14)', () => {
  const flush = vi.fn(async () => {});
  beforeEach(() => {
    vi.useFakeTimers();
    flush.mockClear();
    useSaveStore.setState({
      userId: null,
      status: 'ready',
      save: { ...defaultSave(), avatarId: 'a3', zoneId: 'crystal-spire', flags: umbraBeaten() },
      flush,
    });
  });
  afterEach(() => vi.useRealTimers());

  it('waits for "See how it ends", walks home from the Spire\'s door, and wakes inside the inn', () => {
    // Umbra has just fallen: the Spire's own panel is up on the throne floor.
    flow.setState({ overlay: 'spire' });
    render(<WorldScreen />);
    act(() => useSpireStore.getState().enterFloor(SPIRE_FLOORS.length - 1));
    expect(canvas().floor).toBe(SPIRE_FLOORS[SPIRE_FLOORS.length - 1].theme);
    expect(screen.queryByRole('dialog', { name: 'Story' })).toBeNull();

    // The finale plays once the climb closes — at the Spire's door, not the throne.
    fireEvent.click(screen.getByRole('button', { name: '🌟 See how it ends' }));
    expect(screen.getByRole('dialog', { name: 'Story' })).toBeInTheDocument();
    expect([canvas().zone, canvas().floor]).toEqual(['crystal-spire', '']);
    // The HUD behind the story can't be reached.
    expect(menu().closest('[inert]')).not.toBeNull();

    // Three finale panels, three pictures, then bed.
    readOn(5);
    fireEvent.click(screen.getByRole('button', { name: '💤 Good night' }));
    const s = useSaveStore.getState().save!;
    expect([s.zoneId, s.pos, s.lastRest, s.flags[story.SPIRE_VICTORY_SEEN]]).toEqual([
      HUB_ZONE,
      restAtHomeInn().pos,
      HUB_ZONE,
      true,
    ]);
    expect(flush).toHaveBeenCalled(); // saved at once
    expect([canvas().zone, canvas().floor]).toEqual([HUB_ZONE, '']);

    // The dark, then the morning: no taps or Tab through to the HUD meanwhile.
    expect(screen.getByTestId('wake-fade')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Story' })).toBeNull();
    expect(menu().closest('[inert]')).not.toBeNull();
    act(() => vi.advanceTimersByTime(WAKE_MS - 100));
    expect(screen.queryByText(/You wake to sunshine/)).toBeNull();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByTestId('wake-fade')).toBeNull();
    expect(screen.getByText(/You wake to sunshine at the Sleepy Sheep Inn/)).toBeInTheDocument();

    // Act II, then the world is the kid's again.
    readOn(story.ACT2_PANELS.length - 1);
    fireEvent.click(screen.getByRole('button', { name: '⛵ Find Old Marlow' }));
    expect(useSaveStore.getState().save!.flags[story.ACT2_SEEN]).toBe(true);
    expect(screen.queryByRole('dialog', { name: 'Story' })).toBeNull();
    expect(document.querySelector('[inert]')).toBeNull();
    expect(flow.getState().overlay).toBeNull();
  });
});
