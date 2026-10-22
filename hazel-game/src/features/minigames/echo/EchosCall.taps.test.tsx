import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';

// A double tap: a step's buttons wait a moment as it starts (`useSettled`), so the second tap of a double tap on "Next
// — up or down?" doesn't answer the question that comes under the finger. The clock is stood in for.
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  sfx: () => {},
}));
vi.mock('../../../lib/tones', () => ({ playTone: () => {} }));

const { default: EchosCall } = await import('./EchosCall');
const { SETTLE_MS } = await import('../useSettled');
const { useSaveStore } = await import('../../../store/saveStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES } = await import('../../../content/minigames');

let now = 0;
beforeEach(() => {
  now = 10_000;
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  useSaveStore.setState({ userId: null, save: defaultSave(), status: 'ready', remoteError: null });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const wait = (ms = SETTLE_MS) => act(() => void (now += ms));

describe('🎵 a double tap', () => {
  it('a second tap straight after “Next — up or down?” answers nothing; a moment later it does', () => {
    render(<EchosCall def={MINIGAMES['echos-call']} band="gentle" round={0} onPage={() => true} onFinish={() => {}} />);
    wait();
    fireEvent.click(screen.getByRole('button', { name: '▶ Listen' }));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next — up or down?' }));
    expect(screen.getByRole('heading', { name: 'Step 2 · Up or down?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Higher' }));
    expect(screen.getByRole('heading', { name: 'Step 2 · Up or down?' })).toBeInTheDocument();
    wait();
    fireEvent.click(screen.getByRole('button', { name: 'Higher' }));
    expect(screen.getByRole('heading', { name: 'Step 3 · Play it back' })).toBeInTheDocument();
  });
});
