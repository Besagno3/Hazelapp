import { useEffect, type RefObject } from 'react';

/**
 * While the element is on screen, everything else on the page is `inert`: Tab,
 * taps and screen readers can't reach the HUD or the world behind a story
 * panel or the dark of the wake-up. Walks up from the element marking each
 * ancestor's other children, and on unmount clears only the marks it made.
 */
export function useInertOutside(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const made: Element[] = [];
    for (let node = ref.current; node && node !== document.body; node = node.parentElement) {
      for (const other of Array.from(node.parentElement?.children ?? [])) {
        if (other === node || other.hasAttribute('inert')) continue;
        other.setAttribute('inert', '');
        made.push(other);
      }
    }
    return () => made.forEach((el) => el.removeAttribute('inert'));
  }, [ref]);
}
