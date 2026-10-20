import { describe, it, expect } from 'vitest';
import {
  fromPhysicalKeyboard,
  nudgeText,
  startTyping,
  stepTyping,
  targetAnchors,
  targetCode,
  typingAccuracy,
  typingDone,
  type TypingPress,
} from './typing';

const press = (code: string, key: string, held: string[] = [code], holdRule = true): TypingPress => ({
  code,
  key,
  held: new Set(held),
  holdRule,
});

describe('stepTyping (#165) — the rules of typing a line', () => {
  it('the right key moves on; the last one finishes the line', () => {
    let p = startTyping('fj');
    let r = stepTyping(p, press('KeyF', 'f', ['KeyJ', 'KeyF']));
    expect(r.event).toBe('typed');
    p = r.next;
    expect(p.index).toBe(1);
    expect(targetCode(p)).toBe('KeyJ');
    r = stepTyping(p, press('KeyJ', 'j', ['KeyF', 'KeyJ']));
    expect(r.event).toBe('done');
    expect(typingDone(r.next)).toBe(true);
    expect(r.next.hits).toBe(2);
    // Nothing more happens on a finished line.
    expect(stepTyping(r.next, press('KeyA', 'a')).event).toBe('none');
  });

  it('the home-row hold: the right letter without the other hand on its bump key is a nudge, not a miss', () => {
    const p = startTyping('d');
    const r = stepTyping(p, press('KeyD', 'd'));
    expect(r.event).toBe('hold');
    expect(r.next).toEqual(p);
    expect(targetAnchors(p, true)).toEqual(['KeyJ']);
    // The other hand pressing its bump key down is anchoring, not a wrong letter.
    expect(stepTyping(p, press('KeyJ', 'j')).event).toBe('none');
    // With J held, the letter counts.
    expect(stepTyping(p, press('KeyD', 'd', ['KeyJ', 'KeyD'])).event).toBe('done');
    // A right-hand letter wants F held.
    const k = startTyping('k');
    expect(stepTyping(k, press('KeyK', 'k', ['KeyJ', 'KeyK'])).event).toBe('hold');
    expect(stepTyping(k, press('KeyK', 'k', ['KeyF', 'KeyK'])).event).toBe('done');
  });

  it('a capital wants the OTHER hand\'s Shift; the same hand\'s is a nudge', () => {
    const p = startTyping('E');
    expect(targetAnchors(p, true)).toEqual(['ShiftRight']);
    expect(stepTyping(p, press('KeyE', 'E', ['ShiftLeft', 'KeyE'])).event).toBe('hold');
    expect(stepTyping(p, press('KeyE', 'E', ['ShiftRight', 'KeyE'])).event).toBe('done');
    // Shift itself types nothing.
    expect(stepTyping(p, press('ShiftRight', 'Shift')).event).toBe('none');
  });

  it('the space bar needs no hold', () => {
    const p = startTyping(' ');
    expect(targetAnchors(p, true)).toEqual([]);
    expect(stepTyping(p, press('Space', ' ')).event).toBe('done');
  });

  it('with the hold rule off, either hand will do', () => {
    const p = startTyping('d');
    expect(targetAnchors(p, false)).toEqual([]);
    expect(stepTyping(p, press('KeyD', 'd', ['KeyD'], false)).event).toBe('done');
    // …and the bump keys are ordinary letters again.
    expect(stepTyping(p, press('KeyJ', 'j', ['KeyJ'], false)).event).toBe('wrong');
  });

  it('a wrong character is a miss; modifiers, arrows and function keys are nothing', () => {
    const p = startTyping('f');
    const r = stepTyping(p, press('KeyG', 'g', ['KeyJ', 'KeyG']));
    expect(r.event).toBe('wrong');
    expect(r.next.misses).toBe(1);
    expect(r.next.index).toBe(0);
    for (const [code, key] of [
      ['ShiftLeft', 'Shift'],
      ['ArrowLeft', 'ArrowLeft'],
      ['F5', 'F5'],
      ['Backspace', 'Backspace'],
      ['Enter', 'Enter'],
      ['Tab', 'Tab'],
      ['CapsLock', 'CapsLock'],
    ]) {
      expect(stepTyping(p, press(code, key)).event).toBe('none');
    }
  });

  it('the right letter in the wrong case is a caps nudge, not a miss', () => {
    const lower = startTyping('f');
    const r = stepTyping(lower, press('KeyF', 'F', ['KeyJ', 'KeyF']));
    expect(r.event).toBe('caps');
    expect(r.next.misses).toBe(0);
    expect(nudgeText('caps', [], 'f')).toMatch(/Caps Lock is on/);
    const upper = startTyping('F');
    expect(stepTyping(upper, press('KeyF', 'f', ['KeyJ', 'KeyF'])).event).toBe('caps');
    expect(nudgeText('caps', ['ShiftRight'], 'F')).toMatch(/hold Shift with your other hand/);
  });

  it('accuracy is hits over presses (1 before anything is typed); the nudges have words', () => {
    expect(typingAccuracy({ hits: 0, misses: 0 })).toBe(1);
    expect(typingAccuracy({ hits: 9, misses: 1 })).toBe(0.9);
    expect(nudgeText('hold', ['KeyJ'], 'd')).toMatch(/Hold J with your right pointer/);
    expect(nudgeText('hold', ['KeyF'], 'k')).toMatch(/Hold F with your left pointer/);
    expect(nudgeText('hold', ['ShiftRight'], 'E')).toMatch(/RIGHT Shift/);
    expect(nudgeText('wrong', [], 'd')).toMatch(/glowing key/);
    expect(nudgeText('typed', [], 'd')).toBeNull();
  });

  it('a physical keyboard names its key; a glass one does not', () => {
    expect(fromPhysicalKeyboard({ code: 'KeyA', key: 'a' })).toBe(true);
    expect(fromPhysicalKeyboard({ code: '', key: 'a' })).toBe(false);
    expect(fromPhysicalKeyboard({ code: 'Unidentified', key: 'Unidentified' })).toBe(false);
  });
});

