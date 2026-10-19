import { describe, it, expect } from 'vitest';
import {
  KEYBOARD_ROWS,
  KEY_BY_CODE,
  NAME_RACE_CHANCE,
  TYPING_BONUS_CHANCE,
  TYPING_LESSONS,
  anchorsFor,
  burstWord,
  charKey,
  enemyWord,
  fingerFor,
  keysTaughtBy,
  nameRaceDue,
  rollTypingBonus,
  typingLessonFlag,
  typingLessonOpen,
  typingLessonsCleared,
  typingStars,
  typingUnlocked,
} from './typing';

describe('the keyboard map (#159)', () => {
  it('every letter, digit and the punctuation the lessons use has a key, a hand and a finger', () => {
    for (const ch of 'abcdefghijklmnopqrstuvwxyz0123456789,.;') {
      const found = charKey(ch);
      expect(found, ch).not.toBeNull();
      expect(found!.shift).toBe(false);
      expect(fingerFor(ch)).toEqual({ hand: found!.key.hand, finger: found!.key.finger });
    }
    // Capitals are the same key with Shift.
    expect(charKey('E')).toMatchObject({ shift: true, key: { code: 'KeyE' } });
    expect(charKey('é')).toBeNull();
  });

  it('is the standard touch-typing map', () => {
    const at = (code: string) => [KEY_BY_CODE[code].hand, KEY_BY_CODE[code].finger];
    expect(at('KeyF')).toEqual(['left', 'index']);
    expect(at('KeyJ')).toEqual(['right', 'index']);
    expect(at('KeyA')).toEqual(['left', 'pinky']);
    expect(at('Semicolon')).toEqual(['right', 'pinky']);
    expect(at('KeyD')).toEqual(['left', 'middle']);
    expect(at('KeyK')).toEqual(['right', 'middle']);
    expect(at('KeyS')).toEqual(['left', 'ring']);
    expect(at('KeyL')).toEqual(['right', 'ring']);
    expect(at('KeyT')).toEqual(['left', 'index']);
    expect(at('KeyY')).toEqual(['right', 'index']);
    expect(at('KeyP')).toEqual(['right', 'pinky']);
    expect(at('KeyQ')).toEqual(['left', 'pinky']);
    expect(KEY_BY_CODE.Space.finger).toBe('thumb');
    // Every code once, the home row's letters in order.
    const codes = KEYBOARD_ROWS.flat().map((k) => k.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(KEYBOARD_ROWS[2].map((k) => k.label).join('')).toContain('ASDFGHJKL;');
  });

  it("the hold: the other hand's bump key for a letter, its Shift for a capital, nothing for a space", () => {
    for (const ch of 'qwertasdfgzxcvb') expect(anchorsFor(ch), ch).toEqual(['KeyJ']);
    for (const ch of 'yuiophjkl;nm,.') expect(anchorsFor(ch), ch).toEqual(['KeyF']);
    expect(anchorsFor('E')).toEqual(['ShiftRight']);
    expect(anchorsFor('M')).toEqual(['ShiftLeft']);
    expect(anchorsFor('J')).toEqual(['ShiftLeft']);
    expect(anchorsFor(' ')).toEqual([]);
    expect(anchorsFor('é')).toEqual([]);
  });
});

describe('the lessons (#159)', () => {
  it('start on the bump keys, have unique ids and lines a kid can read', () => {
    expect(TYPING_LESSONS[0].keys).toEqual(expect.arrayContaining(['KeyF', 'KeyJ']));
    const ids = TYPING_LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const lesson of TYPING_LESSONS) {
      expect(lesson.lines.length).toBeGreaterThanOrEqual(3);
      for (const line of lesson.lines) {
        expect(line.length, `${lesson.id}: "${line}"`).toBeGreaterThan(0);
        expect(line.length, `${lesson.id}: "${line}"`).toBeLessThanOrEqual(40);
        expect(line, `${lesson.id}: "${line}"`).toBe(line.trim());
      }
    }
  });

  it('every drill uses only keys taught by then (a capital needs the Shift lesson)', () => {
    for (const lesson of TYPING_LESSONS) {
      const taught = keysTaughtBy(lesson.id);
      for (const line of lesson.lines) {
        for (const ch of line) {
          const found = charKey(ch);
          expect(found, `${lesson.id}: "${ch}" in "${line}" is on no key`).not.toBeNull();
          expect(taught.has(found!.key.code), `${lesson.id}: "${ch}" in "${line}" isn't taught yet`).toBe(true);
          if (found!.shift) expect(taught.has('ShiftLeft') && taught.has('ShiftRight'), `${lesson.id}: a capital "${ch}" before Shift is taught`).toBe(true);
        }
      }
    }
  });

  it('open in order: the first always, each next once the one before is cleared', () => {
    const [first, second, third] = TYPING_LESSONS;
    expect(typingLessonOpen(first.id, {})).toBe(true);
    expect(typingLessonOpen(second.id, {})).toBe(false);
    const one = { [typingLessonFlag(first.id)]: true };
    expect(typingLessonOpen(second.id, one)).toBe(true);
    expect(typingLessonOpen(third.id, one)).toBe(false);
    expect(typingLessonOpen('no-such-lesson', one)).toBe(false);
    expect(typingLessonsCleared(one)).toBe(1);
    expect(typingUnlocked({})).toBe(false);
    expect(typingUnlocked(one)).toBe(true);
  });

  it('stars by accuracy', () => {
    expect(typingStars(1)).toBe(3);
    expect(typingStars(0.95)).toBe(3);
    expect(typingStars(0.9)).toBe(2);
    expect(typingStars(0.5)).toBe(1);
  });
});

