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
    // The live region sits in the row that's placed on screen.
    const row = screen.getByTestId('world-toast-row');
    expect(row.contains(toast)).toBe(true);
    // Walking about: up top on a phone or a touch screen, clear of the d-pad.
    expect(row.className).toContain('top-24');
    expect(row.className).toContain('touch:top-24');

    const bank = ZONES.dawnreach.fogs!.find((f) => f.id === 'shrine-fog') as FogDef;
    act(() => canvas.callbacks!.onReveal!(true));
    act(() => canvas.callbacks!.onFogLift!(bank));
    expect(within(toast).getByText(bank.lifted)).toBeInTheDocument();
    expect(row.className).toContain('bottom-8');
    expect(row.className).toContain('touch-wide:top-3');
    expect(row.className).not.toMatch(/\btop-24\b/);
    expect(row.className).not.toContain('touch:top-24');

    act(() => canvas.callbacks!.onReveal!(false));
    expect(row.className).toContain('touch:top-24');
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
  it('while it plays, on a touch screen a "⏩ Tap to skip" button covers the help line, in the same room — and it is heard', () => {
    start('dawnreach');
    render(<WorldScreen />);
    expect(screen.queryByTestId('reveal-skip')).toBeNull();
    const help = screen.getByTestId('world-help');
    act(() => canvas.callbacks!.onReveal!(true));
    const skip = screen.getByTestId('reveal-skip');
    expect(skip.tagName).toBe('BUTTON');
    expect(skip).toHaveTextContent('⏩ Tap to skip');
    // Only on a touch screen (the pad's `touch:` screen); a keyboard computer gets its own, by the fog's line.
    expect(skip.className.split(' ')).toEqual(expect.arrayContaining(['hidden', 'touch:inline-flex']));
    // A 44 px tap: 32 px tall, reaching 6 px past its top and bottom.
    expect(skip.className.split(' ')).toEqual(expect.arrayContaining(['h-8', 'after:-inset-y-1.5']));
    // Said in the toast's live region, so a screen reader hears it too.
    expect(within(screen.getByTestId('world-toast')).getByText('The fog is lifting. Tap to skip.')).toBeInTheDocument();
    // A press of it (even a screen reader's, which taps nothing) asks the canvas to skip.
    expect(canvas.skipRef!.current).toBe(false);
    fireEvent.click(skip);
    expect(canvas.skipRef!.current).toBe(true);
    act(() => canvas.callbacks!.onReveal!(false));
    expect(screen.queryByTestId('reveal-skip')).toBeNull();
    expect(screen.getByTestId('world-help')).toBe(help);
  });

  it('the swap never moves the d-pad: the help line keeps its room (hidden, not gone), at least the button\'s 32 px on a touch screen (#159 r2)', () => {
    start('dawnreach');
    render(<WorldScreen />);
    const help = screen.getByTestId('world-help');
    expect(help.className.split(' ')).toContain('touch:min-h-8');
    act(() => canvas.callbacks!.onReveal!(true));
    const skip = screen.getByTestId('reveal-skip');
    // Still there, holding its height, but not seen or read; the button sits in the same grid cell.
    expect(screen.getByTestId('world-help')).toBe(help);
    expect(help.className.split(' ')).toContain('invisible');
    expect(skip.parentElement).toBe(help.parentElement);
    expect(help.parentElement!.className.split(' ')).toEqual(expect.arrayContaining(['grid', '[&>*]:col-start-1', '[&>*]:row-start-1']));
  });

  it('on a keyboard computer, "⏩ Press any key to skip" sits beside the fog\'s line, not under it (#159 r2)', () => {
    start('dawnreach');
    render(<WorldScreen />);
    expect(screen.queryByTestId('reveal-skip-keys')).toBeNull();
    const bank = ZONES.dawnreach.fogs!.find((f) => f.id === 'shrine-fog') as FogDef;
    act(() => canvas.callbacks!.onReveal!(true));
    act(() => canvas.callbacks!.onFogLift!(bank));
    const keys = screen.getByTestId('reveal-skip-keys');
    expect(keys).toHaveTextContent('⏩ Press any key to skip');
    expect(keys.className.split(' ')).toEqual(expect.arrayContaining(['touch:hidden', 'pointer-events-auto', 'min-h-11']));
    // In the toast's row, beside its line — not inside the live region (it would be read twice).
    const row = screen.getByTestId('world-toast-row');
    expect(keys.parentElement).toBe(row);
    expect(screen.getByTestId('world-toast').contains(keys)).toBe(false);
    expect(row.className.split(' ')).toEqual(expect.arrayContaining(['flex', 'items-center']));
    expect(within(screen.getByTestId('world-toast')).getByText('The fog is lifting. Press any key to skip.')).toBeInTheDocument();
    fireEvent.click(keys);
    expect(canvas.skipRef!.current).toBe(true);
    act(() => canvas.callbacks!.onReveal!(false));
    expect(screen.queryByTestId('reveal-skip-keys')).toBeNull();
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

describe('a short phone held upright keeps the whole pad on screen (#159 r2)', () => {
  const SHORT_UPRIGHT = '[@media(pointer:coarse)_and_(orientation:portrait)_and_(max-height:600px)]';
  it('a little less room above the pad and under the page there (320×568: ▼ was 2 px off, the page scrolled 18 px)', () => {
    start('dawnreach', 'foot', { [story.FLIGHT_FLAG]: true });
    render(<WorldScreen />);
    expect(screen.getByTestId('touch-pad').className.split(' ')).toEqual(expect.arrayContaining(['mt-3', `${SHORT_UPRIGHT}:mt-1`]));
    expect(screen.getByTestId('world-topbar').parentElement!.className.split(' ')).toEqual(expect.arrayContaining(['p-4', `${SHORT_UPRIGHT}:pb-1`]));
  });
});
