import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// The board fits its space from `sm` up (review rounds 1 and 2): jsdom has no layout, so the space, the screen
// width and ResizeObserver are stood in for.
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  sfx: () => {},
}));

const { default: ClocktowerGears } = await import('./ClocktowerGears');
const { useSaveStore } = await import('../../../store/saveStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES } = await import('../../../content/minigames');
const { boardBox, jobFor } = await import('../../../lib/minigames/gears');

const disconnect = vi.fn();
class FakeResizeObserver {
  readonly cb: () => void;
  constructor(cb: () => void) {
    this.cb = cb;
  }
  observe() {
    this.cb();
  }
  disconnect = disconnect;
}

function screenIs(wide: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: wide && q.includes('min-width: 640px'), media: q, addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => {
  useSaveStore.setState({ userId: null, save: defaultSave(), status: 'ready', remoteError: null });
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  // Every box is 800 × 400: the board's space included.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 800, height: 400, top: 0, left: 0, right: 800, bottom: 400, x: 0, y: 0, toJSON() {} } as DOMRect);
  disconnect.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const wrapper = () => screen.getByRole('group', { name: /^The gear board/ }).parentElement!;
const play = () => render(<ClocktowerGears def={MINIGAMES['clocktower-gears']} band="gentle" round={0} onPage={() => true} onFinish={() => {}} />);

describe('⚙️ the board fits its space', () => {
  it('from `sm` up: as wide as the space’s height allows at the board’s shape, keeping room for its heading and labels', () => {
    screenIs(true);
    play();
    const f = boardBox(jobFor('gentle', 0, 0).board, 16);
    expect(wrapper().style.width).toBe(`${Math.floor(Math.min(800, (400 - 76) * (f.w / f.h)))}px`);
  });

  it('on a phone: the space’s width (fitting to its own height would shrink it for ever)', () => {
    screenIs(false);
    play();
    expect(wrapper().style.width).toBe('');
  });

  it('stops watching when the game goes', () => {
    screenIs(true);
    const { unmount } = play();
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
