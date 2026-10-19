import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { WorldCanvasCallbacks } from './WorldCanvas';
import type { FogDef } from '../../content/zones';

// The canvas is KaPlay — stand in a div that keeps the callbacks the screen hands it.
const canvas: { callbacks?: WorldCanvasCallbacks; skipRef?: { current: boolean } } = {};
vi.mock('./WorldCanvas', () => ({
  default: (props: { callbacks: WorldCanvasCallbacks; skipRef?: { current: boolean } }) => {
    canvas.callbacks = props.callbacks;
    canvas.skipRef = props.skipRef;
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
const { useProfileStore } = await import('../../store/profileStore');
const { defaultSave } = await import('../../lib/save');
const story = await import('../../content/story');
const { ZONES } = await import('../../content/zones');

/** Every story panel already seen, so no cutscene covers the HUD. */
const SEEN: Record<string, boolean> = {
  [story.INTRO_SEEN]: true,
  [story.DAWNREACH_SEEN]: true,
  [story.SPIRE_AWAKE_SEEN]: true,
  [story.crystalSceneFlag('history')]: true,
  [story.FLIGHT_TUTORIAL_SEEN]: true,
};

function start(zoneId: string, vehicle: 'foot' | 'boat' | 'ember' = 'foot', flags: Record<string, boolean> = {}) {
  useSaveStore.setState({
    userId: null,
    status: 'ready',
    save: { ...defaultSave(), avatarId: 'a3', zoneId: zoneId as never, pos: { x: 40, y: 30 }, vehicle, flags: { ...SEEN, ...flags } },
  });
}

/** The help line's two versions: the keyboard's (hidden on a touch screen) and the pad's (shown only there). */
function helpLines() {
  const help = screen.getByTestId('world-help');
  const [keys, touch] = Array.from(help.querySelectorAll('span'));
  return { keys, touch };
}

beforeEach(() => {
  useProfileStore.setState({
    profile: { id: 'u1', birthYear: 2016, birthMonth: 3, skillLevels: {}, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
  });
});

describe('the help line under the map speaks to touch players too (#130 S4, #110m)', () => {
  it('walking: keyboard words outside a touch screen, the pad and ✋ on one — by the same `touch:` screen as the d-pad', () => {
    start('dawnreach');
    render(<WorldScreen />);
    const { keys, touch } = helpLines();
    expect(keys.className).toContain('touch:hidden');
    expect(keys).toHaveTextContent('Walk: arrow keys / WASD');
    expect(touch.className.split(' ')).toEqual(expect.arrayContaining(['hidden', 'touch:inline']));
    expect(touch).toHaveTextContent('Walk: the arrow pad · tap ✋ or tap someone to talk, open and use');
    expect(touch.textContent).not.toMatch(/WASD|arrow keys/);
    // The pad itself is shown by the same screen.
    expect(screen.getByTestId('touch-pad').className).toContain('touch:flex');
  });

  it('sailing and flying have touch words too', () => {
    start('silver-shallows', 'boat');
    const { unmount } = render(<WorldScreen />);
    expect(helpLines().touch).toHaveTextContent('Sail: the arrow pad · into a beach or dock to land');
    unmount();
    start('dawnreach', 'ember', { [story.FLIGHT_FLAG]: true });
    render(<WorldScreen />);
    expect(helpLines().touch).toHaveTextContent('Fly: the arrow pad · Land: tap 🛬, ✋ or the map');
    expect(helpLines().keys).toHaveTextContent('Land: Space, F or 🛬');
  });
});

describe('a fog bank’s line can be read while the camera is on it (#113)', () => {
  it('sits clear of the map while a reveal plays — under it, or at the very top on a sideways phone — and back up top (on a phone) once it ends', () => {
    start('dawnreach');
    render(<WorldScreen />);
    const toast = screen.getByTestId('world-toast');
    // Walking about: up top on a phone or a touch screen, clear of the d-pad.
    expect(toast.className).toContain('top-24');
    expect(toast.className).toContain('touch:top-24');

    const bank = ZONES.dawnreach.fogs!.find((f) => f.id === 'shrine-fog') as FogDef;
    act(() => canvas.callbacks!.onReveal!(true));
    act(() => canvas.callbacks!.onFogLift!(bank));
    expect(within(toast).getByText(bank.lifted)).toBeInTheDocument();
    expect(toast.className).toContain('bottom-8');
    expect(toast.className).toContain('touch-wide:top-3');
    expect(toast.className).not.toMatch(/\btop-24\b/);
    expect(toast.className).not.toContain('touch:top-24');

    act(() => canvas.callbacks!.onReveal!(false));
    expect(toast.className).toContain('touch:top-24');
  });
});

describe('the HUD’s buttons keep their 44 px taps when they wrap (bench … hud at 740×360)', () => {
  it('🐉 Fly, Calm’s timer and 📜 Menu sit in one group whose wrapped lines are 16 px apart — more than the 8 px each tap reaches past its button', () => {
    start('dawnreach', 'foot', { [story.FLIGHT_FLAG]: true });
    render(<WorldScreen />);
    const fly = screen.getByRole('button', { name: 'Fly on Ember' });
    const menu = screen.getByRole('button', { name: '📜 Menu' });
    const group = fly.parentElement!;
    expect(menu.parentElement).toBe(group);
    expect(group.className).toContain('gap-y-4');
    for (const b of [fly, menu]) expect(b.className).toContain('after:-inset-y-2');
  });
});

describe('a fog reveal says how to skip it, in words a phone can read (#159 r1)', () => {
  it('while it plays, a 44 px "⏩ Tap to skip" (or "Press any key") button takes the help line\'s place — and is heard', () => {
    start('dawnreach');
    render(<WorldScreen />);
    expect(screen.queryByTestId('reveal-skip')).toBeNull();
    act(() => canvas.callbacks!.onReveal!(true));
    const skip = screen.getByTestId('reveal-skip');
    expect(skip.tagName).toBe('BUTTON');
    expect(skip.className).toContain('min-h-11');
    const [keys, touch] = Array.from(skip.querySelectorAll('span'));
    expect(keys).toHaveTextContent('⏩ Press any key to skip');
    expect(keys.className).toContain('touch:hidden');
    expect(touch).toHaveTextContent('⏩ Tap to skip');
    expect(touch.className.split(' ')).toEqual(expect.arrayContaining(['hidden', 'touch:inline']));
    expect(screen.queryByTestId('world-help')).toBeNull();
    // Said in the toast's live region, so a screen reader hears it too.
    expect(within(screen.getByTestId('world-toast')).getByText('The fog is lifting. Tap to skip.')).toBeInTheDocument();
    // A press of it (even a screen reader's, which taps nothing) asks the canvas to skip.
    expect(canvas.skipRef!.current).toBe(false);
    fireEvent.click(skip);
    expect(canvas.skipRef!.current).toBe(true);
    act(() => canvas.callbacks!.onReveal!(false));
    expect(screen.queryByTestId('reveal-skip')).toBeNull();
    expect(screen.getByTestId('world-help')).toBeInTheDocument();
  });
});

describe('a sideways phone keeps the map and its buttons on screen (#159 r1)', () => {
  const SHORT = '[@media(pointer:coarse)_and_(orientation:landscape)_and_(max-height:500px)]';
  it('the HUD row spans the page there, like the top bar, and the help line steps aside for the pad', () => {
    start('dawnreach', 'ember', { [story.FLIGHT_FLAG]: true });
    render(<WorldScreen />);
    const hud = screen.getByRole('heading', { level: 1 }).closest('div')!.parentElement!;
    expect(hud.className).toContain(`${SHORT}:w-[calc(100vw-2rem)]`);
    expect(screen.getByTestId('world-help').className).toContain(`${SHORT}:hidden`);
    // The Land button and 📜 Menu are in that row.
    expect(within(hud).getByRole('button', { name: 'Land' })).toBeInTheDocument();
    expect(within(hud).getByRole('button', { name: '📜 Menu' })).toBeInTheDocument();
  });
});
