import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

// The canvas is KaPlay — stand in a div. The flow is a stub whose state a test can set.
const flow = vi.hoisted(() => ({ state: null as null | Record<string, string> }));
vi.mock('./WorldCanvas', () => ({ default: () => <div data-testid="canvas" /> }));
vi.mock('canvas-confetti', () => ({ default: Object.assign(vi.fn(), { reset: vi.fn() }) }));
vi.mock('../../lib/questions', () => ({
  prefetchQuestions: vi.fn(),
  fetchQuestions: vi.fn(() => new Promise(() => {})),
  BATTLE_QUESTION_COUNT: 3,
}));
vi.mock('../../machines/gameFlow', () => ({
  sendFlow: () => {},
  useFlow: <T,>(sel: (s: unknown) => T) =>
    sel({
      matches: (p: unknown) => flow.state !== null && JSON.stringify(p) === JSON.stringify(flow.state),
      context: { npcId: null, service: null, pathTarget: null },
    }),
}));

const { default: WorldScreen, LIBRARY_NUDGE } = await import('./WorldScreen');
const { useSaveStore } = await import('../../store/saveStore');
const { useBattleStore } = await import('../../store/battleStore');
const { useKeyboardStore } = await import('../../store/keyboardStore');
const { defaultSave } = await import('../../lib/save');
const { INTRO_SEEN, DAWNREACH_SEEN, EMBER_HATCHED, EMBER_HATCH_SEEN } = await import('../../content/story');
const { TYPING_LESSONS, typingLessonFlag } = await import('../../content/typing');

const NUDGE = /Librarian Sage has something for you/;
/** A kid back in the world: the intro long seen, no typing lesson cleared. */
function back(flags: Record<string, boolean> = {}) {
  useSaveStore.setState({
    userId: null,
    status: 'ready',
    save: { ...defaultSave(), avatarId: 'a3', zoneId: 'lumina-village', flags: { [INTRO_SEEN]: true, [DAWNREACH_SEEN]: true, ...flags } },
  });
}
const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('back in the world, a kid is sent to Librarian Sage until lesson 1 is cleared (#166)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    flow.state = null;
    useBattleStore.getState().reset();
    useKeyboardStore.getState().reset();
    back();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('says it once a session, a beat after arriving, and counts it once it has been read', () => {
    const first = render(<WorldScreen />);
    expect(screen.queryByText(NUDGE)).toBeNull();
    tick(1500);
    expect(screen.getByText(LIBRARY_NUDGE)).toBeInTheDocument();
    // Read out: the toast is a live region.
    expect(screen.getByTestId('world-toast')).toHaveTextContent('Librarian Sage');
    expect(useBattleStore.getState().libraryNudgeSaid).toBe(false);
    tick(2500);
    expect(useBattleStore.getState().libraryNudgeSaid).toBe(true);
    first.unmount();
    render(<WorldScreen />);
    tick(10000);
    expect(screen.queryByText(NUDGE)).toBeNull();
  });

  it('cut short (a battle takes the screen), it is said again next time; Switch player says it to the next kid', () => {
    const first = render(<WorldScreen />);
    tick(1500 + 800);
    first.unmount();
    expect(useBattleStore.getState().libraryNudgeSaid).toBe(false);
    render(<WorldScreen />);
    tick(1500);
    expect(screen.getByText(NUDGE)).toBeInTheDocument();
    tick(2500);
    expect(useBattleStore.getState().libraryNudgeSaid).toBe(true);
    // Putting the game away (Switch player, sign-out) resets the session's hints.
    useBattleStore.getState().reset();
    expect(useBattleStore.getState().libraryNudgeSaid).toBe(false);
  });

  it('waits while the world is paused (a story playing), then says it', () => {
    // Ember hatched, the hatch scene not yet watched: a cutscene is up as the world opens.
    back({ [EMBER_HATCHED]: true });
    render(<WorldScreen />);
    tick(1500 + 2000);
    expect(screen.queryByText(NUDGE)).toBeNull();
    act(() => {
      useSaveStore.getState().update((s) => ({ ...s, flags: { ...s.flags, [EMBER_HATCH_SEEN]: true } }));
    });
    tick(2000);
    expect(screen.getByText(NUDGE)).toBeInTheDocument();
  });

  it('not before the intro has played, and not once lesson 1 is cleared', () => {
    back({ [INTRO_SEEN]: false });
    const first = render(<WorldScreen />);
    tick(10000);
    expect(screen.queryByText(NUDGE)).toBeNull();
    first.unmount();
    back({ [typingLessonFlag(TYPING_LESSONS[0].id)]: true });
    render(<WorldScreen />);
    tick(10000);
    expect(screen.queryByText(NUDGE)).toBeNull();
  });

  it('not on a glass keyboard (a coarse pointer and no key seen) — a real keyboard seen on it, yes', () => {
    const media = { matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
    const had = window.matchMedia;
    window.matchMedia = (() => media) as unknown as typeof window.matchMedia;
    try {
      const first = render(<WorldScreen />);
      tick(10000);
      expect(screen.queryByText(NUDGE)).toBeNull();
      first.unmount();
      useKeyboardStore.getState().seen();
      render(<WorldScreen />);
      tick(1500);
      expect(screen.getByText(NUDGE)).toBeInTheDocument();
    } finally {
      window.matchMedia = had;
    }
  });
});
