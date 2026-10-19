import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useInertOutside } from '../hooks/useInertOutside';
import { cn } from '../lib/utils';

/**
 * The full-screen layer every world overlay sits in (#75 item 14b review): a
 * modal dialog. While it's up the rest of the page is `inert` — Tab, taps and
 * screen readers can't reach the top bar, the HUD or the map behind it — and
 * focus moves into it: to a button that asks for it (`autoFocus`, e.g. a
 * "▼ next"), else to the layer itself, so a stray Enter never buys, answers
 * or picks anything. A new `focusKey` (the overlay's next step) pulls focus
 * back in if it was lost with a button that went away. When the layer closes,
 * focus goes back to where it was (📜 Menu, say). Escape does what the
 * overlay's own way out does (`onEscape` — its close, Back or Later, #128,
 * #110o); an overlay with nothing to cancel (a question, a story beat) passes
 * none, and Escape does nothing.
 */
export default function ModalLayer({
  label,
  className,
  focusKey,
  onKeyDown,
  onEscape,
  children,
}: {
  label: string;
  /** The overlay's own `fixed inset-0 …` classes. */
  className: string;
  focusKey?: string | number;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** What Escape does: exactly the overlay's own close / Back / Later — leave it out where there's none. */
  onEscape?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useInertOutside(ref);
  // What had focus before the layer opened (read before any autoFocus inside).
  const [before] = useState(() => (typeof document === 'undefined' ? null : document.activeElement));
  useEffect(() => {
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, [focusKey]);
  useEffect(
    () => () => {
      if (before instanceof HTMLElement && before.isConnected && before !== document.body) {
        before.focus({ preventScroll: true });
      }
    },
    [before],
  );
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        // A held Escape closes one layer, not the one behind it too; a panel
        // inside that handles Escape itself ("Leave the Spire?") stops it first.
        if (e.key !== 'Escape' || !onEscape || e.defaultPrevented || e.repeat) return;
        e.preventDefault();
        e.stopPropagation();
        onEscape();
      }}
      className={cn(className, 'outline-none')}
    >
      {children}
    </div>
  );
}
