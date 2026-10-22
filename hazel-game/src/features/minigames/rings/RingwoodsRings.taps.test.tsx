import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';

// A double tap (code review round 1): a step's rings wait a moment as it starts, so a second tap on whatever came under
// the finger does nothing. The clock is stood in for (performance.now).
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  sfx: () => {},
}));

const { default: RingwoodsRings } = await import('./RingwoodsRings');
const { SETTLE_MS } = await import('../useSettled');
const { useSaveStore } = await import('../../../store/saveStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES } = await import('../../../content/minigames');
const { jobFor } = await import('../../../lib/minigames/rings');

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
const ring = (k: number) => fireEvent.click(document.querySelector<HTMLButtonElement>(`[data-ring="${k}"]`)!);

describe('🌳 a double tap', () => {
  it('a ring pressed as the count starts, or as the wettest year’s step does, does nothing; a moment later it does', () => {
    render(<RingwoodsRings def={MINIGAMES['ringwoods-rings']} band="gentle" round={0} onPage={() => true} onFinish={() => {}} />);
    const job = jobFor('gentle', 0, 0); // Silver Birch, 2016–2019: its widest ring the fourth
    ring(0);
    expect(screen.queryByText('One!')).not.toBeInTheDocument();
    wait();
    job.rings.forEach((_, k) => ring(k));
    expect(screen.getByRole('heading', { name: 'The wettest year' })).toBeInTheDocument();
    // The last ring counted, and straight away again — on the wettest ring: not picked.
    ring(3);
    expect(screen.queryByRole('heading', { name: 'Silver Birch!' })).not.toBeInTheDocument();
    wait();
    ring(3);
    expect(screen.getByRole('heading', { name: 'Silver Birch!' })).toBeInTheDocument();
  });
});
