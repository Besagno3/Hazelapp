import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

// The canvas is KaPlay — stand in a div that keeps the callbacks it was given.
const canvas = vi.hoisted(() => ({ props: null as null | { onSleeper?: () => boolean } }));
vi.mock('./WorldCanvas', () => ({
  default: ({ callbacks }: { callbacks: { onSleeper?: () => boolean } }) => {
    canvas.props = callbacks;
    return <div data-testid="canvas" />;
  },
}));
vi.mock('canvas-confetti', () => ({ default: Object.assign(vi.fn(), { reset: vi.fn() }) }));
vi.mock('../../lib/questions', () => ({
  prefetchQuestions: vi.fn(),
  fetchQuestions: vi.fn(() => new Promise(() => {})),
  BATTLE_QUESTION_COUNT: 3,
}));
vi.mock('../../machines/gameFlow', () => ({
  sendFlow: () => {},
  useFlow: <T,>(sel: (s: unknown) => T) =>
    sel({ matches: () => false, context: { npcId: null, service: null, pathTarget: null } }),
}));

const { default: WorldScreen } = await import('./WorldScreen');
const { useSaveStore } = await import('../../store/saveStore');
const { useBattleStore } = await import('../../store/battleStore');
const { defaultSave } = await import('../../lib/save');
const { INTRO_SEEN, DAWNREACH_SEEN } = await import('../../content/story');

const HINT = /Sleepy critters let you pass/;

describe('the 💤 sleeping-critter hint (#114e)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useBattleStore.getState().reset();
    useSaveStore.setState({
      userId: null,
      status: 'ready',
      save: { ...defaultSave(), avatarId: 'a3', zoneId: 'lumina-village', flags: { [INTRO_SEEN]: true, [DAWNREACH_SEEN]: true } },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts as said only once it has been up long enough to read', () => {
    render(<WorldScreen />);
    let done = true;
    act(() => {
      done = canvas.props!.onSleeper!();
    });
    expect(screen.getByText(HINT)).toBeInTheDocument();
    // Still up and not yet read: the canvas asks again, and nothing new shows.
    expect(done).toBe(false);
    expect(useBattleStore.getState().sleeperHintSaid).toBe(false);
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(useBattleStore.getState().sleeperHintSaid).toBe(true);
    expect(canvas.props!.onSleeper!()).toBe(true);
  });

  it('cut short by a battle (the world screen goes), it is said again next time', () => {
    const { unmount } = render(<WorldScreen />);
    act(() => {
      canvas.props!.onSleeper!();
    });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(useBattleStore.getState().sleeperHintSaid).toBe(false);
    render(<WorldScreen />);
    act(() => {
      canvas.props!.onSleeper!();
    });
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });
});
