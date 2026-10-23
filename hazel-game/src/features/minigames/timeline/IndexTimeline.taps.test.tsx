import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';

// A double tap (code review round 1): a step's buttons wait a moment as it starts — and Check again after a wrong check,
// so the second tap doesn't wipe the clue. The clock is stood in for (performance.now).
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  sfx: () => {},
}));

const { default: IndexTimeline } = await import('./IndexTimeline');
const { SETTLE_MS } = await import('../useSettled');
const { useSaveStore } = await import('../../../store/saveStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES } = await import('../../../content/minigames');
const { jobFor } = await import('../../../lib/minigames/timeline');

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
const tray = () => screen.getByRole('group', { name: /^The washed-up cards/ });
const index = () => document.querySelector('[aria-live="polite"]')?.textContent ?? '';

describe('📜 a double tap', () => {
  it('a card pressed as a drawer starts does nothing; Check pressed twice after a wrong check keeps its clue', () => {
    render(<IndexTimeline def={MINIGAMES['index-timeline']} band="gentle" round={0} onPage={() => true} onFinish={() => {}} />);
    const job = jobFor('gentle', 0, 0);
    fireEvent.click(within(tray()).getAllByRole('button')[0]);
    expect(within(tray()).getAllByRole('button')).toHaveLength(job.events.length);
    wait();
    // The dealt order (never right): placed as dealt, checked — and Check again, straight away.
    for (const id of job.dealt) fireEvent.click(within(tray()).getByRole('button', { name: job.events.find((ev) => ev.id === id)!.name }));
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
    const clue = index();
    expect(clue).toMatch(/in the right place!|^.*Not yet!/);
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
    expect(index()).toBe(clue);
    wait();
    fireEvent.click(screen.getByRole('button', { name: 'Check the order' }));
    expect(index()).toContain('Every card on the timeline first');
  });
});
