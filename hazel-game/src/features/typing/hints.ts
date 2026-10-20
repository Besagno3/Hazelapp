import { KEY_BY_CODE, charKey, keyName, type Finger } from '../../content/typing';

/**
 * Words for keys and fingers (#165), shared by the diagram, the lines and the
 * bursts — for a screen reader, which can't watch a key glow (review round 1).
 */

/** Finger names as the lessons say them. */
export const FINGER_WORDS: Record<Finger, string> = { pinky: 'little finger', ring: 'ring finger', middle: 'middle finger', index: 'pointer', thumb: 'thumb' };


export { keyName } from '../../content/typing';

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
  const spell = (s: string) =>
    [...s]
      .map((ch) => {
        const key = charKey(ch);
        return key ? keyName(key.key.code) : ch;
      })
      .join(' ');
  // A word stays a word; a drill is spelled, set off by commas; a word's trailing mark is named ("fall semicolon" — review round 4).
  const parts = text
    .split(' ')
    .filter(Boolean)
    .map((token) => {
      const m = token.match(/^([a-z]+)([^a-z]+)$/i);
      if (m && m[1].length > 1 && !isDrill(m[1])) return { text: `${m[1]} ${spell(m[2])}`, drill: false };
      return isDrill(token) ? { text: spell(token), drill: true } : { text: token, drill: false };
    });
  let out = '';
  parts.forEach((part, i) => {
    if (i > 0) out += !part.drill && !parts[i - 1].drill ? ' ' : ', ';
    out += part.text;
  });
  return out;
}

/** A short window (800×600, a small laptop): the keyboard goes without its hands so a line and its buttons stay in view. */
export function shortWindow(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(max-height: 700px)').matches === true;
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
export function keyHint(target: string | null, anchors: readonly string[] = [], char?: string | null): string {
  const key = target ? KEY_BY_CODE[target] : undefined;
  if (!key) return '';
  const hold = anchors.map((a) => KEY_BY_CODE[a]).filter(Boolean);
  // Shift is said when it's wanted and no held Shift already says so (review rounds 4–5): a mark up on its key
  // ("Shift and the 1 key (!)"), or a capital with the hold off ("Shift and the E key").
  const shiftHeld = anchors.some((a) => a === 'ShiftLeft' || a === 'ShiftRight');
  const shifted = !!char && !shiftHeld && charKey(char)?.shift === true;
  const letter = !!char && /[a-z]/i.test(char);
  const otherShift = key.hand === 'left' ? 'the right Shift' : 'the left Shift';
  // The mark is named either way (round 6: under the hold "(!)" had gone with the Shift clause).
  const mark = char && !letter && charKey(char)?.shift ? ` (${char})` : '';
  const finger = key.finger === 'thumb' ? 'a thumb' : `your ${key.hand} ${FINGER_WORDS[key.finger]}`;
  return `Press ${shifted ? `${otherShift} and ${describe(key.code)}${mark}` : `${describe(key.code)}${mark}`} with ${finger}${
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
