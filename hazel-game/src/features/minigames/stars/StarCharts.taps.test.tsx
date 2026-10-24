import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';

// A double tap (code review round 2): a step's buttons wait a moment as it starts, so a second tap on whatever came
// under the finger does nothing. The clock is stood in for (performance.now).
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  sfx: () => {},
}));

const { default: StarCharts } = await import('./StarCharts');
const { SETTLE_MS } = await import('../useSettled');
const { useSaveStore } = await import('../../../store/saveStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES } = await import('../../../content/minigames');
const { PICTURE_BY_ID, jobFor } = await import('../../../lib/minigames/stars');

let now = 0;
beforeEach(() => {
  now = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  useSaveStore.setState({ userId: null, save: defaultSave(), status: 'ready', remoteError: null });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const wait = (ms = SETTLE_MS) => act(() => void (now += ms));
const star = (id: string) => document.querySelector<HTMLButtonElement>(`[data-star="${id}"]`)!;
const press = (id: string) => fireEvent.click(star(id));

describe('✨ a double tap', () => {
  it('a star, or “Show me a line”, pressed as a picture starts does nothing; a moment later it does', () => {
    render(<StarCharts def={MINIGAMES['star-charts']} band="gentle" round={0} onPage={() => true} onFinish={() => {}} />);
    press('alnitak');
    fireEvent.click(screen.getByRole('button', { name: '💡 Show me a line' }));
    expect(star('alnitak')).toHaveAttribute('aria-pressed', 'false');
    expect(star('alnitak')).not.toHaveAccessibleName(/glowing/);
    wait();
    press('alnitak');
    expect(star('alnitak')).toHaveAttribute('aria-pressed', 'true');
    for (const [a, b] of PICTURE_BY_ID[jobFor('gentle', 0, 0).picture].lines) {
      if (star(a).getAttribute('aria-pressed') !== 'true') press(a);
      press(b);
    }
    // Next, and straight away a star where the finger was: not tapped.
    wait();
    fireEvent.click(screen.getByRole('button', { name: 'Next picture' }));
    press('vega');
    expect(star('vega')).toHaveAttribute('aria-pressed', 'false');
    wait();
    press('vega');
    expect(star('vega')).toHaveAttribute('aria-pressed', 'true');
  });
});
