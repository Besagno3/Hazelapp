import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useInertOutside } from '../hooks/useInertOutside';
import { cn } from '../lib/utils';

/** The layers up now, oldest first: the last one is on top (the level-up over the Menu). */
const layers: HTMLElement[] = [];

/**
 * The full-screen layer every world overlay sits in (#75 item 14b review): a
 * modal dialog. While it's up the rest of the page is `inert` — Tab, taps and
 * screen readers can't reach the top bar, the HUD or the map behind it — and
 * focus moves into it: to a button that asks for it (`autoFocus`, e.g. a
 * "▼ next"), else to the layer itself, so a stray Enter never buys, answers
 * or picks anything. A new `focusKey` (the overlay's next step) pulls focus
 * back in if it was lost with a button that went away — and so does a button
 * going away or turning off under focus (Rest, a price you can't pay now,
 * ✨ Learn, a Library answer, #110o r1). When the layer closes, focus goes back
 * to where it was (📜 Menu, say). Escape does what the overlay's own way out
 * does (`onEscape` — its close, Back or Later, #128, #110o), wherever focus is
 * while this is the top layer; an overlay with nothing to cancel (a question,
 * a story beat) passes none, and Escape does nothing. Closed by Escape, the
 * keys are the world's again: focus isn't put back on 📜 Menu, whose next
 * Space (the world's talk key) would open it again — only on a layer below.
 */
export default function ModalLayer({
  label,
  className,
  focusKey,
  describedBy,
  onKeyDown,
  onEscape,
  children,
}: {
  label: string;
  /** The overlay's own `fixed inset-0 …` classes. */
  className: string;
  focusKey?: string | number;
  /** The id of what a screen reader reads on opening (a dialogue's first line). */
  describedBy?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** What Escape does: exactly the overlay's own close / Back / Later — leave it out where there's none. */
  onEscape?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useInertOutside(ref);
  // What had focus before the layer opened (read before any autoFocus inside).
  const [before] = useState(() => (typeof document === 'undefined' ? null : document.activeElement));
  // The way out Escape takes now, for the listener on the page; and whether
  // the last thing done here was an Escape (any other key or a tap clears it).
  const escapeRef = useRef(onEscape);
  useEffect(() => {
    escapeRef.current = onEscape;
  }, [onEscape]);
  const escaped = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, [focusKey]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    layers.push(el);
    const onTop = () => layers[layers.length - 1] === el && !el.closest('[inert]');
    // Focus fell out to nothing — its button went away or turned off: the top
    // layer still hears the key (Escape, above all), and takes focus back.
    const onPageKey = (e: globalThis.KeyboardEvent) => {
      if ((e.target !== document.body && e.target !== document.documentElement) || !onTop()) return;
      el.focus({ preventScroll: true });
      if (e.key !== 'Escape') {
        escaped.current = false;
        return;
      }
      const out = escapeRef.current;
      if (!out || e.defaultPrevented || e.repeat) return;
      e.preventDefault();
      escaped.current = true;
      out();
    };
    // …and doesn't wait for a key: a screen reader isn't left on the page behind.
    const watch = new MutationObserver(() => {
      const now = document.activeElement;
      const lost = !now || now === document.body || (now !== el && el.contains(now) && now.matches(':disabled'));
      if (lost && onTop()) el.focus({ preventScroll: true });
    });
    watch.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] });
    document.addEventListener('keydown', onPageKey);
    return () => {
      document.removeEventListener('keydown', onPageKey);
      watch.disconnect();
      layers.splice(layers.indexOf(el), 1);
    };
  }, []);
  useEffect(
    () => () => {
      if (!(before instanceof HTMLElement) || !before.isConnected || before === document.body) return;
      // Closed by Escape: the world gets the keys, unless that was in a layer below.
      if (escaped.current && !before.closest('[role="dialog"]')) return;
      before.focus({ preventScroll: true });
    },
    [before],
  );
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      aria-describedby={describedBy}
      tabIndex={-1}
      onPointerDown={() => {
        escaped.current = false;
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.key !== 'Escape') escaped.current = false;
        // A held Escape closes one layer, not the one behind it too; a panel
        // inside that handles Escape itself ("Leave the Spire?") stops it first.
        if (e.key !== 'Escape' || !onEscape || e.defaultPrevented || e.repeat) return;
        e.preventDefault();
        e.stopPropagation();
        escaped.current = true;
        onEscape();
      }}
      className={cn(className, 'outline-none')}
    >
      {children}
    </div>
  );
}
