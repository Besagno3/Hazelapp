import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';

// The step-start scroll and the keyboard (code and UX review round 2, PR 13): jsdom lays nothing out, so where a
// screen's layout matters it's stood in for — what sticks (`getComputedStyle`), what scrolls, and the screen's width.
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('../../../lib/audio', async (orig) => ({
  ...(await orig<typeof import('../../../lib/audio')>()),
  sfx: () => {},
}));

const { default: ClocktowerGears } = await import('./ClocktowerGears');
const { SETTLE_MS } = await import('../useSettled');
const { useSaveStore } = await import('../../../store/saveStore');
const { defaultSave } = await import('../../../lib/save');
const { MINIGAMES } = await import('../../../content/minigames');

let now = 0;
const scrollTo = vi.fn();
const scrollIntoView = vi.fn();
let phone = false;
/** Elements standing in as sticky, and as scrollers. */
let sticky: (el: Element) => boolean = () => false;
let scroller: (el: Element) => boolean = () => false;

beforeEach(() => {
  now = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  useSaveStore.setState({ userId: null, save: defaultSave(), status: 'ready', remoteError: null });
  scrollTo.mockClear();
  scrollIntoView.mockClear();
  Object.assign(HTMLElement.prototype, { scrollTo, scrollIntoView });
  phone = false;
  sticky = () => false;
  scroller = () => false;
  window.matchMedia = ((q: string) =>
    ({ matches: phone && q.includes('max-width: 639px'), media: q, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList) as typeof window.matchMedia;
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, p?: string | null) => {
    const s = real(el, p);
    return new Proxy(s, {
      get: (t, k) => (k === 'position' && sticky(el) ? 'sticky' : k === 'overflowY' && scroller(el) ? 'auto' : Reflect.get(t, k)),
    });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  delete (window as Partial<Window>).matchMedia;
});

const wait = () => act(() => void (now += SETTLE_MS));
const tap = (el: Element) => fireEvent.click(el, { detail: 1 });
const peg = (name: RegExp) => screen.getByRole('button', { name });
const middle = [/^Middle row, peg 1:/, /^Middle row, peg 2:/, /^Middle row, peg 3:/, /^Middle row, peg 4:/];
const play = (band: 'gentle' | 'expert' = 'gentle') =>
  render(<ClocktowerGears def={MINIGAMES['clocktower-gears']} band={band} round={0} onPage={() => true} onFinish={() => {}} />);
const isJobLine = (el: Element) => el.tagName === 'P' && el.textContent?.startsWith('Make the') === true;

describe('⚙️ the step-start scroll', () => {
  it('a phone on its side under 640 px: nothing scrolls the board away, though the job line sticks (code and UX review round 2: it scrolled 422 px)', () => {
    phone = true;
    sticky = isJobLine;
    scroller = (el) => el.tagName === 'DIV' && el.className.includes('overflow-y-auto');
    play('expert');
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    wait();
    for (const p of middle) tap(peg(p));
    tap(screen.getByRole('button', { name: /^Small/ }));
    tap(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    // What happened is brought into sight (the page scrolls to it, as ever); then Change the gears' step: nothing.
    expect(scrollTo).toHaveBeenCalled();
    scrollTo.mockClear();
    scrollIntoView.mockClear();
    wait();
    tap(screen.getByRole('button', { name: 'Change the gears' }));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('where the job line sticks, the side panel scrolls the crank’s gears in under it as a step starts', () => {
    sticky = isJobLine;
    scroller = (el) => el.tagName === 'ASIDE';
    play('expert');
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect((scrollTo.mock.contexts[0] as Element).tagName).toBe('ASIDE');
  });

  it('a peg that clears a miss scrolls nothing (UX review round 2: at 568 × 320 the board slid from under the finger)', () => {
    play();
    wait();
    tap(peg(middle[0]));
    tap(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    const before = scrollTo.mock.calls.length + scrollIntoView.mock.calls.length;
    wait();
    tap(peg(middle[1]));
    expect(screen.getByText('Two gears on the pegs.')).toBeInTheDocument();
    expect(scrollTo.mock.calls.length + scrollIntoView.mock.calls.length).toBe(before);
  });
});

describe('⚙️ a double Enter', () => {
  it('after Change the gears, Enter on the crank’s peg at once is the double’s second: held (UX review round 2: it took the gear off); a moment later it isn’t', () => {
    play();
    wait();
    tap(peg(middle[0]));
    tap(peg(middle[2]));
    tap(screen.getByRole('button', { name: 'Turn the crank ↻' }));
    expect(screen.getByRole('heading', { name: 'Not joined yet' })).toBeInTheDocument();
    // Enter on Change the gears (a key's click has no click count), then Enter again at once — on the crank's peg.
    fireEvent.click(screen.getByRole('button', { name: 'Change the gears' }), { detail: 0 });
    expect(peg(middle[0])).toHaveFocus();
    fireEvent.keyDown(peg(middle[0]), { key: 'Enter' });
    expect(screen.getByText('Two gears on the pegs.')).toBeInTheDocument();
    wait();
    fireEvent.keyDown(peg(middle[0]), { key: 'Enter' });
    expect(screen.getByText('One gear on the pegs.')).toBeInTheDocument();
  });
});
