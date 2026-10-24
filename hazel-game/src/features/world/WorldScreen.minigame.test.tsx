import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { create } from 'zustand';

// The canvas is KaPlay — stand in a div, keeping its callbacks so a test can find a secret.
const canvas = vi.hoisted(() => ({ callbacks: null as null | { onSecret: (id: string) => void } }));
vi.mock('./WorldCanvas', () => ({
  default: (props: { callbacks: { onSecret: (id: string) => void } }) => {
    canvas.callbacks = props.callbacks;
    return <div data-testid="canvas" />;
  },
}));
vi.mock('canvas-confetti', () => ({ default: Object.assign(vi.fn(), { reset: vi.fn() }) }));
vi.mock('../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../lib/audio')>()),
  playMusic: vi.fn(),
  sfx: vi.fn(),
  unlockAudio: vi.fn(),
}));
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
// The game-flow machine, reduced to which overlay is open and for whom.
const flow = create<{ overlay: string | null; npcId: string | null; game: string | null }>(() => ({ overlay: null, npcId: null, game: null }));
vi.mock('../../machines/gameFlow', () => ({
  sendFlow: (e: { type: string; game?: string }) => {
    if (e.type === 'CLOSE') flow.setState({ overlay: null });
    if (e.type === 'OPEN_GAME') flow.setState({ overlay: 'minigame', game: e.game ?? null });
  },
  useFlow: <T,>(sel: (s: unknown) => T) => {
    const st = flow((s) => s);
    return sel({
      matches: (v: { world: string }) => st.overlay !== null && v.world === st.overlay,
      context: { npcId: st.npcId, service: null, pathTarget: null, game: st.game },
    });
  },
}));

const { default: WorldScreen } = await import('./WorldScreen');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { defaultSave } = await import('../../lib/save');
const { INTRO_SEEN, DAWNREACH_SEEN } = await import('../../content/story');

beforeEach(() => {
  flow.setState({ overlay: null, npcId: null, game: null });
  useSaveStore.setState({
    userId: null,
    status: 'ready',
    save: { ...defaultSave(), avatarId: 'a3', zoneId: 'verdara', flags: { [INTRO_SEEN]: true, [DAWNREACH_SEEN]: true } },
    flush: vi.fn(async () => {}),
  });
  useProfileStore.setState({
    profile: { id: 'u1', birthYear: 2016, birthMonth: 3, skillLevels: {}, xp: 250, powerUps: {}, currentStreak: 5, longestStreak: 9, lastPlayedOn: null },
  });
});

describe('a mini-game opened from its host, in the world (docs/DESIGN-MINIGAMES.md §2.1, review round 1)', () => {
  it('Play has the focus once the talk has closed — for a keyboard kid whose focus was on the world', () => {
    render(<WorldScreen />);
    screen.getByRole('region', { name: 'The world' }).focus();
    act(() => flow.setState({ overlay: 'dialogue', npcId: 'verdara-merchant' }));
    fireEvent.click(screen.getByText('🧪 Potion Lab'));
    expect(screen.getByTestId('minigame-stage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Let’s brew!' })).toHaveFocus();
  });

  it('the map’s toasts wait behind the stage', () => {
    render(<WorldScreen />);
    expect(screen.getByTestId('world-toast-row')).not.toHaveClass('hidden');
    act(() => flow.setState({ overlay: 'minigame', game: 'potion-lab' }));
    expect(screen.getByTestId('world-toast-row')).toHaveClass('hidden');
    act(() => flow.setState({ overlay: null }));
    expect(screen.getByTestId('world-toast-row')).not.toHaveClass('hidden');
  });

  it('…and so does a “Secret found” card', () => {
    render(<WorldScreen />);
    act(() => canvas.callbacks!.onSecret('verdara-queen-bee'));
    expect(screen.getByText('✨ Secret found! ✨')).toBeInTheDocument();
    act(() => flow.setState({ overlay: 'minigame', game: 'potion-lab' }));
    expect(screen.queryByText('✨ Secret found! ✨')).toBeNull();
    act(() => flow.setState({ overlay: null }));
    expect(screen.getByText('✨ Secret found! ✨')).toBeInTheDocument();
  });
});
