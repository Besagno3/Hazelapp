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
const { fitOffset, jobFor, ringsOf } = await import('../../../lib/minigames/rings');

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
/** A tap: a click with a click count, as a finger's is (a key's has none). */
const tap = (el: Element) => fireEvent.click(el, { detail: 1 });
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

  it('Medium: a dry year pressed as its step starts does nothing, nor a ring as the next tree starts (code review round 2)', () => {
    render(<RingwoodsRings def={MINIGAMES['ringwoods-rings']} band="medium" round={0} onPage={() => true} onFinish={() => {}} />);
    const job = jobFor('medium', 0, 0);
    if (job.kind !== 'date') throw new Error('a date job');
    wait();
    ring(job.rings.indexOf(job.event.year));
    expect(screen.getByRole('heading', { name: 'The dry years' })).toBeInTheDocument();
    const dry = ringsOf(job.rings, 'dry');
    ring(job.rings.indexOf(dry[0]));
    expect(screen.queryByText(new RegExp(`^${dry[0]} — a dry year`))).not.toBeInTheDocument();
    wait();
    for (const y of dry) ring(job.rings.indexOf(y));
    wait();
    fireEvent.click(screen.getByRole('button', { name: 'Next tree' }));
    expect(screen.getByRole('heading', { name: 'Find the year' })).toBeInTheDocument();
    // The second tap of the double lands on a ring as the next tree starts: nothing.
    ring(0);
    expect(screen.getAllByText(/^Count in from the bark/)).toHaveLength(1);
  });

  it('Tricky: Slide and “Do they match?” tapped as the step starts do nothing; a key’s at once (PR 17)', () => {
    const { unmount } = render(<RingwoodsRings def={MINIGAMES['ringwoods-rings']} band="tricky" round={0} onPage={() => true} onFinish={() => {}} />);
    const job = jobFor('tricky', 0, 0);
    if (job.kind !== 'match') throw new Error('a match job');
    tap(screen.getByRole('button', { name: 'Slide ▶' }));
    tap(screen.getByRole('button', { name: 'Do they match?' }));
    expect(screen.getByRole('button', { name: '◀ Slide' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText(/^Not yet/)).not.toBeInTheDocument();
    wait();
    for (let k = 0; k < fitOffset(job); k++) tap(screen.getByRole('button', { name: 'Slide ▶' }));
    tap(screen.getByRole('button', { name: 'Do they match?' }));
    expect(screen.getByRole('heading', { name: `Cut in ${job.beam[job.beam.length - 1]}!` })).toBeInTheDocument();
    unmount();
    // A key isn't held back: the focus is on the step's heading as it starts, not on a button.
    render(<RingwoodsRings def={MINIGAMES['ringwoods-rings']} band="tricky" round={0} onPage={() => true} onFinish={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Slide ▶' }), { detail: 0 });
    expect(screen.getByRole('button', { name: '◀ Slide' })).not.toHaveAttribute('aria-disabled');
  });

  it('Expert: a year tapped as the dating starts isn’t picked; a moment later it is; a key’s at once', () => {
    render(<RingwoodsRings def={MINIGAMES['ringwoods-rings']} band="expert" round={0} onPage={() => true} onFinish={() => {}} />);
    const job = jobFor('expert', 0, 0);
    if (job.kind !== 'rain') throw new Error('a rain job');
    const end = String(job.beam[job.beam.length - 1]);
    for (let k = 0; k < fitOffset(job); k++) fireEvent.click(screen.getByRole('button', { name: 'Slide ▶' }), { detail: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Do they line up?' }), { detail: 0 });
    expect(screen.getByRole('heading', { name: 'Date it' })).toBeInTheDocument();
    // The second tap of a double on "Do they line up?" lands on a year: nothing.
    tap(screen.getByRole('button', { name: end }));
    expect(screen.getByRole('heading', { name: 'Date it' })).toBeInTheDocument();
    wait();
    tap(screen.getByRole('button', { name: end }));
    expect(screen.getByRole('heading', { name: `Cut in ${end}` })).toBeInTheDocument();
  });
});
