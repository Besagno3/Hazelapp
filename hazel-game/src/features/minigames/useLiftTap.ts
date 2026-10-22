import { useRef, type PointerEvent } from 'react';

/** How far a press may move (px) and still be a tap, not the page scrolling. */
export const SWIPE_PX = 10;

/**
 * A board's taps, acting as the finger lifts (Star Charts' review round 1, made
 * shared in Ringwood's Rings' review round 1): `at` reads what a press is on
 * (null: nothing); `onTap` gets it on the lift — a press that moves `SWIPE_PX`
 * (the page scrolling) or is cancelled taps nothing. Spread `handlers` on the
 * board. A board's own buttons (for the keyboard and a reader) ask
 * `pointerClick()` in their click: true when the click is a pointer's, already
 * tapped on the lift; false for a keyboard's or a reader's (which can come with
 * a click count, so `detail` can't tell).
 */
export function useLiftTap<T, E extends Element = HTMLElement>(at: (e: PointerEvent<E>) => T | null, onTap: (t: T) => void, off = false) {
  const press = useRef<{ t: T | null; pointer: number; x: number; y: number } | null>(null);
  const fromPointer = useRef(false);
  const handlers = {
    onPointerDown: (e: PointerEvent<E>) => {
      press.current = null;
      fromPointer.current = true;
      if (off || e.button !== 0) return;
      press.current = { t: at(e), pointer: e.pointerId, x: e.clientX, y: e.clientY };
    },
    onPointerMove: (e: PointerEvent<E>) => {
      const p = press.current;
      if (p && p.pointer === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SWIPE_PX) press.current = null;
    },
    // The page scrolling: no click follows.
    onPointerCancel: () => {
      press.current = null;
      fromPointer.current = false;
    },
    onPointerUp: (e: PointerEvent<E>) => {
      const p = press.current;
      press.current = null;
      if (!p || p.pointer !== e.pointerId || off || p.t === null) return;
      onTap(p.t);
    },
    // After a button's own click (which bubbles here), or a press with no button under it.
    onClick: () => {
      fromPointer.current = false;
    },
    onKeyDown: () => {
      fromPointer.current = false;
    },
  };
  return {
    handlers,
    pointerClick: () => fromPointer.current,
  };
}
