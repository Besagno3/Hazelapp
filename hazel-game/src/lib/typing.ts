import { anchorsFor, charKey, keyName } from '../content/typing';

/**
 * The rules of typing a line (#159), pure and table-tested: what a key press
 * does to the kid's place in the text. The screens (`features/typing/`) only
 * listen to the keyboard and draw.
 */
export interface TypingProgress {
  text: string;
  /** How far along the text the kid is (the next character to type). */
  index: number;
  /** Characters typed right. */
  hits: number;
  /** Wrong characters typed (a hold or caps nudge is not one). */
  misses: number;
}

export type TypingEvent =
  /** The right key: the place moves on. */
  | 'typed'
  /** The right key, and it was the last one. */
  | 'done'
  /** A wrong character. */
  | 'wrong'
  /** The right key, but the other hand's key wasn't held (the home-row hold). */
  | 'hold'
  /** The right letter in the wrong case: Caps Lock is on, or Shift is needed. */
  | 'caps'
  /** Nothing to do: a modifier, an anchor key being held, a key that types nothing. */
  | 'none';

export interface TypingPress {
  /** `KeyboardEvent.code`: the physical key. */
  code: string;
  /** `KeyboardEvent.key`: what it typed. */
  key: string;
  /** Every key currently held down (codes), this one included. */
  held: ReadonlySet<string>;
  /** Whether the home-row hold is on (📜 Menu → ⌨️ Typing). */
  holdRule: boolean;
}

/** Keys that never count as typing a character. */
export const IGNORED_CODES: ReadonlySet<string> = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'CapsLock',
  'Tab',
  'Enter',
  'NumpadEnter',
  'Backspace',
  'Escape',
  'ContextMenu',
  'Fn',
]);

export function startTyping(text: string): TypingProgress {
  return { text, index: 0, hits: 0, misses: 0 };
}

/** The character the kid should type next ('' once the line is done). */
export function targetChar(p: TypingProgress): string {
  return p.text[p.index] ?? '';
}

/** The physical key for the next character (null when done or off the map). */
export function targetCode(p: TypingProgress): string | null {
  const ch = targetChar(p);
  return ch ? (charKey(ch)?.key.code ?? null) : null;
}

/** The keys the other hand must hold for the next character ([] when none is needed). */
export function targetAnchors(p: TypingProgress, holdRule: boolean): string[] {
  const ch = targetChar(p);
  return holdRule && ch ? anchorsFor(ch) : [];
}

/**
 * One key press against the line. A wrong character counts as a miss and the
 * place stays; a missing hold, or the right letter in the wrong case, is a
 * nudge — not a miss, and the place stays too (effort is never punished, but
 * the hold is the whole point of the safeguard). Modifiers, the anchor keys
 * being held and keys that type nothing do nothing.
 */
export function stepTyping(p: TypingProgress, press: TypingPress): { next: TypingProgress; event: TypingEvent } {
  const target = targetChar(p);
  if (!target || IGNORED_CODES.has(press.code)) return { next: p, event: 'none' };
  const anchors = press.holdRule ? anchorsFor(target) : [];
  // The other hand pressing its bump key down is anchoring, not typing.
  if (anchors.includes(press.code)) return { next: p, event: 'none' };
  if (press.key === target) {
    if (anchors.length > 0 && !anchors.some((a) => press.held.has(a))) return { next: p, event: 'hold' };
    const next = { ...p, index: p.index + 1, hits: p.hits + 1 };
    return { next, event: next.index >= p.text.length ? 'done' : 'typed' };
  }
  // Only a character counts as a wrong try (arrows, F-keys and the like don't).
  if ([...press.key].length !== 1) return { next: p, event: 'none' };
  // The right letter, the wrong case: Caps Lock, or a capital without Shift.
  if (press.key.toLowerCase() === target.toLowerCase() && press.key !== target) return { next: p, event: 'caps' };
  // The right key, the wrong Shift ("1" for "!", "/" for "?") — the key the picture lit, so a nudge, never a miss
  // (review round 4). Only when the key really typed one of that key's two characters (round 5: on another layout
  // the lit key types something else, and the nudge would have blamed Shift).
  const lit = charKey(target)?.key;
  if (lit && lit.code === press.code && lit.chars.includes(press.key)) return { next: p, event: 'caps' };
  return { next: { ...p, misses: p.misses + 1 }, event: 'wrong' };
}

export function typingDone(p: TypingProgress): boolean {
  return p.index >= p.text.length;
}

/** Right presses over all presses (1 before anything is typed). */
export function typingAccuracy(p: Pick<TypingProgress, 'hits' | 'misses'>): number {
  const total = p.hits + p.misses;
  return total === 0 ? 1 : p.hits / total;
}

/** What to say for a nudge, in a kid's words. */
export function nudgeText(event: TypingEvent, anchors: string[], target: string, capsLock = true): string | null {
  if (event === 'hold') {
    const a = anchors[0];
    if (a === 'ShiftLeft' || a === 'ShiftRight') {
      return `🖐️ Hold the ${a === 'ShiftLeft' ? 'LEFT' : 'RIGHT'} Shift with your other hand for ${/[a-z]/i.test(target) ? `a capital ${target}` : target}.`;
    }
    return `🖐️ Other hand home! Hold ${a === 'KeyF' ? 'F' : 'J'} with your ${a === 'KeyF' ? 'left' : 'right'} pointer while you type.`;
  }
  if (event === 'caps') {
    const letter = /[a-z]/i.test(target);
    if (letter && target !== target.toLowerCase()) return `🔠 ${target} is a capital: hold Shift with your other hand.`;
    if (!letter) {
      // Punctuation up on a key (review round 4): "!" wants Shift on the 1 key; "1" typed as "!" wants it let go.
      const want = charKey(target);
      if (want?.shift) return `🔠 ${target} is up on the ${keyName(want.key.code)} key: hold Shift with your other hand.`;
      return `🔡 Just ${target} here — let go of Shift.`;
    }
    // A small letter came out big: Caps Lock, or a Shift held by habit (`capsLock` tells them apart when known).
    return capsLock ? '🔠 Caps Lock is on! Turn it off and try again.' : `🔡 Just a small ${target} here — let go of Shift.`;
  }
  if (event === 'wrong') return '💫 Not that one. Look at the glowing key!';
  return null;
}

/**
 * A key event from a real keyboard: it names a physical key. Touch keyboards
 * on phones and tablets send none (or "Unidentified").
 */
export function fromPhysicalKeyboard(e: Pick<KeyboardEvent, 'code' | 'key'>): boolean {
  return typeof e.code === 'string' && e.code !== '' && e.code !== 'Unidentified' && e.key !== 'Unidentified';
}