describe('the caps nudge (review round 1)', () => {
  it('says Caps Lock when it is on, and to let go of Shift when it is not', () => {
    expect(nudgeText('caps', [], 'a')).toMatch(/Caps Lock is on/);
    expect(nudgeText('caps', [], 'a', true)).toMatch(/Caps Lock is on/);
    expect(nudgeText('caps', [], 'a', false)).toMatch(/let go of Shift/);
    expect(nudgeText('caps', [], 'A', false)).toMatch(/is a capital/);
  });
});

describe('punctuation up on a key (review round 4)', () => {
  it('the right key with the wrong Shift is a nudge, never a miss; the nudge names the key', () => {
    const p = startTyping('a!');
    const typedA = stepTyping(p, { code: 'KeyA', key: 'a', held: new Set(['KeyA']), holdRule: false }).next;
    const plainOne = stepTyping(typedA, { code: 'Digit1', key: '1', held: new Set(['Digit1']), holdRule: false });
    expect(plainOne.event).toBe('caps');
    expect(plainOne.next.misses).toBe(0);
    expect(nudgeText('caps', [], '!')).toBe('🔠 ! is up on the 1 key: hold Shift with your other hand.');
    expect(nudgeText('caps', [], '1')).toBe('🔡 Just 1 here — let go of Shift.');
    expect(nudgeText('hold', ['ShiftRight'], '(')).toBe('🖐️ Hold the RIGHT Shift with your other hand for (.');
    expect(nudgeText('hold', ['ShiftRight'], 'E')).toBe('🖐️ Hold the RIGHT Shift with your other hand for a capital E.');
    // Another key is still a miss.
    expect(stepTyping(typedA, { code: 'Digit2', key: '2', held: new Set(['Digit2']), holdRule: false }).event).toBe('wrong');
    // And the mark itself types.
    expect(stepTyping(typedA, { code: 'Digit1', key: '!', held: new Set(['Digit1', 'ShiftLeft']), holdRule: false }).event).toBe('done');
  });
});

describe('the wrong-Shift nudge on another layout (review round 5)', () => {
  it('a lit key that typed another character is a miss, not a Shift nudge', () => {
    const p = startTyping('a');
    // AZERTY: the physical A key types "q".
    const azerty = stepTyping(p, { code: 'KeyA', key: 'q', held: new Set(['KeyA']), holdRule: false });
    expect(azerty.event).toBe('wrong');
    expect(azerty.next.misses).toBe(1);
    // QWERTY: the same key with Caps Lock on is the caps nudge, as ever.
    expect(stepTyping(p, { code: 'KeyA', key: 'A', held: new Set(['KeyA']), holdRule: false }).event).toBe('caps');
  });
});

describe('a capital under Caps Lock (review round 6)', () => {
  it('blames Caps Lock before asking for the Shift the kid is already holding', () => {
    expect(nudgeText('caps', ['ShiftRight'], 'E', true)).toMatch(/Caps Lock is on/);
    expect(nudgeText('caps', ['ShiftRight'], 'E', false)).toMatch(/E is a capital/);
  });
});
