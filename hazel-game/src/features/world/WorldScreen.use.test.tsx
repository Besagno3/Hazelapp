import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import type { WorldCanvasCallbacks } from './WorldCanvas';

// The canvas is KaPlay — stand in a div that keeps what the screen hands it.
const canvas: { callbacks?: WorldCanvasCallbacks; actionRef?: MutableRefObject<number> } = {};
vi.mock('./WorldCanvas', () => ({
  default: (props: { callbacks: WorldCanvasCallbacks; actionRef?: MutableRefObject<number> }) => {
    canvas.callbacks = props.callbacks;
    canvas.actionRef = props.actionRef;
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
const { INTRO_SEEN, DAWNREACH_SEEN } = await import('../../content/story');

describe('using things from the world screen (#127)', () => {
  beforeEach(() => {
    useSaveStore.setState({
      userId: null,
      status: 'ready',
      save: { ...defaultSave(), avatarId: 'a3', flags: { [INTRO_SEEN]: true, [DAWNREACH_SEEN]: true } },
    });
    useProfileStore.setState({
      profile: { id: 'u1', birthYear: 2016, birthMonth: 3, skillLevels: {}, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
    });
  });

  it('the ✋ button says what the canvas would use, and pressing it tells the canvas', () => {
    render(<WorldScreen />);
    expect(screen.getByRole('button', { name: 'Use (nothing here yet)' })).toBeInTheDocument();
    act(() => canvas.callbacks!.onPrompt!('Open chest'));
    const btn = screen.getByRole('button', { name: 'Open chest' });
    const before = canvas.actionRef!.current;
    fireEvent.pointerDown(btn);
    expect(canvas.actionRef!.current).toBe(before + 1);
    act(() => canvas.callbacks!.onPrompt!(null));
    expect(screen.getByRole('button', { name: 'Use (nothing here yet)' })).toBeInTheDocument();
  });

  it('the footer says Space, Enter or a click talks, opens and uses', () => {
    render(<WorldScreen />);
    expect(screen.getByText(/Space, Enter or a click to talk, open and use/)).toBeInTheDocument();
    expect(screen.queryByText(/bump into friends/)).toBeNull();
  });
});
