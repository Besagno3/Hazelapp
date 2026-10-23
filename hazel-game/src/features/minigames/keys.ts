import { useCallback, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { SETTLE_MS } from './useSettled';

/**
 * The games' keyboard guards, shared (Word Forge's code review round 1: each
 * game had its own copy, and Word Forge had none).
 */

/** A click from a key or a reader, not a pointer: its pointer type where the browser gives one, else no click count. */
export function keyed(e: MouseEvent) {
  const type = (e.nativeEvent as { pointerType?: unknown }).pointerType;
  return typeof type === 'string' ? type === '' : e.detail === 0;
}

/**
 * Enter or Space held down: its repeats press nothing (Index's Timeline's code
 * review round 2: they pressed what focus moved on to; Ember Air Mail's round
 * 1: a held arrow flew five squares).
 */
export function noRepeat(e: KeyboardEvent) {
  if ((e.key === 'Enter' || e.key === ' ') && e.repeat) e.preventDefault();
}

/**
 * Where focus was moved on to (a card's id, or 'check'), and when: a key's
 * press there within `SETTLE_MS` is a double Enter's second (Index's
 * Timeline's code review round 2: it placed two cards, or checked). A
 * pointer's taps aren't held back.
 */
export function useFocusMoved() {
  const moved = useRef<{ to: string; at: number } | null>(null);
  const mark = useCallback((to: string) => {
    moved.current = { to, at: performance.now() };
  }, []);
  const tooSoon = useCallback((to: string, e: MouseEvent) => keyed(e) && moved.current?.to === to && performance.now() - moved.current.at < SETTLE_MS, []);
  return { mark, tooSoon };
}
