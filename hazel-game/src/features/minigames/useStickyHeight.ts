import { useLayoutEffect, useRef, useState } from 'react';

/**
 * An element's height while it sticks (position: sticky) — kept up to date;
 * null when it doesn't stick, and where it can't be measured, as in tests. A
 * game gives it to the scroller as `scrollPaddingTop`, so what's scrolled into
 * view stops below it (Clocktower Gears' board on a phone; Mirror Mural's host
 * on a tall screen).
 */
export function useStickyHeight<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);
  const [h, setH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setH(getComputedStyle(el).position === 'sticky' ? Math.round(el.getBoundingClientRect().height) : null));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, h] as const;
}
