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
/** A key's press on a star (a click with no pointer press before it): never held back. */
const press = (id: string) => fireEvent.click(star(id));
/** A finger's tap on the sky over a star: a press and its lift there, the sky 100 px square (a tap's held back). */
function tapStar(id: string, band: 'gentle' | 'expert' = 'gentle', i = 0) {
  const sky = screen.getByRole('group', { name: 'The sky' });
  vi.spyOn(sky, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} } as DOMRect);
  const st = jobFor(band, 0, i).sky.find((o) => o.id === id)!;
  fireEvent.pointerDown(sky, { clientX: st.x, clientY: st.y, button: 0, pointerId: 1 });
  fireEvent.pointerUp(sky, { clientX: st.x, clientY: st.y, button: 0, pointerId: 1 });
  fireEvent.click(star(id), { detail: 1 });
}
/** A tap on a button: a click with a click count. */
const tap = (el: Element) => fireEvent.click(el, { detail: 1 });

describe('✨ a double tap', () => {
  it('a star, or “Show me a line”, tapped as a picture starts does nothing; a moment later it does', () => {
    render(<StarCharts def={MINIGAMES['star-charts']} band="gentle" round={0} onPage={() => true} onFinish={() => {}} />);
    tapStar('alnitak');
    tap(screen.getByRole('button', { name: '💡 Show me a line' }));
    expect(star('alnitak')).toHaveAttribute('aria-pressed', 'false');
    expect(star('alnitak')).not.toHaveAccessibleName(/glowing/);
    wait();
    tapStar('alnitak');
    expect(star('alnitak')).toHaveAttribute('aria-pressed', 'true');
    for (const [a, b] of PICTURE_BY_ID[jobFor('gentle', 0, 0).picture].lines) {
      if (star(a).getAttribute('aria-pressed') !== 'true') press(a);
      press(b);
    }
    // Next, and straight away a star where the finger was: not tapped.
    wait();
    tap(screen.getByRole('button', { name: 'Next picture' }));
    tapStar('vega', 'gentle', 1);
    expect(star('vega')).toHaveAttribute('aria-pressed', 'false');
    wait();
    tapStar('vega', 'gentle', 1);
    expect(star('vega')).toHaveAttribute('aria-pressed', 'true');
  });

  it('a key isn’t held back (PR 16, as the other games): a star and “Show me a line” from the keyboard as a picture starts', () => {
    render(<StarCharts def={MINIGAMES['star-charts']} band="gentle" round={0} onPage={() => true} onFinish={() => {}} />);
    press('alnitak');
    expect(star('alnitak')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '💡 Show me a line' }));
    expect(star('alnilam')).toHaveAccessibleName(/glowing/);
  });

  it('Expert (PR 16): a star tapped as the picture starts isn’t found or missed; a moment later it is', () => {
    render(<StarCharts def={MINIGAMES['star-charts']} band="expert" round={0} onPage={() => true} onFinish={() => {}} />);
    const job = jobFor('expert', 0, 0);
    tapStar(job.find!, 'expert');
    expect(screen.getByRole('heading', { name: /^Find / })).toBeInTheDocument();
    wait();
    tapStar(job.find!, 'expert');
    expect(screen.queryByRole('heading', { name: /^Find / })).toBeNull();
  });
});
