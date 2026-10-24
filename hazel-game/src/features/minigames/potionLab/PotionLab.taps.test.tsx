import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';

// A double tap (UX review round 2): a step's buttons wait a moment as it starts, so the second tap of a double doesn't
// press what came under the finger. Reduced motion: no stir, so Stir's second tap would land on the result's buttons. The
// clock is stood in for (performance.now).
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  sfx: () => {},
}));

const { default: PotionLab } = await import('./PotionLab');
const { SETTLE_MS } = await import('../useSettled');
const { useSaveStore } = await import('../../../store/saveStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES } = await import('../../../content/minigames');

let now = 0;
beforeEach(() => {
  now = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  useSaveStore.setState({ userId: null, save: defaultSave(), status: 'ready', remoteError: null });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const wait = () => act(() => void (now += SETTLE_MS));
const jar = (name: RegExp) => within(screen.getByRole('group', { name: 'Jars on the counter' })).getByRole('button', { name: name });
const guess = (name: string) => within(screen.getByRole('group', { name: 'Your guess' })).getByRole('button', { name });
const onFinish = vi.fn();
const play = () => render(<PotionLab def={MINIGAMES['potion-lab']} band="expert" round={0} onPage={() => true} onFinish={onFinish} />);

describe('🧪 a double tap', () => {
  it('a jar’s second tap doesn’t pick the guess that came under it; a moment later it does', () => {
    play();
    // As the round starts, too: Let's brew!'s second tap.
    fireEvent.click(jar(/^Orange juice/));
    expect(screen.queryByRole('group', { name: 'Your guess' })).toBeNull();
    wait();
    fireEvent.click(jar(/^Orange juice/));
    fireEvent.click(guess('pH 4'));
    expect(guess('pH 4')).toHaveAttribute('aria-pressed', 'false');
    wait();
    fireEvent.click(guess('pH 4'));
    expect(guess('pH 4')).toHaveAttribute('aria-pressed', 'true');
  });

  it('Stir’s second tap doesn’t give the potion away before the result’s seen', () => {
    onFinish.mockClear();
    play();
    wait();
    fireEvent.click(jar(/^Orange juice/));
    wait();
    fireEvent.click(guess('pH 4'));
    fireEvent.click(screen.getByRole('button', { name: 'Stir and brew!' }));
    fireEvent.click(screen.getByRole('button', { name: 'Give it to Fern' }));
    expect(onFinish).not.toHaveBeenCalled();
    wait();
    fireEvent.click(screen.getByRole('button', { name: 'Give it to Fern' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('nor wipe a miss with “Try another jar”', () => {
    play();
    wait();
    fireEvent.click(jar(/^Lemon juice/));
    wait();
    fireEvent.click(guess('pH 2'));
    fireEvent.click(screen.getByRole('button', { name: 'Stir and brew!' }));
    const tryAnother = screen.getByRole('button', { name: 'Try another jar' });
    fireEvent.click(tryAnother);
    expect(screen.getByText(/You said pH 2 — spot on\./)).toBeInTheDocument();
    wait();
    fireEvent.click(tryAnother);
    expect(screen.getByRole('heading', { name: 'Step 1 · Pick a jar' })).toBeInTheDocument();
  });
});
