import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// The canvas fits its space from `sm` up, with its paints and the mirror under it or beside it — measured (review
// round 1: they went under the footer). jsdom has no layout, so the space, the heights, the screen and
// ResizeObserver are stood in for.
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  sfx: () => {},
}));

const { default: MirrorMural } = await import('./MirrorMural');
const { useSaveStore } = await import('../../../store/saveStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES } = await import('../../../content/minigames');
const { FLOOR_PX, controlsHeight, fitCanvas } = await import('./layout');

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

function screenIs(wide: boolean, short = false) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: (wide && q.includes('min-width: 640px')) || (short && q.includes('max-height: 500px')),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
}

/** The space is `w` × `h`; the heading over the canvas 32 px tall (the paints aren't measured: `layout.ts` knows them). */
function spaceIs(w: number, h: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON() {} } as DOMRect);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.id === 'mm-canvas' ? 32 : 0;
  });
}

beforeEach(() => {
  useSaveStore.setState({ userId: null, save: defaultSave(), status: 'ready', remoteError: null });
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  disconnect.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const column = () => screen.getByRole('group', { name: 'The picture' }).parentElement!;
const controls = () => screen.getByRole('group', { name: 'Paints' }).parentElement!.parentElement!;
const play = () => render(<MirrorMural def={MINIGAMES['mirror-mural']} band="gentle" round={0} onPage={() => true} onFinish={() => {}} />);
const gentle = { paints: 2, pairs: false, free: false };

describe('🪞 the canvas fits its space', () => {
  it('a wide space: the paints and the mirror beside the canvas, which is as tall as the space under its heading', () => {
    screenIs(true);
    spaceIs(800, 400);
    play();
    expect(column().style.width).toBe(`${400 - 32 - 8}px`);
    expect(controls()).toHaveClass('flex-1');
  });

  it('a tall space: under it, at the height its paints and mirror stand', () => {
    screenIs(true);
    spaceIs(600, 700);
    play();
    expect(column().style.width).toBe(`${700 - 40 - 8 - controlsHeight(gentle, 600, false, false)}px`);
    expect(controls()).not.toHaveClass('flex-1');
  });

  it('a short screen: compact paints; the same as `fitCanvas` works out', () => {
    screenIs(true, true);
    spaceIs(450, 400);
    play();
    const fit = fitCanvas({ w: 450, h: 400, heading: 40, short: true }, gentle);
    expect(fit.compact).toBe(true);
    expect(column().style.width).toBe(`${fit.size}px`);
    expect(screen.getByRole('button', { name: 'Purple' })).toHaveClass('w-14');
  });

  it('too small a space to tap in: the canvas keeps the floor’s size, and its space scrolls — never a canvas that hides the mirror', () => {
    screenIs(true);
    spaceIs(308, 260);
    play();
    expect(column().style.width).toBe(`${FLOOR_PX}px`);
    expect(column().parentElement!.parentElement).toHaveClass('sm:items-start');
  });

  it('on a phone: the space’s width (the page scrolls)', () => {
    screenIs(false);
    spaceIs(375, 600);
    play();
    expect(column().style.width).toBe('');
  });

  it('stops watching when the game goes', () => {
    screenIs(true);
    spaceIs(800, 400);
    const { unmount } = play();
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
