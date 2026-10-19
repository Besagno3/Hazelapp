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
  PAGE_LINE_MAX,
  SCRIPTORIUM_PAGES,
  SCRIPTORIUM_SHELF_PAGES,
  pageFlag,
  pageLines,
  pagesCopied,
  scribeText,
  scriptoriumOpen,
  scriptoriumPages,
  BOSS_SONGS,
  songFor,
  PANGRAMS,
  PANGRAM_CHEST_EVERY,
  isPangram,
  pangramChest,
  pangramFor,
  LETTERS_LESSON,
  lettersLearned,
  plainName,
  BURST_MAX,
  PEN_PALS,
  penPalFor,
  penPalReadLine,
  penPalReply,
  penPalReplyFlag,
} from './typing';
import { ZONES, pathTargetId } from './zones';
import { QUESTS } from './quests';
import { ENEMY_DEFS } from './enemies';
import { FUN_FACTS } from '../lib/funFacts';
import { ALL_TOPICS } from './topics';
import type { LibraryEntry } from '../types';

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
    // A hyphen is a space (no lesson teaches the dash), and a long name is never cut mid-word (review round 2).
    expect(enemyWord('Dog-Knight')).toBe('dog knight');
    expect(enemyWord('Cuttle-Scribe')).toBe('scribe');
    for (const def of Object.values(ENEMY_DEFS)) {
      const word = enemyWord(def.name);
      expect(word, def.name).toMatch(/^[a-z ]+$/);
      expect(word.length, def.name).toBeLessThanOrEqual(BURST_MAX);
      // Never cut mid-word: the whole name, or its last word.
      expect(plainName(def.name).toLowerCase().endsWith(word), def.name).toBe(true);
      expect(plainName(def.name).toLowerCase().split(' ')).toContain(word.split(' ').pop());
    }
    expect(lettersLearned({})).toBe(false);
    expect(lettersLearned({ [typingLessonFlag(LETTERS_LESSON)]: true })).toBe(true);
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

describe('the scriptorium (#159 item 5)', () => {
  const missed = (id: string, explanation?: string): LibraryEntry => ({
    question: { id, topic: 'math', level: 2, text: `Question ${id}?`, options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation },
    picked: 1,
  });

  it('a page is typed with plain keys: curly quotes and dashes become theirs, an accent leaves it out', () => {
    expect(scribeText('Van Gogh painted \u201cThe Starry Night\u201d \u2014 it\u2019s true\u2026')).toBe('Van Gogh painted "The Starry Night" - it\'s true...');
    expect(scribeText('  two   spaces  ')).toBe('two spaces');
    expect(scribeText('A caf\u00e9 au lait')).toBeNull();
    expect(scribeText('About 20\u00b0C')).toBeNull();
    expect(scribeText('')).toBeNull();
  });

  it('lines keep words whole and fit the width', () => {
    const text = 'Add up every number from 1 to 100 and you get exactly 5,050. It is a true fact.';
    const lines = pageLines(text);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(PAGE_LINE_MAX);
    expect(lines.join(' ')).toBe(text);
    expect(pageLines('short')).toEqual(['short']);
    expect(pageLines('a b c', 3)).toEqual(['a b', 'c']);
  });

  it('every fun fact makes a page the keyboard can type', () => {
    for (const topic of ALL_TOPICS) for (const fact of FUN_FACTS[topic]) expect(scribeText(fact), fact).not.toBeNull();
  });

  it("the desk: the shelf's explanations first (up to three, skipping what has no page), then one fact a topic, never a page copied before", () => {
    const library = [missed('q1', 'Because one.'), missed('q2'), missed('q3', 'A caf\u00e9.'), missed('q4', 'Because four.'), missed('q5', 'Because five.'), missed('q6', 'Because six.')];
    const pages = scriptoriumPages(library, {});
    expect(pages).toHaveLength(SCRIPTORIUM_PAGES);
    expect(pages.slice(0, SCRIPTORIUM_SHELF_PAGES).map((p) => p.id)).toEqual(['q1', 'q4', 'q5']);
    expect(pages[0]).toMatchObject({ source: 'shelf', topic: 'math', title: 'Question q1?', lines: ['Because one.'] });
    const facts = pages.slice(SCRIPTORIUM_SHELF_PAGES);
    expect(facts.map((p) => p.id)).toEqual(ALL_TOPICS.slice(0, facts.length).map((t) => `fact:${t}:0`));
    expect(facts[0].source).toBe('fact');
    expect(facts[0].lines.join(' ')).not.toMatch(/^Did you know/);
    // Copied pages leave the desk; the facts go on round the topics.
    const copied = { [pageFlag('q1')]: true, [pageFlag(`fact:${ALL_TOPICS[0]}:0`)]: true };
    const again = scriptoriumPages(library, copied);
    expect(again.map((p) => p.id)).not.toContain('q1');
    expect(again.map((p) => p.id)).not.toContain(`fact:${ALL_TOPICS[0]}:0`);
    expect(again).toHaveLength(SCRIPTORIUM_PAGES);
    expect(pagesCopied(copied)).toBe(2);
    // With no shelf, the facts alone; with every fact copied, an empty desk.
    expect(scriptoriumPages([], {}).every((p) => p.source === 'fact')).toBe(true);
    const all: Record<string, boolean> = {};
    for (const topic of ALL_TOPICS) FUN_FACTS[topic].forEach((_, i) => (all[pageFlag(`fact:${topic}:${i}`)] = true));
    expect(scriptoriumPages([], all)).toEqual([]);
  });

  it('opens once the capitals lesson is cleared', () => {
    expect(scriptoriumOpen({})).toBe(false);
    expect(scriptoriumOpen({ [typingLessonFlag('capitals')]: true })).toBe(true);
  });
});

