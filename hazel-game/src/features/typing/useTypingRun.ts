import { useCallback, useEffect, useRef, useState } from 'react';
import { sfx } from '../../lib/audio';
import {
  fromPhysicalKeyboard,
  startTyping,
  stepTyping,
  targetAnchors,
  targetCode,
  type TypingEvent,
  type TypingProgress,
} from '../../lib/typing';
import { useKeyboardStore } from '../../store/keyboardStore';

/**
 * Types one line against the real keyboard (#159): listens on `window` while
 * `active`, keeps the set of keys held down (for the home-row hold), and
 * steps `lib/typing`'s rules on every press. Space and the characters are
 * `preventDefault`ed so the page never scrolls or opens a find bar; Tab and
 * the browser's own shortcuts are left alone. One run is one line: mount a
 * fresh one (key the component by the line) for the next.
 */
export function useTypingRun({
  text,
  holdRule,
  active = true,
  onEvent,
  onDone,
}: {
  text: string;
  holdRule: boolean;
  active?: boolean;
  /** Every press that did something, as it happens (sounds and sparks). */
  onEvent?: (event: TypingEvent, progress: TypingProgress) => void;
  /** The line is finished. */
  onDone?: (progress: TypingProgress) => void;
}) {
  const [progress, setProgress] = useState<TypingProgress>(() => startTyping(text));
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set());
  const [last, setLast] = useState<{ event: TypingEvent; code: string; seq: number } | null>(null);
  const heldRef = useRef<Set<string>>(new Set());
  // The listeners read the latest progress and callbacks through refs, kept
  // current in an effect (never written during render).
  const progressRef = useRef(progress);
  const seq = useRef(0);
  const cb = useRef({ onEvent, onDone });
  useEffect(() => {
    cb.current = { onEvent, onDone };
  });

  const release = useCallback(() => {
    heldRef.current = new Set();
    setHeld(heldRef.current);
  }, []);

  useEffect(() => {
    if (!active) return;
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!fromPhysicalKeyboard(e)) return;
      useKeyboardStore.getState().seen();
      if (!e.repeat) {
        heldRef.current = new Set(heldRef.current).add(e.code);
        setHeld(heldRef.current);
      }
      // Space scrolls the page, "/" and "'" open a find bar in some browsers.
      if (e.key === ' ' || [...e.key].length === 1) e.preventDefault();
      // A held key repeating is one press (the anchor key, mostly).
      if (e.repeat) return;
      const { next, event } = stepTyping(progressRef.current, {
        code: e.code,
        key: e.key,
        held: heldRef.current,
        holdRule,
      });
      if (event === 'none') return;
      progressRef.current = next;
      setProgress(next);
      setLast({ event, code: e.code, seq: ++seq.current });
      if (event === 'typed' || event === 'done') sfx('select');
      cb.current.onEvent?.(event, next);
      if (event === 'done') cb.current.onDone?.(next);
    };
    const up = (e: KeyboardEvent) => {
      if (!heldRef.current.has(e.code)) return;
      const s = new Set(heldRef.current);
      s.delete(e.code);
      heldRef.current = s;
      setHeld(s);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    // The window losing focus loses every keyup with it.
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
    };
  }, [active, holdRule, release]);

  return {
    progress,
    held,
    /** The last press that did something (a new `seq` each time, so a repeat of the same event still animates). */
    last,
    target: targetCode(progress),
    anchors: targetAnchors(progress, holdRule),
  };
}
