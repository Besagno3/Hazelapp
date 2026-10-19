import { describe, it, expect } from 'vitest';
import { describe as describeKey, keyHint, keyName, spellLine, wrongKey } from './hints';

describe('typing hints (#159 review round 3)', () => {
  it('names keys as they are said: letters, punctuation, the space bar, the Shifts', () => {
    expect(keyName('KeyJ')).toBe('J');
    expect(keyName('Comma')).toBe('comma');
    expect(keyName('Semicolon')).toBe('semicolon');
    expect(keyName('Space')).toBe('space');
    expect(keyName('ShiftRight')).toBe('right Shift');
    expect(keyName('Nope')).toBe('Nope');
    expect(describeKey('KeyF')).toBe('the F key');
    expect(describeKey('Space')).toBe('the space bar');
    expect(describeKey('ShiftLeft')).toBe('the left Shift');
    expect(describeKey('Period')).toBe('the full stop key');
    expect(keyHint('KeyF', [])).toMatch(/the F key/);
    expect(keyHint('KeyF', ['KeyJ'])).toMatch(/J/);
  });

  it('spells drill lines for a screen reader, and leaves words alone', () => {
    expect(spellLine('fff jjj')).toBe('F F F, J J J');
    expect(spellLine('fjf jfj fjf')).toBe('F J F, J F J, F J F');
    expect(spellLine('ei ie ei ie')).toBe('E I, I E, E I, I E');
    expect(spellLine('a; a; ;a ;a')).toBe('A semicolon, A semicolon, semicolon A, semicolon A');
    expect(spellLine('sad lad dad')).toBe('sad, lad, dad');
    expect(spellLine('a kid is skilled')).toBe('a, kid, is, skilled');
    expect(spellLine('to too lot')).toBe('to, too, lot');
  });

  it('the key to flash: the wrong key, or Caps Lock when a small letter came out big', () => {
    expect(wrongKey(null)).toBeNull();
    expect(wrongKey({ event: 'wrong', code: 'KeyG', capsLock: false })).toBe('KeyG');
    expect(wrongKey({ event: 'caps', code: 'KeyF', capsLock: true })).toBe('CapsLock');
    expect(wrongKey({ event: 'typed', code: 'KeyF', capsLock: false })).toBeNull();
  });
});
