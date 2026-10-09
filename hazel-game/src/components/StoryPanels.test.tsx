import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

const { default: StoryPanels } = await import('./StoryPanels');
const { default: WakeFade, WAKE_MS } = await import('./WakeFade');
const { HOMECOMING_PANELS } = await import('../content/story');

const cast = { hero: { spriteId: 'nova', emoji: '🦅' }, ember: { spriteId: 'ember-dragon', emoji: '🐉' } };

describe('the walk home after the Spire (#75 item 14)', () => {
  it('a picture panel shows its little scene (hidden from screen readers) above the words', () => {
    const { container } = render(<StoryPanels panels={[HOMECOMING_PANELS[0]]} doneLabel="💤 Good night" cast={cast} onDone={() => {}} />);
    expect(screen.getByText(/Down the Spire's long, winding stairs/)).toBeInTheDocument();
    const picture = container.querySelector('[aria-hidden] img[src="/backgrounds/crystal-spire.png"]');
    expect(picture).not.toBeNull();
    // The panels fade through solid black, so nothing behind shows.
    expect(screen.getByRole('dialog').className).toMatch(/\bbg-black\b/);
  });

  it('the inn at night, and "Good night" closes the run', () => {
    const onDone = vi.fn();
    const { container } = render(<StoryPanels panels={[HOMECOMING_PANELS[2]]} doneLabel="💤 Good night" cast={cast} onDone={onDone} />);
    expect(container.querySelector('img[src="/backgrounds/lumina-village.png"]')).not.toBeNull();
    const button = screen.getByRole('button', { name: '💤 Good night' });
    expect(document.activeElement).toBe(button); // Enter / Space go to bed
    fireEvent.click(button);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('without a cast, a picture panel falls back to its emoji', () => {
    render(<StoryPanels panels={[HOMECOMING_PANELS[1]]} doneLabel="OK" onDone={() => {}} />);
    expect(screen.getByText('🏮')).toBeInTheDocument();
  });

  it('waking: the morning fades in, then Act II may begin', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<WakeFade onDone={onDone} />);
    act(() => vi.advanceTimersByTime(WAKE_MS - 100));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