describe('the battle words (#159)', () => {
  it('a burst word is short and lowercase: the hero, Ember, or the foe', () => {
    expect(burstWord('Valor', 'Count Bat', 0)).toBe('valor');
    expect(burstWord('Valor', 'Count Bat', 0.4)).toBe('ember');
    expect(burstWord('Valor', 'Count Bat', 0.9)).toBe('count bat');
    // A long name gives its last word; "The" is dropped.
    expect(burstWord('Valor', 'The Clockwork Titan', 0.9)).toBe('titan');
    expect(burstWord('Valor', 'The Ringkeeper', 0.9)).toBe('ringkeeper');
    expect(burstWord('Valor', 'Count Bat', 1)).toBe('count bat');
  });

  it("the race's word is the foe's name, lowercase, without 'The', a long one's last word; the race is one regular critter in three", () => {
    expect(enemyWord('Count Bat')).toBe('count bat');
    expect(enemyWord('The Clockwork Titan')).toBe('titan');
    expect(enemyWord('Quill Imp')).toBe('quill imp');
    const critter = { isBoss: false };
    expect(nameRaceDue(critter, true, 0)).toBe(true);
    expect(nameRaceDue(critter, true, NAME_RACE_CHANCE - 0.01)).toBe(true);
    expect(nameRaceDue(critter, true, NAME_RACE_CHANCE)).toBe(false);
    expect(nameRaceDue(critter, false, 0)).toBe(false);
    expect(nameRaceDue({ isBoss: true }, true, 0)).toBe(false);
    expect(nameRaceDue({ isBoss: false, behavior: 'swift' }, true, 0)).toBe(false);
    expect(nameRaceDue({ isBoss: false, behavior: 'healer' }, true, 0)).toBe(true);
  });

  it('the name bonus comes one time in three, names who it is, and pays coins, XP, a potion or a feather', () => {
    expect(rollTypingBonus('Kira', 'Count Bat', { offer: TYPING_BONUS_CHANCE, who: 0, reward: 0 })).toBeNull();
    expect(rollTypingBonus('Kira', 'Count Bat', { offer: 0.9, who: 0, reward: 0 })).toBeNull();
    expect(rollTypingBonus('Kira', 'Count Bat', { offer: 0, who: 0, reward: 0 })).toEqual({ word: 'Kira', who: 'hero', reward: { kind: 'coins', amount: 15 } });
    expect(rollTypingBonus('Kira', 'Count Bat', { offer: 0.1, who: 0.4, reward: 0.3 })).toEqual({ word: 'Ember', who: 'ember', reward: { kind: 'xp', amount: 20 } });
    expect(rollTypingBonus('Kira', 'The Ringkeeper', { offer: 0.2, who: 0.9, reward: 0.6 })).toEqual({ word: 'Ringkeeper', who: 'enemy', reward: { kind: 'item', id: 'potion' } });
    expect(rollTypingBonus('Kira', 'Count Bat', { offer: 0.2, who: 1, reward: 0.99 })).toEqual({ word: 'Count Bat', who: 'enemy', reward: { kind: 'item', id: 'hint' } });
  });
});
