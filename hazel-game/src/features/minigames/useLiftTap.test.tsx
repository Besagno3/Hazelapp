import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useLiftTap } from './useLiftTap';

/** A board: a press is on "a"; its own button, for the keyboard and a reader. */
function Board({ onTap, off = false }: { onTap: (t: string) => void; off?: boolean }) {
  const { handlers, pointerClick } = useLiftTap<string, HTMLDivElement>(() => 'a', onTap, off);
  return (
    <div data-testid="board" {...handlers}>
      <button type="button" onClick={(e) => !pointerClick(e) && onTap('button')}>
        a
      </button>
    </div>
  );
}

const down = (el: Element, o: object = {}) => fireEvent.pointerDown(el, { clientX: 10, clientY: 10, button: 0, pointerType: 'touch', ...o });
const up = (el: Element, o: object = {}) => fireEvent.pointerUp(el, { clientX: 10, clientY: 10, button: 0, pointerType: 'touch', ...o });

describe('a tap on the lift (useLiftTap; code review round 2)', () => {
  it('a press lifted is one tap, its click after it not a second; a move or a cancel is the page scrolling', () => {
    const onTap = vi.fn();
    render(<Board onTap={onTap} />);
    const board = screen.getByTestId('board');
    const button = screen.getByRole('button');
    down(button);
    up(button);
    fireEvent.click(button, { detail: 1 });
    expect(onTap.mock.calls).toEqual([['a']]);
    down(board);
    fireEvent.pointerMove(board, { clientX: 10, clientY: 40, pointerType: 'touch' });
    up(board, { clientY: 40 });
    down(board);
    fireEvent.pointerCancel(board, { pointerType: 'touch' });
    up(board);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('a key’s or a reader’s click taps — after a right-click, a cancel, or a mouse gone off the board, too', () => {
    const onTap = vi.fn();
    render(<Board onTap={onTap} />);
    const board = screen.getByTestId('board');
    const button = screen.getByRole('button');
    fireEvent.click(button);
    // A right-click: no click follows, so it mustn't swallow the next.
    down(board, { button: 2, pointerType: 'mouse' });
    fireEvent.click(button);
    // A mouse pressed, gone off the board, released elsewhere: nor that — and coming back, its lift isn't a tap.
    down(board, { pointerType: 'mouse' });
    fireEvent.pointerLeave(board, { pointerType: 'mouse' });
    up(board, { pointerType: 'mouse' });
    fireEvent.click(button);
    // A finger's scroll, cancelled.
    down(board);
    fireEvent.pointerCancel(board, { pointerType: 'touch' });
    fireEvent.click(button);
    // A key after a press: the key's.
    down(board);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button);
    expect(onTap.mock.calls).toEqual([['button'], ['button'], ['button'], ['button'], ['button']]);
  });

  it('off: a press taps nothing, nor one lifted after it turns off', () => {
    const onTap = vi.fn();
    const { rerender } = render(<Board onTap={onTap} off />);
    const board = screen.getByTestId('board');
    down(board);
    up(board);
    rerender(<Board onTap={onTap} />);
    down(board);
    rerender(<Board onTap={onTap} off />);
    up(board);
    expect(onTap).not.toHaveBeenCalled();
  });
});
