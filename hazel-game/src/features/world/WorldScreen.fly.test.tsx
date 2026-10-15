import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import type { WorldCanvasCallbacks } from './WorldCanvas';

// The canvas is KaPlay — stand in a div that keeps what the screen hands it.
const canvas: {
  callbacks?: WorldCanvasCallbacks;
  flightRef?: MutableRefObject<'fly' | 'land' | null>;
  flying?: boolean;
} = {};
vi.mock('./WorldCanvas', () => ({
  default: (props: { callbacks: WorldCanvasCallbacks; flightRef?: MutableRefObject<'fly' | 'land' | null>; flying?: boolean }) => {
    canvas.callbacks = props.callbacks;
    canvas.flightRef = props.flightRef;
    canvas.flying = props.flying;
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

/** Every story panel already seen, so no cutscene covers the HUD. */
const SEEN: Record<string, boolean> = {
  [story.INTRO_SEEN]: true,
  [story.DAWNREACH_SEEN]: true,
  [story.SPIRE_AWAKE_SEEN]: true,
  [story.crystalSceneFlag('history')]: true,
  [story.FLIGHT_TUTORIAL_SEEN]: true,
};

function start(zoneId: string, flags: Record<string, boolean>, vehicle: 'foot' | 'boat' | 'ember' = 'foot') {
  useSaveStore.setState({
    userId: null,
    status: 'ready',
    save: { ...defaultSave(), avatarId: 'a3', zoneId: zoneId as never, pos: { x: 40, y: 30 }, vehicle, flags: { ...SEEN, ...flags } },
  });
}

describe('🐉 Fly / 🛬 Land on the world HUD (#75 item 15b)', () => {
  beforeEach(() => {
    useProfileStore.setState({
      profile: { id: 'u1', birthYear: 2016, birthMonth: 3, skillLevels: {}, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
    });
  });

  it('has no Fly button before the Crystal of Memory', () => {
    start('dawnreach', {});
    render(<WorldScreen />);
    expect(screen.queryByRole('button', { name: 'Fly on Ember' })).toBeNull();
  });

  it('has no Fly button in a town, even once Ember can fly', () => {
    start('lumina-village', { [story.FLIGHT_FLAG]: true });
    render(<WorldScreen />);
    expect(screen.queryByRole('button', { name: 'Fly on Ember' })).toBeNull();
  });

  it('on an overworld map, Fly asks the canvas to take off; taking off flies, Land asks it to touch down', () => {
    start('dawnreach', { [story.FLIGHT_FLAG]: true });
    render(<WorldScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Fly on Ember' }));
    expect(canvas.flightRef!.current).toBe('fly');
    act(() => canvas.callbacks!.onTakeOff!(41, 30));
    expect(useSaveStore.getState().save!.vehicle).toBe('ember');
    expect(canvas.flying).toBe(true);
    expect(screen.getByText(/Space, F, a tap or click, or 🛬 to land on grass, sand or a road/)).toBeInTheDocument();
    expect(screen.getByText('(flying on Ember)')).toBeInTheDocument();
    // Heard too, in the status region (round 2 review).
    expect(screen.getByText("You're flying on Ember!").closest('[role=status]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Land' }));
    expect(canvas.flightRef!.current).toBe('land');
    act(() => canvas.callbacks!.onTouchDown!(44, 31));
    const save = useSaveStore.getState().save!;
    expect(save.vehicle).toBe('foot');
    expect(save.pos).toEqual({ x: 44, y: 31 });
    expect(screen.getByText('You landed.').closest('[role=status]')).not.toBeNull();
  });

  it('the button lets go of the keys, so the next Space is the world\'s (round 2 review)', () => {
    start('dawnreach', { [story.FLIGHT_FLAG]: true });
    render(<WorldScreen />);
    const fly = screen.getByRole('button', { name: 'Fly on Ember' });
    fly.focus();
    fireEvent.click(fly);
    expect(document.activeElement).not.toBe(fly);
    // Its words show at every width, not only from `sm` up.
    expect(fly).toHaveTextContent('🐉 Fly');
  });

  it('F flies and lands where the button is offered — not from a field, a town or the boat', () => {
    start('dawnreach', { [story.FLIGHT_FLAG]: true });
    const { unmount } = render(<WorldScreen />);
    canvas.flightRef!.current = null;
    fireEvent.keyDown(window, { key: 'f' });
    expect(canvas.flightRef!.current).toBe('fly');
    act(() => canvas.callbacks!.onTakeOff!(41, 30));
    canvas.flightRef!.current = null;
    fireEvent.keyDown(window, { key: 'F' });
    expect(canvas.flightRef!.current).toBe('land');
    // Typing an F in a field is just a letter.
    canvas.flightRef!.current = null;
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'f' });
    expect(canvas.flightRef!.current).toBeNull();
    input.remove();
    unmount();
    for (const [zoneId, vehicle] of [['lumina-village', 'foot'], ['silver-shallows', 'boat']] as const) {
      start(zoneId, { [story.FLIGHT_FLAG]: true }, vehicle);
      const r = render(<WorldScreen />);
      canvas.flightRef!.current = null;
      fireEvent.keyDown(window, { key: 'f' });
      expect(canvas.flightRef!.current).toBeNull();
      r.unmount();
    }
  });

  it('says where Ember can land when there is no open ground below', () => {
    start('dawnreach', { [story.FLIGHT_FLAG]: true }, 'ember');
    render(<WorldScreen />);
    act(() => canvas.callbacks!.onNoLanding!());
    expect(screen.getByText(/Ember needs open ground to land/)).toBeInTheDocument();
  });

  afterEach(() => vi.useRealTimers());

  it("plays Ember's flight tutorial once, on a map Ember flies over — then the Fly button is there", () => {
    vi.useFakeTimers();
    start('dawnreach', { [story.FLIGHT_FLAG]: true, [story.FLIGHT_TUTORIAL_SEEN]: false });
    render(<WorldScreen />);
    expect(screen.getByText(/Ember stretches its wings/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fly on Ember' })).toBeNull();
    for (let i = 0; i < story.FLIGHT_PANELS.length - 1; i++) {
      act(() => vi.advanceTimersByTime(2000));
      fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    }
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.click(screen.getByRole('button', { name: "🐉 Let's fly!" }));
    expect(useSaveStore.getState().save!.flags[story.FLIGHT_TUTORIAL_SEEN]).toBe(true);
    expect(screen.getByRole('button', { name: 'Fly on Ember' })).toBeInTheDocument();
    // "Let's fly!" takes off (round 2 review).
    expect(canvas.flightRef!.current).toBe('fly');
  });

  it('waits while sailing: the tutorial points at a Fly button the boat doesn\'t have', () => {
    start('silver-shallows', { [story.FLIGHT_FLAG]: true, [story.FLIGHT_TUTORIAL_SEEN]: false }, 'boat');
    render(<WorldScreen />);
    expect(screen.queryByText(/Ember stretches its wings/)).toBeNull();
  });

  it('waits in a town: the tutorial plays only where Ember can fly', () => {
    start('lumina-village', { [story.FLIGHT_FLAG]: true, [story.FLIGHT_TUTORIAL_SEEN]: false });
    render(<WorldScreen />);
    expect(screen.queryByText(/Ember stretches its wings/)).toBeNull();
  });

  it('has no Fly button while sailing', () => {
    start('silver-shallows', { [story.FLIGHT_FLAG]: true }, 'boat');
    render(<WorldScreen />);
    expect(screen.queryByRole('button', { name: 'Fly on Ember' })).toBeNull();
  });
});
