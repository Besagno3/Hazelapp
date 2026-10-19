import { KEY_BY_CODE, charKey, type Finger } from '../../content/typing';

/**
 * Words for keys and fingers (#159), shared by the diagram, the lines and the
 * bursts — for a screen reader, which can't watch a key glow (review round 1).
 */

/** Finger names as the lessons say them. */
export const FINGER_WORDS: Record<Finger, string> = { pinky: 'little finger', ring: 'ring finger', middle: 'middle finger', index: 'pointer', thumb: 'thumb' };

/** Keys whose label a screen reader would skip at its usual punctuation level (review round 2). */
const KEY_NAMES: Record<string, string> = {
  Space: 'space',
  ShiftLeft: 'left Shift',
  ShiftRight: 'right Shift',
  CapsLock: 'Caps Lock',
  Semicolon: 'semicolon',
  Comma: 'comma',
  Period: 'full stop',
  Quote: 'apostrophe',
  Slash: 'slash',
  Minus: 'dash',
  Equal: 'equals',
  Backquote: 'backtick',
  BracketLeft: 'left bracket',
  BracketRight: 'right bracket',
  Backslash: 'backslash',
};

/** A key's short name, as said aloud: "J", "comma", "space", "left Shift". */
export function keyName(code: string): string {
  const key = KEY_BY_CODE[code];
  if (!key) return code;
  return KEY_NAMES[code] ?? key.label;
}

/** Two-letter words a drill line may hold; anything else that short is spelled. */
const SHORT_WORDS = new Set(['a', 'i', 'to', 'is', 'as', 'at', 'an', 'in', 'it', 'on', 'of', 'or', 'us', 'up', 'do', 'go', 'no', 'so', 'be', 'we', 'he', 'me', 'my', 'by', 'if', 'am', 'oh', 'ok']);

/** A drill token ("fjf", "ddd", "ei", "a;") is spelled; a word is said as it is. */
function isDrill(token: string): boolean {
  const letters = token.toLowerCase();
  if (SHORT_WORDS.has(letters)) return false;
  if (!/[aeiouy]/.test(letters)) return true;
  if (/^(.)\1+$/.test(letters)) return true;
  return letters.length <= 2;
}

/**
 * A line as a screen reader should say it (review round 3): "fff jjj" is
 * "F F F, J J J", not a pseudo-word; "sad lad dad" stays as it is.
 */
export function spellLine(text: string): string {
  return text
    .split(' ')
    .map((token) => {
      if (!token) return '';
      if (!isDrill(token)) return token;
      return [...token]
        .map((ch) => {
          const key = charKey(ch);
          return key ? keyName(key.key.code) : ch;
        })
        .join(' ');
    })
    .join(', ');
}

/** "the F key", "the space bar", "the right Shift", "the comma key". */
export function describe(code: string): string {
  const key = KEY_BY_CODE[code];
  if (!key) return code;
  if (code === 'Space') return 'the space bar';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return `the ${keyName(code)}`;
  return `the ${keyName(code)} key`;
}

/**
 * The next key in words: "Press the J key with your right pointer, holding
 * the F key with your other hand." Empty when there is none.
 */
export function keyHint(target: string | null, anchors: readonly string[] = []): string {
  const key = target ? KEY_BY_CODE[target] : undefined;
  if (!key) return '';
  const hold = anchors.map((a) => KEY_BY_CODE[a]).filter(Boolean);
  return `Press ${describe(key.code)} with your ${key.hand} ${FINGER_WORDS[key.finger]}${
    hold.length ? `, holding ${hold.map((a) => describe(a.code)).join(' or ')} with your other hand` : ''
  }.`;
}

/** The key to flash red after a press: the wrong key, or Caps Lock when it's what made a small letter big. */
export function wrongKey(last: { event: string; code: string; capsLock: boolean } | null): string | null {
  if (!last) return null;
  if (last.event === 'wrong') return last.code;
  if (last.event === 'caps' && last.capsLock) return 'CapsLock';
  return null;
}
