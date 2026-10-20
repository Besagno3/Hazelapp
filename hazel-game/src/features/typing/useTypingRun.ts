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
import { keysDown, useKeyboardStore } from '../../store/keyboardStore';

/**
 * A focused button, link or field owns its own keys (the world's rule,
 * `ownsKeys` in lib/interact.ts, less the dialog itself — a modal layer holds
 * focus when nothing in it does). A typing run leaves Space to it unless the
 * line wants a space next; Enter is never taken.
 */
export function onControl(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el || typeof el.closest !== 'function') return false;
  return el.closest('button, a[href], input, textarea, select, summary, [role="button"]') !== null;
}

/** A text field or an editable area owns every key (review round 2): a run never types over it. */
export function inField(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el || typeof el.closest !== 'function') return false;
  return el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}

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
  const [last, setLast] = useState<{ event: TypingEvent; code: string; seq: number; capsLock: boolean } | null>(null);
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
    // Keys already down as the run starts count as held (round 6: an anchor kept down through a line's
    // beat) — read here, the instant the listeners attach (round 7: read at render, a key let go in
    // between stayed held).
    heldRef.current = new Set(keysDown());
    setHeld(heldRef.current);
    // A Space the line took off a focused button: its keyup is taken too (Firefox clicks
    // a button on Space's keyup even after a prevented keydown — review round 2).
    let spaceTaken = false;
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!fromPhysicalKeyboard(e)) return;
      if (!useKeyboardStore.getState().present) useKeyboardStore.getState().seen();
      if (inField(e.target)) return;
      // A repeat of a key this run never saw go down is a press-down too (round 6).
      if (!e.repeat || !heldRef.current.has(e.code)) {
        heldRef.current = new Set(heldRef.current).add(e.code);
        setHeld(heldRef.current);
      }
      // Space scrolls the page, "/" and "'" open a find bar in some browsers —
      // but Space on a focused button is the button's (review round 1), unless
      // the line wants a space right now.
      if (e.key === ' ') {
        if (onControl(e.target) && progressRef.current.text[progressRef.current.index] !== ' ') return;
        e.preventDefault();
        spaceTaken = onControl(e.target);
      } else if ([...e.key].length === 1) e.preventDefault();
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
      // Caps Lock only matters to a letter (round 5: a digit pressed for "!" flashed the Caps key).
      setLast({ event, code: e.code, seq: ++seq.current, capsLock: /[a-z]/i.test(e.key) && e.getModifierState?.('CapsLock') === true });
      // The last key's sound is the caller's (a lesson chimes, the arena strikes — review round 4: three sounds on one key).
      if (event === 'typed') sfx('select');
      cb.current.onEvent?.(event, next);
      if (event === 'done') cb.current.onDone?.(next);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ' && spaceTaken) {
        spaceTaken = false;
        e.preventDefault();
      }
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
      // A key still down as the run ends would stay "held" on the dimmed keyboard (review round 3).
      release();
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