describe('the song that breaks the hush (#159 item 6)', () => {
  it("the Hush Fiend has one; its lines are short, lowercase letters and spaces only, so the hold never wants a Shift", () => {
    expect(songFor('hush-fiend')).toBe(BOSS_SONGS['hush-fiend']);
    expect(songFor('count-bat')).toBeNull();
    for (const song of Object.values(BOSS_SONGS)) {
      expect(song.lines.length).toBeGreaterThan(0);
      for (const line of song.lines) {
        expect(line).toMatch(/^[a-z ]+$/);
        expect(line.length).toBeLessThanOrEqual(32);
        for (const ch of line) expect(charKey(ch)).not.toBeNull();
      }
      expect(song.broken('The Hush Fiend', 'Great Shush')).toMatch(/Great Shush/);
    }
  });
});

describe('pangram chests (#159 item 8)', () => {
  it('every pangram uses only keys the lessons teach (review round 2: "!" asked for the number row)', () => {
    const taught = keysTaughtBy(TYPING_LESSONS[TYPING_LESSONS.length - 1].id);
    for (const p of PANGRAMS) for (const ch of p) expect(taught.has(charKey(ch)!.key.code), `${p}: ${ch}`).toBe(true);
  });

  it('every pangram has all 26 letters and types on the key map; a non-pangram is not one', () => {
    for (const p of PANGRAMS) {
      expect(isPangram(p), p).toBe(true);
      expect(scribeText(p)).toBe(p);
      expect(p.length).toBeLessThanOrEqual(48);
    }
    expect(isPangram('The quick brown fox.')).toBe(false);
  });

  it("about one riddle-chest in four has a scribe's lock, always the same ones with the same sentence", () => {
    const ids: string[] = [];
    for (const z of Object.values(ZONES)) z.map.forEach((row, y) => [...row].forEach((ch, x) => ch === 'C' && ids.push(pathTargetId(z.id, 'chest', x, y))));
    expect(ids.length).toBeGreaterThan(20);
    const locked = ids.filter(pangramChest);
    const share = locked.length / ids.length;
    expect(share).toBeGreaterThan(1 / PANGRAM_CHEST_EVERY - 0.12);
    expect(share).toBeLessThan(1 / PANGRAM_CHEST_EVERY + 0.12);
    for (const id of locked) {
      expect(PANGRAMS).toContain(pangramFor(id));
    }
    // More than one sentence is in use across the world.
    expect(new Set(locked.map(pangramFor)).size).toBeGreaterThan(1);
  });
});

describe('pen-pal replies (#159 item 9)', () => {
  it("each pen pal hangs off a real quest's bring step; its lines type on the key map", () => {
    for (const pal of PEN_PALS) {
      const quest = QUESTS.find((q) => q.id === pal.questId)!;
      expect(quest, pal.questId).toBeDefined();
      const step = quest.steps.find((st) => st.id === pal.stepId)!;
      expect(step?.trade, pal.stepId).toBeDefined();
      expect(penPalFor(pal.stepId)).toBe(pal);
      for (const line of pal.replies) {
        expect(scribeText(line)).toBe(line);
        expect(line.length).toBeLessThanOrEqual(44);
      }
      expect(pal.read(pal.replies[0])).toContain(pal.replies[0]);
    }
    expect(penPalFor('no-such-step')).toBeNull();
  });

  it('the line written is remembered by its number and read back at the end', () => {
    const pal = PEN_PALS[0];
    expect(penPalReply(pal.questId, {})).toBeNull();
    expect(penPalReadLine(pal.questId, {})).toBeNull();
    const flags = { [penPalReplyFlag(pal.questId, 1)]: true };
    expect(penPalReply(pal.questId, flags)).toBe(pal.replies[1]);
    expect(penPalReadLine(pal.questId, flags)).toBe(pal.read(pal.replies[1]));
    expect(penPalReadLine('no-such-quest', flags)).toBeNull();
  });
});
