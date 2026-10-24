import { useLayoutEffect, useRef, useState } from 'react';

/**
 * The width that fits a game's board in its space from `sm` up: as wide as
 * the space, or as the space's height allows at the board's shape (`ratio`,
 * width over height) once `reserve` px are kept for what sits with it (its
 * heading, labels, buttons) — whichever is less. On a phone the page scrolls
 * and the space is as tall as the board itself (fitting to it would shrink it
 * for ever): null, so the board takes the space's width. Null too where it
 * can't be measured, as in tests.
 */
export function useFitWidth(ratio: number, reserve: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const fit = () => {
      if (!window.matchMedia?.('(min-width: 640px)').matches) return setWidth(null);
      const { width: w, height: h } = el.getBoundingClientRect();
      setWidth(h > reserve ? Math.floor(Math.min(w, (h - reserve) * ratio)) : null);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, [ratio, reserve]);
  return [ref, width] as const;
}
