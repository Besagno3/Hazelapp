import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('canvas-confetti', () => ({ default: () => {} }));
const sendFlow = vi.fn();
vi.mock('../../machines/gameFlow', async (orig) => ({
  ...(await orig<typeof import('../../machines/gameFlow')>()),
  sendFlow: (...args: unknown[]) => sendFlow(...args),
}));
vi.mock('../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../lib/audio')>()),
  playMusic: () => {},
  sfx: () => {},
}));
// The play screen's file doesn't come (offline, or a deploy replaced it); the title card's art does.
vi.mock('./games', async (orig) => {
  const real = await orig<typeof import('./games')>();
  const { retryableLazy } = await import('../../lib/lazyRetry');
  const failing = retryableLazy<import('./types').PlayProps>(() =>
    Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/PotionLab.js')),
  );
  return { GAME_SCREENS: { 'potion-lab': { ...real.GAME_SCREENS['potion-lab'], Play: failing } } };
});

const { default: MiniGameStage } = await import('./MiniGameStage');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { defaultSave } = await import('../../lib/save');

beforeEach(() => {
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags: {} }, status: 'ready', remoteError: null });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: new Date().getFullYear() - 9, birthMonth: 1, skillLevels: { science: 2 }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
  });
});

describe('a play screen that doesn’t load (docs/DESIGN-MINIGAMES.md §4)', () => {
  it('says so on the stage, with Try again — and the way back to the map still works', async () => {
    render(<MiniGameStage game="potion-lab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let’s brew!' }));
    expect(await screen.findByText(/The Potion Lab didn’t open/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the map' }));
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
  });
});
