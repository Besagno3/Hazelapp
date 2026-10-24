import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

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
const { NAME, jobFor, recipe, roundQueue, toPaint } = await import('../../../lib/minigames/mural');

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

  it('Expert: the axes’ numbers come out of the canvas’s room, so its squares keep their floor (PR 14)', () => {
    screenIs(true);
    spaceIs(380, 214);
    render(<MirrorMural def={MINIGAMES['mirror-mural']} band="expert" round={0} onPage={() => true} onFinish={() => {}} />);
    // Gentle's would be 174 px, over its floor; with the axes' 16 px the floor is 180, and the space scrolls.
    expect(fitCanvas({ w: 380, h: 214, heading: 40, short: false }, gentle).size).toBe(174);
    expect(column().parentElement!.style.width).toBe(`${FLOOR_PX + 16}px`);
  });

  it('Expert on a phone: Step 1 scrolls the page so A and A′, drawn small by the ask, and the gold button are both in sight — the picture first where they don’t fit (UX review round 1, PR 14)', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('max-width: 639px'), media: q, addEventListener() {}, removeEventListener() {} }));
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollTo = scrollTo;
    try {
      // The page 600 px tall, scrolled to its top; the small picture 500 px down; the button at `go`.
      let go = 900;
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const [top, bottom] = this.textContent === 'Pick a move' ? [go, go + 56] : this.firstElementChild?.classList.contains('w-[136px]') ? [500, 640] : [0, 600];
        return { width: 375, height: bottom - top, top, bottom, left: 0, right: 375, x: 0, y: top, toJSON() {} } as DOMRect;
      });
      const { unmount } = render(<MirrorMural def={MINIGAMES['mirror-mural']} band="expert" round={0} onPage={() => true} onFinish={() => {}} />);
      // The button's foot 8 px over the page's (956 + 8 − 600), which leaves the picture's top in sight.
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 364, behavior: 'auto' });
      unmount();
      // Too far apart for both: the picture's top 8 px under the page's, the button below.
      go = 1200;
      render(<MirrorMural def={MINIGAMES['mirror-mural']} band="expert" round={0} onPage={() => true} onFinish={() => {}} />);
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 492, behavior: 'auto' });
    } finally {
      delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
    }
  });

  it('a canvas held at its floor scrolls in the board: as painting starts, the gold button comes into sight there, the canvas’s top kept (UX review round 1, PR 14: Check the image was under the footer at 683 × 600)', () => {
    screenIs(true);
    // What scrolled, and how far: the board, or another scroller.
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollTo = function (this: HTMLElement, o?: ScrollToOptions | number) {
      scrollTo(this.getAttribute('aria-labelledby') === 'mm-canvas' ? 'board' : this.tagName.toLowerCase(), o);
    } as HTMLElement['scrollTo'];
    try {
      // The board 224–548 px, more inside than it shows; the canvas from 284, Check the image from `go`.
      let go = 524;
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const [top, bottom] =
          this.getAttribute('aria-labelledby') === 'mm-canvas' ? [224, 548] : ['🪞 Check the image', 'Paint the image first'].includes(this.textContent ?? '') ? [go, go + 56] : this.getAttribute('aria-label') === 'The picture' ? [284, 448] : [0, 288];
        return { width: 336, height: bottom - top, top, bottom, left: 0, right: 336, x: 0, y: top, toJSON() {} } as DOMRect;
      });
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
        return this.getAttribute('aria-labelledby') === 'mm-canvas' ? 356 : 0;
      });
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
        return this.getAttribute('aria-labelledby') === 'mm-canvas' ? 320 : 0;
      });
      render(<MirrorMural def={MINIGAMES['mirror-mural']} band="expert" round={0} onPage={() => true} onFinish={() => {}} />);
      expect(scrollTo).not.toHaveBeenCalledWith('board', expect.anything());
      fireEvent.click(within(screen.getByRole('group', { name: 'Moves' })).getAllByRole('button')[0]);
      fireEvent.click(screen.getByRole('button', { name: 'That’s the move' }));
      // Check's foot 8 px over the board's (580 + 8 − 548); the canvas's top still 20 px in.
      expect(scrollTo).toHaveBeenLastCalledWith('board', { top: 40, behavior: 'auto' });
      // Too far apart for both (code review round 2): the canvas's top 8 px under the board's, Check below.
      cleanup();
      go = 600;
      render(<MirrorMural def={MINIGAMES['mirror-mural']} band="expert" round={0} onPage={() => true} onFinish={() => {}} />);
      fireEvent.click(within(screen.getByRole('group', { name: 'Moves' })).getAllByRole('button')[0]);
      fireEvent.click(screen.getByRole('button', { name: 'That’s the move' }));
      expect(scrollTo).toHaveBeenLastCalledWith('board', { top: 52, behavior: 'auto' });
      // A check doesn't scroll the board again (UX review round 2: after a miss it pulled Check away).
      const calls = scrollTo.mock.calls.length;
      fireEvent.click(document.querySelector('[data-cell="0,3"]')!);
      fireEvent.click(screen.getByRole('button', { name: '🪞 Check the image' }));
      expect(screen.getAllByRole('button', { name: /Doesn’t match yet\.$/ }).length).toBeGreaterThan(0);
      expect(scrollTo.mock.calls.slice(calls).filter(([el]) => el === 'board')).toEqual([]);
    } finally {
      delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
    }
  });

  it('the free canvas’s board scroll lets Hang it and Not this time win where they and the canvas don’t both fit (UX review round 2, PR 14)', () => {
    screenIs(true);
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollTo = function (this: HTMLElement, o?: ScrollToOptions | number) {
      scrollTo(this.getAttribute('aria-labelledby') === 'mm-canvas' ? 'board' : this.tagName.toLowerCase(), o);
    } as HTMLElement['scrollTo'];
    try {
      // The board 224–548 px, more inside than it shows; a canvas from 284, the free canvas's gold button 600–656.
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const [top, bottom] =
          this.getAttribute('aria-labelledby') === 'mm-canvas'
            ? [224, 548]
            : this.textContent === 'Paint a square first'
              ? [600, 656]
              : ['The picture', 'Your picture'].includes(this.getAttribute('aria-label') ?? '')
                ? [284, 448]
                : [0, 288];
        return { width: 336, height: bottom - top, top, bottom, left: 0, right: 336, x: 0, y: top, toJSON() {} } as DOMRect;
      });
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
        return this.getAttribute('aria-labelledby') === 'mm-canvas' ? 500 : 0;
      });
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
        return this.getAttribute('aria-labelledby') === 'mm-canvas' ? 320 : 0;
      });
      render(<MirrorMural def={MINIGAMES['mirror-mural']} band="gentle" round={0} onPage={() => true} onFinish={() => {}} />);
      // Three pictures, from the keyboard.
      const queue = roundQueue(() => false, 0);
      for (let i = 0; i < 3; i++) {
        const job = jobFor('gentle', 0, i, queue);
        const [a, b] = recipe(job.mixColour)!;
        for (const pot of [a, b]) fireEvent.click(within(screen.getByRole('group', { name: 'Paint pots' })).getByRole('button', { name: pot.charAt(0).toUpperCase() + pot.slice(1) }));
        fireEvent.click(screen.getByRole('button', { name: 'Mix them' }));
        for (const [r, c] of toPaint(job.kind)) {
          const v = job.goal[r][c];
          if (!v) continue;
          fireEvent.click(within(screen.getByRole('group', { name: 'Paints' })).getByRole('button', { name: NAME[v].charAt(0).toUpperCase() + NAME[v].slice(1) }));
          fireEvent.click(document.querySelector(`[data-cell="${r},${c}"]`)!);
        }
        fireEvent.click(screen.getByRole('button', { name: '🪞 Hold up the mirror' }));
        fireEvent.click(screen.getByRole('button', { name: i < 2 ? 'Next picture' : 'Next — paint your own!' }));
      }
      expect(screen.getByRole('heading', { name: 'Your turn!' })).toBeInTheDocument();
      // The button's foot 8 px over the board's (656 + 8 − 548), the canvas's top under it.
      expect(scrollTo).toHaveBeenLastCalledWith('board', { top: 116, behavior: 'auto' });
    } finally {
      delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
    }
  });

  it('Expert from `sm`: Step 1 scrolls the side panel so the ask and That’s the move are in sight — the ask first where they don’t fit (UX review round 2, PR 14)', () => {
    screenIs(true);
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollTo = function (this: HTMLElement, o?: ScrollToOptions | number) {
      scrollTo(this.tagName.toLowerCase(), o);
    } as HTMLElement['scrollTo'];
    try {
      // The panel 100–500 px, the ask from 450, the gold button from `go`.
      let go = 700;
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const [top, bottom] = this.tagName === 'ASIDE' ? [100, 500] : this.className.includes('grid-cols-[auto') ? [450, 520] : this.textContent === 'Pick a move' ? [go, go + 56] : [0, 288];
        return { width: 300, height: bottom - top, top, bottom, left: 0, right: 300, x: 0, y: top, toJSON() {} } as DOMRect;
      });
      const { unmount } = render(<MirrorMural def={MINIGAMES['mirror-mural']} band="expert" round={0} onPage={() => true} onFinish={() => {}} />);
      // The button's foot 8 px over the panel's (756 + 8 − 500); the ask still in sight.
      expect(scrollTo).toHaveBeenLastCalledWith('aside', { top: 264, behavior: 'auto' });
      unmount();
      // Too far apart: the ask 8 px under the panel's top.
      go = 900;
      render(<MirrorMural def={MINIGAMES['mirror-mural']} band="expert" round={0} onPage={() => true} onFinish={() => {}} />);
      expect(scrollTo).toHaveBeenLastCalledWith('aside', { top: 342, behavior: 'auto' });
    } finally {
      delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
    }
  });

  it('stops watching when the game goes', () => {
    screenIs(true);
    spaceIs(800, 400);
    const { unmount } = play();
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
