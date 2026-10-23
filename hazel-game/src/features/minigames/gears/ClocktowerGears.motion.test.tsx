import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Motion on: the gears that turn spin (review round 1: the drawing had no tests).
// The main tests stand in an always-ready wait (a step's buttons wait a moment as it starts — ClocktowerGears.taps.test).
vi.mock('../useSettled', () => ({ useSettled: () => () => true, SETTLE_MS: 450 }));
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => false,
}));
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  sfx: () => {},
}));

const { default: ClocktowerGears } = await import('./ClocktowerGears');
const { useSaveStore } = await import('../../../store/saveStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES } = await import('../../../content/minigames');

beforeEach(() => {
  useSaveStore.setState({ userId: null, save: defaultSave(), status: 'ready', remoteError: null });
});

const peg = (name: RegExp) => screen.getByRole('button', { name });
const place = (...names: RegExp[]) => names.forEach((n) => fireEvent.click(peg(n)));
const board = () => screen.getByRole('group', { name: /^The gear board/ });
/** Which way each spinning group turns, in the board's order: the crank, the machine, then the pegs. */
const spins = () => Array.from(board().querySelectorAll('g.animate-spin')).map((g) => g.getAttribute('data-turn'));

function play(band: 'gentle' | 'medium') {
  render(<ClocktowerGears def={MINIGAMES['clocktower-gears']} band={band} round={0} onPage={() => true} onFinish={() => {}} />);
}

describe('⚙️ the gears spin (motion on)', () => {
  it('nothing spins before the crank is turned; then every gear reached, each the other way, for three turns of the crank', () => {
    play('gentle');
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Middle row, peg 3:/, /^Middle row, peg 4:/);
    expect(spins()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    // The crank clockwise, the machine (four between) anticlockwise, the pegs alternating from anticlockwise.
    expect(spins()).toEqual(['cw', 'ccw', 'ccw', 'cw', 'ccw', 'cw']);
    for (const g of Array.from(board().querySelectorAll<SVGGElement>('g.animate-spin'))) {
      expect(g.style.animationDirection).toBe(g.getAttribute('data-turn') === 'ccw' ? 'reverse' : 'normal');
      expect(g.style.animationFillMode).toBe('forwards');
    }
    // Same-size gears turn as many times as the crank: three, then stop.
    const crank = board().querySelector<SVGGElement>('g.animate-spin')!;
    expect(crank.style.animationIterationCount).toBe('3');
    // Arrows on the hubs: the crank, the machine and the four gears.
    expect(board().querySelectorAll('[data-arrow="cw"], [data-arrow="ccw"]')).toHaveLength(6);
  });

  it('each gear turns as fast as its teeth say, for three turns of the crank (Tricky, a small crank)', () => {
    render(<ClocktowerGears def={MINIGAMES['clocktower-gears']} band="tricky" round={0} onPage={() => true} onFinish={() => {}} />);
    place(/^Middle row, peg 1:/, /^Top row, peg 1:/, /^Top row, peg 2:/, /^Top row, peg 3:/, /^Middle row, peg 4:/);
    fireEvent.click(screen.getByRole('button', { name: /^Small/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    const timing = Array.from(board().querySelectorAll<SVGGElement>('g.animate-spin')).map((g) => `${g.style.animationDuration} ×${g.style.animationIterationCount}`);
    // The 8-tooth crank: 3 s a turn, 3 turns; the 8-tooth machine the same; each 16-tooth gear half as fast, 1.5 turns.
    expect(timing).toEqual(['3s ×3', '3s ×3', '6s ×1.5', '6s ×1.5', '6s ×1.5', '6s ×1.5', '6s ×1.5']);
  });

  it('a gap: what the crank reaches turns, the rest and the machine stay still', () => {
    play('gentle');
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Middle row, peg 4:/);
    fireEvent.click(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    expect(spins()).toEqual(['cw', 'ccw', 'cw']);
  });

  it('a jam: nothing turns, not even the crank, and the stuck gears shake', () => {
    play('medium');
    // Before a run, the machine's dashed arrow says which way it must turn.
    expect(board().querySelector('[data-arrow="must-cw"]')).not.toBeNull();
    place(/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Top row, peg 1:/);
    fireEvent.click(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    expect(spins()).toEqual([]);
    expect(board().querySelectorAll('.cg-shake')).toHaveLength(3);
  });
});
