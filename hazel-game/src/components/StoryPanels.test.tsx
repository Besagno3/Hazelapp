import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('canvas-confetti', () => ({ default: Object.assign(vi.fn(), { reset: vi.fn() }) }));

const { default: StoryPanels, PICTURE_FADE_MS, WORDS_FADE_MS } = await import('./StoryPanels');
const { default: WakeFade, WAKE_MS, MORNING_MS, NEXT_MORNING } = await import('./WakeFade');
const { HOMECOMING_PANELS } = await import('../content/story');
const confetti = (await import('canvas-confetti')).default as unknown as { reset: ReturnType<typeof vi.fn> };

const cast = { hero: { spriteId: 'talon', emoji: '🦅' }, ember: { spriteId: 'ember-dragon', emoji: '🐉' } };
const WORDS = [
  { emoji: '1️⃣', text: 'First panel.' },
  { emoji: '2️⃣', text: 'Second panel.' },
  { emoji: '3️⃣', text: 'Third panel.' },
];

afterEach(() => vi.useRealTimers());

describe('the walk home after the Spire (#75 item 14)', () => {
  it('a picture panel shows its little scene (hidden from screen readers) above the words', () => {
    const { container } = render(<StoryPanels panels={[HOMECOMING_PANELS[0]]} doneLabel="💤 Good night" cast={cast} onDone={() => {}} />);
    expect(screen.getByText(/Down the Spire's long, winding stairs/)).toBeInTheDocument();
    const picture = container.querySelector('[aria-hidden] img[src="/backgrounds/crystal-spire.png"]');
    expect(picture).not.toBeNull();
    // The panels fade through solid black, so nothing behind shows.
    expect(screen.getByRole('dialog').className).toMatch(/\bbg-black\b/);
  });

  it('the inn at night, and "Good night" closes the run once the picture is in', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { container } = render(<StoryPanels panels={[HOMECOMING_PANELS[2]]} doneLabel="💤 Good night" cast={cast} onDone={onDone} />);
    expect(container.querySelector('img[src="/backgrounds/lumina-village.png"]')).not.toBeNull();
    const button = screen.getByRole('button', { name: '💤 Good night' });
    expect(document.activeElement).toBe(button); // Enter / Space go to bed
    act(() => vi.advanceTimersByTime(PICTURE_FADE_MS));
    fireEvent.click(button);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('without a cast, a picture panel falls back to its emoji', () => {
    render(<StoryPanels panels={[HOMECOMING_PANELS[1]]} doneLabel="OK" onDone={() => {}} />);
    expect(screen.getByText('🏮')).toBeInTheDocument();
  });

  it("the village's confetti is cleared when its picture goes", () => {
    const { unmount } = render(<StoryPanels panels={[HOMECOMING_PANELS[1]]} doneLabel="OK" cast={cast} onDone={() => {}} />);
    confetti.reset.mockClear();
    unmount();
    expect(confetti.reset).toHaveBeenCalled();
  });
});

describe('reading story panels', () => {
  it('a quick second tap is ignored until the next panel has faded in — no panel is skipped', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { container } = render(<StoryPanels panels={WORDS} doneLabel="Done" onDone={onDone} />);
    const button = () => screen.getByRole('button');
    // Which dot is lit: the panel on screen. (jsdom never finishes framer's
    // fade-out, so the dots stand in for the words here.)
    const lit = () => Array.from(container.querySelectorAll('.rounded-full')).findIndex((d) => d.className.includes('bg-amber-300'));
    // Taps while the first panel is still fading in do nothing.
    fireEvent.click(button());
    act(() => vi.advanceTimersByTime(WORDS_FADE_MS));
    // One tap moves on; a double tap's second press is ignored…
    fireEvent.click(button());
    fireEvent.click(button());
    // …and the label and dots stay with the panel on screen until the next one shows.
    expect([lit(), button().textContent]).toEqual([0, '▼ Next']);
    act(() => vi.advanceTimersByTime(4 * WORDS_FADE_MS));
    expect(lit()).toBe(1); // the second panel, not the third
    // Once it's in, the next tap reaches the last panel; its button says "Done".
    fireEvent.click(button());
    act(() => vi.advanceTimersByTime(WORDS_FADE_MS - 50));
    expect([lit(), button().textContent]).toEqual([1, '▼ Next']); // the second is still fading out
    act(() => vi.advanceTimersByTime(50));
    expect([lit(), button().textContent]).toEqual([2, 'Done']);
    fireEvent.click(button()); // still fading in: ignored
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(WORDS_FADE_MS));
    fireEvent.click(button());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('everything behind the story is inert while it plays, and the words are read with the button', () => {
    const { unmount } = render(
      <div>
        <button>📜 Menu</button>
        <StoryPanels panels={WORDS} doneLabel="Done" onDone={() => {}} />
      </div>,
    );
    expect(screen.getByRole('button', { name: '📜 Menu', hidden: true }).closest('[inert]')).not.toBeNull();
    const next = screen.getByRole('button', { name: '▼ Next' });
    expect(next.closest('[inert]')).toBeNull();
    expect(next).toHaveAccessibleDescription('First panel.');
    // Tab keeps to the button, so Enter still reads on.
    fireEvent.keyDown(next, { key: 'Tab' });
    expect(document.activeElement).toBe(next);
    // The panel's emoji is decoration, not something to read aloud.
    expect(screen.getByText('1️⃣')).toHaveAttribute('aria-hidden');
    unmount();
    expect(document.querySelector('[inert]')).toBeNull();
  });
});

describe('waking up at the inn', () => {
  it('"The next morning…" on the dark, then the morning stays a while before Act II', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(
      <div>
        <button>📜 Menu</button>
        <WakeFade onDone={onDone} />
      </div>,
    );
    // The HUD can't be tapped or tabbed to while the world is still asleep.
    expect(screen.getByRole('button', { name: '📜 Menu', hidden: true }).closest('[inert]')).not.toBeNull();
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByRole('status')).toHaveTextContent(NEXT_MORNING);
    expect(MORNING_MS).toBeGreaterThanOrEqual(1500);
    act(() => vi.advanceTimersByTime(WAKE_MS - 200));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
