import { useEffect, type RefObject } from 'react';

/**
 * Elements this hook has made inert, with how many holders still want them
 * so. Two layers can be up at once (a story over an overlay, the level-up
 * over the menu) and either may close first — the page stays inert until the
 * last one goes (#75 item 14b review).
 */
const holds = new Map<Element, number>();

/**
 * While the element is on screen, everything else on the page is `inert`: Tab,
 * taps and screen readers can't reach the HUD or the world behind a story
 * panel, an overlay or the dark of the wake-up. Walks up from the element
 * marking each ancestor's other children; on unmount it lets go of its marks,
 * and a mark is cleared once nobody holds it. `inert` set by anyone else is
 * never touched.
 */
export function useInertOutside(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const held: Element[] = [];
    for (let node = ref.current; node && node !== document.body; node = node.parentElement) {
      for (const other of Array.from(node.parentElement?.children ?? [])) {
        if (other === node) continue;
        const n = holds.get(other);
        if (n !== undefined) holds.set(other, n + 1);
        else if (other.hasAttribute('inert')) continue;
        else {
          other.setAttribute('inert', '');
          holds.set(other, 1);
        }
        held.push(other);
      }
    }
    return () => {
      for (const el of held) {
        const n = (holds.get(el) ?? 1) - 1;
        if (n > 0) holds.set(el, n);
        else {
          holds.delete(el);
          el.removeAttribute('inert');
        }
      }
    };
  }, [ref]);
}
