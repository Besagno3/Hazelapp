/**
 * Touch typing (#159): Librarian Sage's typing lessons at the Lumina Library,
 * the ✍️ scribe bursts in battle and the post-battle name bonus. All the
 * content and the rules of the keyboard live here; the pure typing reducer is
 * `lib/typing.ts`, the screens `features/typing/`.
 *
 * Keys are known by their PHYSICAL position (`KeyboardEvent.code`, the same
 * on every layout), which is what decides the hand and the finger. What a key
 * types is matched by `KeyboardEvent.key`, so a child on another layout is
 * still right when the right letter comes out. The labels drawn on the
 * on-screen keyboard are QWERTY's (ISSUES #159: other layouts).
 */
import { FUN_FACTS } from '../lib/funFacts';
import type { LibraryEntry, Topic } from '../types';
import { CONSUMABLES, type ConsumableId } from './items';
import { SHUSH_QUEST } from './questFlags';
import { ALL_TOPICS, topicInfo } from './topics';

export type Hand = 'left' | 'right';
export type Finger = 'pinky' | 'ring' | 'middle' | 'index' | 'thumb';
export type KeyRow = 'number' | 'top' | 'home' | 'bottom' | 'space';

export interface KeyDef {
  /** The physical key (`KeyboardEvent.code`). */
  code: string;
  /** What's printed on it (QWERTY). */
  label: string;
  /** What it types: plain, and with Shift (QWERTY). Empty for keys that type nothing. */
  chars: [string, string];
  hand: Hand;
  finger: Finger;
  row: KeyRow;
  /** Width in key units (1 = a letter key). */
  width: number;
}

const k = (code: string, label: string, chars: [string, string], hand: Hand, finger: Finger, row: KeyRow, width = 1): KeyDef => ({
  code,
  label,
  chars,
  hand,
  finger,
  row,
  width,
});

/**
 * A US (ANSI) keyboard, row by row, with the standard touch-typing finger
 * for every key. The thumbs share the space bar.
 */
export const KEYBOARD_ROWS: readonly (readonly KeyDef[])[] = [
  [
    k('Backquote', '`', ['`', '~'], 'left', 'pinky', 'number'),
    k('Digit1', '1', ['1', '!'], 'left', 'pinky', 'number'),
    k('Digit2', '2', ['2', '@'], 'left', 'ring', 'number'),
    k('Digit3', '3', ['3', '#'], 'left', 'middle', 'number'),
    k('Digit4', '4', ['4', '$'], 'left', 'index', 'number'),
    k('Digit5', '5', ['5', '%'], 'left', 'index', 'number'),
    k('Digit6', '6', ['6', '^'], 'right', 'index', 'number'),
    k('Digit7', '7', ['7', '&'], 'right', 'index', 'number'),
    k('Digit8', '8', ['8', '*'], 'right', 'middle', 'number'),
    k('Digit9', '9', ['9', '('], 'right', 'ring', 'number'),
    k('Digit0', '0', ['0', ')'], 'right', 'pinky', 'number'),
    k('Minus', '-', ['-', '_'], 'right', 'pinky', 'number'),
    k('Equal', '=', ['=', '+'], 'right', 'pinky', 'number'),
    k('Backspace', '⌫', ['', ''], 'right', 'pinky', 'number', 2),
  ],
  [
    k('Tab', 'Tab', ['', ''], 'left', 'pinky', 'top', 1.5),
    k('KeyQ', 'Q', ['q', 'Q'], 'left', 'pinky', 'top'),
    k('KeyW', 'W', ['w', 'W'], 'left', 'ring', 'top'),
    k('KeyE', 'E', ['e', 'E'], 'left', 'middle', 'top'),
    k('KeyR', 'R', ['r', 'R'], 'left', 'index', 'top'),
    k('KeyT', 'T', ['t', 'T'], 'left', 'index', 'top'),
    k('KeyY', 'Y', ['y', 'Y'], 'right', 'index', 'top'),
    k('KeyU', 'U', ['u', 'U'], 'right', 'index', 'top'),
    k('KeyI', 'I', ['i', 'I'], 'right', 'middle', 'top'),
    k('KeyO', 'O', ['o', 'O'], 'right', 'ring', 'top'),
    k('KeyP', 'P', ['p', 'P'], 'right', 'pinky', 'top'),
    k('BracketLeft', '[', ['[', '{'], 'right', 'pinky', 'top'),
    k('BracketRight', ']', [']', '}'], 'right', 'pinky', 'top'),
    k('Backslash', '\\', ['\\', '|'], 'right', 'pinky', 'top', 1.5),
  ],
  [
    k('CapsLock', 'Caps', ['', ''], 'left', 'pinky', 'home', 1.75),
    k('KeyA', 'A', ['a', 'A'], 'left', 'pinky', 'home'),
    k('KeyS', 'S', ['s', 'S'], 'left', 'ring', 'home'),
    k('KeyD', 'D', ['d', 'D'], 'left', 'middle', 'home'),
    k('KeyF', 'F', ['f', 'F'], 'left', 'index', 'home'),
    k('KeyG', 'G', ['g', 'G'], 'left', 'index', 'home'),
    k('KeyH', 'H', ['h', 'H'], 'right', 'index', 'home'),
    k('KeyJ', 'J', ['j', 'J'], 'right', 'index', 'home'),
    k('KeyK', 'K', ['k', 'K'], 'right', 'middle', 'home'),
    k('KeyL', 'L', ['l', 'L'], 'right', 'ring', 'home'),
    k('Semicolon', ';', [';', ':'], 'right', 'pinky', 'home'),
    k('Quote', "'", ["'", '"'], 'right', 'pinky', 'home'),
    k('Enter', 'Enter', ['', ''], 'right', 'pinky', 'home', 2.25),
  ],
  [
    k('ShiftLeft', 'Shift', ['', ''], 'left', 'pinky', 'bottom', 2.25),
    k('KeyZ', 'Z', ['z', 'Z'], 'left', 'pinky', 'bottom'),
    k('KeyX', 'X', ['x', 'X'], 'left', 'ring', 'bottom'),
    k('KeyC', 'C', ['c', 'C'], 'left', 'middle', 'bottom'),
    k('KeyV', 'V', ['v', 'V'], 'left', 'index', 'bottom'),
    k('KeyB', 'B', ['b', 'B'], 'left', 'index', 'bottom'),
    k('KeyN', 'N', ['n', 'N'], 'right', 'index', 'bottom'),
    k('KeyM', 'M', ['m', 'M'], 'right', 'index', 'bottom'),
    k('Comma', ',', [',', '<'], 'right', 'middle', 'bottom'),
    k('Period', '.', ['.', '>'], 'right', 'ring', 'bottom'),
    k('Slash', '/', ['/', '?'], 'right', 'pinky', 'bottom'),
    k('ShiftRight', 'Shift', ['', ''], 'right', 'pinky', 'bottom', 2.75),
  ],
  [k('Space', '', [' ', ' '], 'right', 'thumb', 'space', 6)],
];

/** Every key by its physical code. */
export const KEY_BY_CODE: Readonly<Record<string, KeyDef>> = Object.fromEntries(
  KEYBOARD_ROWS.flat().map((key) => [key.code, key]),
);

/** The two home keys with the bumps — where the index fingers rest. */
export const HOME_LEFT = 'KeyF';
export const HOME_RIGHT = 'KeyJ';

/** Where a character is typed on a QWERTY keyboard, and whether Shift is needed. */
export function charKey(ch: string): { key: KeyDef; shift: boolean } | null {
  for (const key of KEYBOARD_ROWS.flat()) {
    if (key.chars[0] === ch && key.chars[0] !== '') return { key, shift: false };
  }
  for (const key of KEYBOARD_ROWS.flat()) {
    if (key.chars[1] === ch && key.chars[1] !== '') return { key, shift: true };
  }
  return null;
}

/**
 * The home-row hold (the owner's safeguard, #159): while one hand types a
 * letter, the OTHER hand must be holding a key at its end of the keyboard —
 * its index finger's bump key (F for the right hand's letters, J for the
 * left's), which is where that finger belongs anyway. A capital needs the
 * other hand's Shift instead, the way touch typists really do it. Nothing to
 * hold for the space bar (either thumb) or a character that isn't on the map.
 *
 * Not Shift for ordinary letters: Windows opens its FilterKeys dialog when
 * Right Shift is held for eight seconds, and Sticky Keys on five quick
 * presses. F and J are plain keys — holding one and pressing another is two
 * keys down, which every keyboard can tell apart.
 */
export function anchorsFor(ch: string): string[] {
  const found = charKey(ch);
  if (!found || found.key.finger === 'thumb') return [];
  if (found.shift) return [found.key.hand === 'left' ? 'ShiftRight' : 'ShiftLeft'];
  return [found.key.hand === 'left' ? HOME_RIGHT : HOME_LEFT];
}

/** The finger that presses a character (for the hands under the keyboard). */
export function fingerFor(ch: string): { hand: Hand; finger: Finger } | null {
  const found = charKey(ch);
  return found ? { hand: found.key.hand, finger: found.key.finger } : null;
}

export interface TypingLesson {
  id: string;
  emoji: string;
  title: string;
  /** What Librarian Sage says before it. */
  teaches: string;
  /** The keys (codes) this lesson adds. A drill uses only the keys taught so far. */
  keys: readonly string[];
  /** The lines to type, in order. */
  lines: readonly string[];
}

/**
 * The lessons, in the classic order: the home row from the bump keys out,
 * then the top row, the bottom row, capitals with the other hand's Shift,
 * and real sentences. `typing.test` checks every drill uses only keys taught
 * by then (the space bar is always allowed).
 */
export const TYPING_LESSONS: readonly TypingLesson[] = [
  {
    id: 'home-fj',
    emoji: '🏠',
    title: 'F and J, the bumpy keys',
    teaches: 'Feel the little bumps on F and J? Your pointer fingers live there. Left on F, right on J.',
    keys: ['KeyF', 'KeyJ', 'Space'],
    lines: ['fff jjj', 'fj fj fj', 'jf jf jf', 'ff jj ff jj', 'fjf jfj fjf'],
  },
  {
    id: 'home-dk',
    emoji: '🏠',
    title: 'D and K',
    teaches: 'Your tall middle fingers rest on D and K, right next door to the bumps.',
    keys: ['KeyD', 'KeyK'],
    lines: ['ddd kkk', 'dk dk dk', 'fd jk fd jk', 'dfd kjk', 'fdk jkd fdk'],
  },
  {
    id: 'home-sl',
    emoji: '🏠',
    title: 'S and L',
    teaches: 'Ring fingers on S and L. Nearly a whole row of fingers at home!',
    keys: ['KeyS', 'KeyL'],
    lines: ['sss lll', 'sl sl ls ls', 'dsk lsd ksl', 'fsl jld fsl', 'sdf lkj sdf'],
  },
  {
    id: 'home-a',
    emoji: '🏠',
    title: 'A and the semicolon',
    teaches: 'Little fingers are small but mighty: A on the left, the ; key on the right. Now you can type real words!',
    keys: ['KeyA', 'Semicolon'],
    lines: ['aaa ;;;', 'a; a; ;a ;a', 'sad lad dad', 'ask all fall;', 'a salad falls;'],
  },
  {
    id: 'top-ei',
    emoji: '⬆️',
    title: 'E and I: reach up!',
    teaches: 'Middle fingers stretch up to E and I, then hop back home to D and K.',
    keys: ['KeyE', 'KeyI'],
    lines: ['eee iii', 'ei ie ei ie', 'see lie fed', 'like life feel', 'a kid is skilled'],
  },
  {
    id: 'top-ru',
    emoji: '⬆️',
    title: 'R and U',
    teaches: 'Pointer fingers reach up to R and U. They always come back to the bumps.',
    keys: ['KeyR', 'KeyU'],
    lines: ['rrr uuu', 'ru ur ru ur', 'fur jar rule', 'sure fire rider', 'a ruler is useful'],
  },
  {
    id: 'top-to',
    emoji: '⬆️',
    title: 'T and O',
    teaches: 'Left pointer stretches to T. Right ring finger reaches O.',
    keys: ['KeyT', 'KeyO'],
    lines: ['ttt ooo', 'to too lot', 'root tool stood', 'a turtle trots', 'frost is lost'],
  },
  {
    id: 'home-gh',
    emoji: '🏠',
    title: 'G and H, in the middle',
    teaches: 'Pointer fingers slide one key inward for G and H, then straight back to the bumps.',
    keys: ['KeyG', 'KeyH'],
    lines: ['ggg hhh', 'gh hg gh hg', 'hat hog high', 'light right sight', 'the dog is huge'],
  },
  {
    id: 'top-corners',
    emoji: '⬆️',
    title: 'W, Q, P and Y',
    teaches: 'The corners: ring finger to W, little finger to Q and P, pointer to Y.',
    keys: ['KeyW', 'KeyQ', 'KeyP', 'KeyY'],
    lines: ['www yyy', 'ppp qqq', 'we you pay quit', 'a quiet puppy', 'why sleep so late'],
  },
  {
    id: 'bottom-vnmb',
    emoji: '⬇️',
    title: 'V, N, M and B: reach down',
    teaches: 'Pointer fingers curl down to V and B on the left, N and M on the right.',
    keys: ['KeyV', 'KeyN', 'KeyM', 'KeyB'],
    lines: ['vvv nnn', 'mmm bbb', 'van man bun', 'moon bear vest', 'seven brave bunnies'],
  },
  {
    id: 'bottom-cxz',
    emoji: '⬇️',
    title: 'C, X, Z, comma and full stop',
    teaches: 'Middle finger down to C, ring to X, little to Z. On the right, the comma and the full stop.',
    keys: ['KeyC', 'KeyX', 'KeyZ', 'Comma', 'Period'],
    lines: ['ccc xxx zzz', 'cat fox zoo', 'buzz, box, cozy.', 'a lazy cat naps.', 'zip, zap, zoom.'],
  },
  {
    id: 'capitals',
    emoji: '🔠',
    title: 'Capitals: the other Shift',
    teaches: 'For a capital, hold Shift with the hand that is NOT typing the letter. Right Shift for E, left Shift for M.',
    keys: ['ShiftLeft', 'ShiftRight'],
    lines: ['Ember Ember', 'Lumina Valor Kira', 'Talon and Bastion', 'Selene reads a book.', 'Pip, Wisp, Ember.'],
  },
  {
    id: 'sentences',
    emoji: '📜',
    title: "A scribe's sentences",
    teaches: 'Whole sentences now, with true facts in them. Eyes on the screen, fingers on the bumps!',
    keys: [],
    lines: [
      'Honey never spoils.',
      'Bananas are berries.',
      'Octopuses have three hearts.',
      'Sea otters hold hands as they sleep.',
      'A day on Venus is longer than its year.',
    ],
  },
];

/** The keys a lesson may use: everything taught up to and including it. */
export function keysTaughtBy(lessonId: string): Set<string> {
  const keys = new Set<string>(['Space']);
  for (const lesson of TYPING_LESSONS) {
    for (const code of lesson.keys) keys.add(code);
    if (lesson.id === lessonId) break;
  }
  return keys;
}

/** The save flag set when a lesson is cleared. */
export function typingLessonFlag(id: string): string {
  return `typing:${id}`;
}

/** Lessons open in order: the first always, the rest once the one before is cleared. */
export function typingLessonOpen(id: string, flags: Record<string, boolean>): boolean {
  const i = TYPING_LESSONS.findIndex((l) => l.id === id);
  if (i <= 0) return i === 0;
  return flags[typingLessonFlag(TYPING_LESSONS[i - 1].id)] === true;
}

export function typingLessonsCleared(flags: Record<string, boolean>): number {
  return TYPING_LESSONS.filter((l) => flags[typingLessonFlag(l.id)]).length;
}

/** The first lesson cleared opens the ✍️ scribe bursts in battle. */
export function typingUnlocked(flags: Record<string, boolean>): boolean {
  return flags[typingLessonFlag(TYPING_LESSONS[0].id)] === true;
}

/** XP for clearing a lesson the first time. */
export const TYPING_LESSON_XP = 30;

/** The badge for clearing every lesson (shown on the 📜 Menu's shelf). */
export const TYPING_BADGE_ID = 'badge:scribe';
export const TYPING_BADGES: Record<string, { name: string; emoji: string }> = {
  [TYPING_BADGE_ID]: { name: "Scribe's Quill", emoji: '✍️' },
};

/** Accuracy needed for each star on a cleared lesson. */
export const STAR_ACCURACY = { three: 0.95, two: 0.85 } as const;

export function typingStars(accuracy: number): 1 | 2 | 3 {
  if (accuracy >= STAR_ACCURACY.three) return 3;
  if (accuracy >= STAR_ACCURACY.two) return 2;
  return 1;
}

// --- Battle (#159, items 2 and 3) ---------------------------------------------

/** How long a ✍️ scribe burst gives to type its word, in ms. Generous: the hold rule slows a kid down. */
export const BURST_MS = 10_000;
/** A landed Attack hits this much harder after its word is typed in time. */
export const SCRIBE_ATTACK_MULT = 1.25;
/** A block followed by its word typed in time adds this much ◆ charge. */
export const SCRIBE_BLOCK_CHARGE = 1;

/** Keep a burst word short enough for a young typist. */
export const BURST_MAX = 12;

/**
 * The word a ✍️ scribe burst asks for: the hero's name, Ember's, or the foe's
 * — lowercase, so the hold rule asks for a bump key and never a Shift mid-word.
 * A long foe's name ("Clockwork Titan") gives its last word. `roll` picks (0–1).
 */
export function burstWord(heroName: string, enemyName: string, roll = Math.random()): string {
  const words = [heroName.toLowerCase(), 'ember', enemyWord(enemyName)];
  return words[Math.min(words.length - 1, Math.floor(roll * words.length))];
}

/**
 * A foe's name as a word to type: lowercase, "The" dropped, a hyphen a space
 * (no lesson teaches the dash — review round 2: "dog-knight"), a long name's
 * last word, never cut mid-word.
 */
export function enemyWord(enemyName: string): string {
  const foe = plainName(enemyName).toLowerCase();
  if (foe.length <= BURST_MAX) return foe;
  const last = foe.split(' ').pop() ?? foe;
  return last.length <= BURST_MAX ? last : last.slice(0, BURST_MAX);
}

/** A name as it's typed: "The" dropped, hyphens spaces. */
export function plainName(name: string): string {
  return name.replace(/^The /, '').replace(/-/g, ' ');
}

// --- The name race (#159, item 4) ---------------------------------------------

/**
 * As a regular critter's battle opens, one encounter in this many starts on a
 * race: name the critter in time and the hero strikes first; too slow and
 * the critter darts in first (the owner: random, so some critters get the
 * first move). Never a boss, nor a swift critter (it strikes first anyway).
 */
export const NAME_RACE_CHANCE = 1 / 3;
/**
 * How long the race gives, in ms, after a short "ready" beat (`RACE_READY_MS`,
 * the hands coming off the arrow keys — review round 2). Little hands get longer.
 */
export const NAME_RACE_MS = 8_000;
export const NAME_RACE_LITTLE_MS = 12_000;
export const RACE_READY_MS = 1_200;
/** Under this age the clocks run longer and the lessons list suggests going slow. */
export const LITTLE_HANDS_AGE = 8;
/**
 * The lesson that completes the letters. The race waits for it (review round
 * 1: on F and J alone it read as a punishment), and until then the bursts and
 * the song run with no clock (review round 2).
 */
export const LETTERS_LESSON = 'bottom-cxz';
/** @deprecated name kept for the race; `lettersLearned` is the rule. */
export const NAME_RACE_OPENS_AFTER = LETTERS_LESSON;

/** Whether every letter's lesson is cleared. */
export function lettersLearned(flags: Record<string, boolean>): boolean {
  return flags[typingLessonFlag(LETTERS_LESSON)] === true;
}

/** Whether this player can be raced: every letter's lesson cleared. */
export function nameRaceOpen(flags: Record<string, boolean>): boolean {
  return lettersLearned(flags);
}
/** The free first strike's power, as a share of a landed Attack's. */
export const FIRST_STRIKE_SHARE = 0.5;

/** Whether this battle opens on a name race. `roll` is 0–1 (injected by tests). */
export function nameRaceDue(enemy: { isBoss: boolean; behavior?: string }, scribe: boolean, roll = Math.random()): boolean {
  return scribe && !enemy.isBoss && enemy.behavior !== 'swift' && roll < NAME_RACE_CHANCE;
}

/** How often a won battle offers the ✍️ name bonus. */
export const TYPING_BONUS_CHANCE = 1 / 3;

export type TypingBonusReward =
  | { kind: 'coins'; amount: number }
  | { kind: 'xp'; amount: number }
  | { kind: 'item'; id: ConsumableId };

export const TYPING_BONUS_COINS = 15;
export const TYPING_BONUS_XP = 20;

export interface TypingBonus {
  /** The name to type, as it's written (capitals and all: no timer here). */
  word: string;
  /** Who it belongs to, for the prompt. */
  who: 'hero' | 'ember' | 'enemy';
  reward: TypingBonusReward;
}

/**
 * After a won battle (#159 item 3), one time in `TYPING_BONUS_CHANCE` a scroll
 * asks the kid to type the hero's name, Ember's or the foe's for a bonus — a
 * few coins, a little XP or a potion or a feather. `rolls` are injected so a
 * test can pick; each is 0–1.
 */
export function rollTypingBonus(
  heroName: string,
  enemyName: string,
  rolls: { offer: number; who: number; reward: number } = { offer: Math.random(), who: Math.random(), reward: Math.random() },
): TypingBonus | null {
  if (rolls.offer >= TYPING_BONUS_CHANCE) return null;
  const who = (['hero', 'ember', 'enemy'] as const)[Math.min(2, Math.floor(rolls.who * 3))];
  const word = who === 'hero' ? heroName : who === 'ember' ? 'Ember' : plainName(enemyName);
  const r = Math.floor(rolls.reward * 4);
  const reward: TypingBonusReward =
    r === 0 ? { kind: 'coins', amount: TYPING_BONUS_COINS } : r === 1 ? { kind: 'xp', amount: TYPING_BONUS_XP } : r === 2 ? { kind: 'item', id: 'potion' } : { kind: 'item', id: 'hint' };
  return { word, who, reward };
}

/** What a bonus pays, in words: "🪙 15 coins", "⭐ 20 XP", "🧪 a Berry Potion". */
export function bonusWords(reward: TypingBonusReward): string {
  if (reward.kind === 'coins') return `🪙 ${reward.amount} coins`;
  if (reward.kind === 'xp') return `⭐ ${reward.amount} XP`;
  const item = CONSUMABLES[reward.id];
  return `${item.emoji} a ${item.name}`;
}

// --- The scriptorium (#159, item 5) -------------------------------------------

/** XP for copying a page the first time. */
export const SCRIPTORIUM_XP = 15;
/** How many pages the desk offers at once. */
export const SCRIPTORIUM_PAGES = 6;
/** At most this many of them from the Library's shelf (missed questions). */
export const SCRIPTORIUM_SHELF_PAGES = 3;
/** A page's lines are wrapped to this many characters. */
export const PAGE_LINE_MAX = 40;
/** The lesson a scribe must clear before copying pages (a page has capitals in it). */
export const SCRIPTORIUM_OPENS_AFTER = 'capitals';

export interface ScriptoriumPage {
  /** A missed question's id, or `fact:<topic>:<n>`. */
  id: string;
  source: 'shelf' | 'fact';
  topic: Topic;
  /** The question's text (a shelf page) or the topic's name (a fact). */
  title: string;
  /** The passage, wrapped into lines a kid types one at a time. */
  lines: readonly string[];
}

/** The flag set once a page has been copied (it pays once, then leaves the desk). */
export function pageFlag(pageId: string): string {
  return `page:${pageId}`;
}

/** The scriptorium opens once the capitals lesson is cleared. */
export function scriptoriumOpen(flags: Record<string, boolean>): boolean {
  return flags[typingLessonFlag(SCRIPTORIUM_OPENS_AFTER)] === true;
}

/** How many pages this player has copied. */
export function pagesCopied(flags: Record<string, boolean>): number {
  return Object.keys(flags).filter((f) => f.startsWith('page:') && flags[f]).length;
}

/**
 * A passage as a keyboard can type it: curly quotes and dashes become the
 * plain keys, an ellipsis three dots, spaces are single. Null when a character
 * has no key on the map (an accent, a degree sign) — that page is left out.
 */
export function scribeText(raw: string): string | null {
  const text = raw
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  for (const ch of text) if (ch !== ' ' && !charKey(ch)) return null;
  return text;
}

/** A passage wrapped into lines of at most `max` characters, words kept whole. */
export function pageLines(text: string, max = PAGE_LINE_MAX): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= max) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The pages on the desk: first the explanations of questions on the Library's
 * shelf (learning by writing — up to `SCRIPTORIUM_SHELF_PAGES`), then the fun
 * facts, one topic after another, until `SCRIPTORIUM_PAGES`. A page copied
 * before is skipped, and so is any the keyboard can't type.
 */
export function scriptoriumPages(library: readonly LibraryEntry[], flags: Record<string, boolean>): ScriptoriumPage[] {
  const pages: ScriptoriumPage[] = [];
  for (const entry of library) {
    if (pages.length >= SCRIPTORIUM_SHELF_PAGES) break;
    const q = entry.question;
    if (flags[pageFlag(q.id)]) continue;
    const text = q.explanation ? scribeText(q.explanation) : null;
    if (!text) continue;
    pages.push({ id: q.id, source: 'shelf', topic: q.topic, title: q.text, lines: pageLines(text) });
  }
  for (let i = 0; pages.length < SCRIPTORIUM_PAGES; i++) {
    let any = false;
    for (const topic of ALL_TOPICS) {
      if (pages.length >= SCRIPTORIUM_PAGES) break;
      const fact = FUN_FACTS[topic][i];
      if (fact === undefined) continue;
      any = true;
      const id = `fact:${topic}:${i}`;
      if (flags[pageFlag(id)]) continue;
      const text = scribeText(fact.replace(/^Did you know\? /, ''));
      if (!text) continue;
      const info = topicInfo(topic);
      pages.push({ id, source: 'fact', topic, title: `${info.emoji} ${info.label}`, lines: pageLines(text) });
    }
    if (!any) break;
  }
  return pages;
}

// --- The song that breaks the hush (#159, item 6) ------------------------------

/**
 * A boss whose power move can be broken by a song: while it winds up, the kid
 * types a line of the song (one per wind-up, round and round) against the
 * clock. In time, the move fizzles to a plain blow; too slow, it comes as ever
 * (Guard still blocks it — never a penalty). The Hush Fiend's is the first
 * Sage's lullaby, the one "she used to sing to us" (the Crystal of Voices).
 */
export interface BossSong {
  /** The lines, lowercase letters and spaces only (the hold asks for a bump key, never a Shift). */
  lines: readonly string[];
  /** The prompt over the bar. */
  prompt: string;
  /** Said when a line is typed in time, and when the clock runs out. */
  done: string;
  late: string;
  /** The message after a broken move. */
  broken: (name: string, move: string) => string;
}

/** How long a song line gives, in ms — a whole line, so longer than a burst. Little hands get longer. */
export const SONG_MS = 20_000;
export const SONG_LITTLE_MS = 30_000;

export const BOSS_SONGS: Record<string, BossSong> = {
  'hush-fiend': {
    lines: ['hush now little ones and hear', 'a name is a song to keep', 'sing it back and we are near', 'no voice is lost that is sung'],
    prompt: 'sing to break it!',
    done: '🎶 Your song rings out — the hush breaks!',
    late: 'Too slow — the shush swallows your song. Next time!',
    broken: (name, move) => `🎶 The whole island hums along! ${name} claps its mittens over its ears — its ${move} fizzles. Next turn it can only swipe at you.`,
  },
};

/** The song that breaks this boss's power move, if it has one. */
export function songFor(enemyId: string): BossSong | null {
  return BOSS_SONGS[enemyId] ?? null;
}

// --- Pangram chests (#159, item 8) ---------------------------------------------

/**
 * Sentences with every letter of the alphabet — a scribe's test since the
 * first typewriters. Short, kid-safe, and typeable on the key map (a test
 * checks all 26 letters and the keys).
 */
export const PANGRAMS: readonly string[] = [
  'The quick brown fox jumps over the lazy dog.',
  'How vexingly quick daft zebras jump.',
  'Sphinx of black quartz, judge my vow.',
  'The five boxing wizards jump quickly.',
  'Jackdaws love my big sphinx of quartz.',
  'Bright vixens jump; dozy fowl quack.',
];

/** The scribe's bonus for opening a chest by its sentence, on top of the chest's coins. */
export const PANGRAM_BONUS_COINS = 15;
/** About this share of riddle-chests have a scribe's lock (by their id, so a given chest always does or never does). */
export const PANGRAM_CHEST_EVERY = 4;

function chestHash(chestId: string): number {
  let h = 0;
  for (const ch of chestId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Whether this riddle-chest also has a scribe's lock: a pangram to type that
 * opens it with a bonus — with a keyboard and the capitals lesson (a sentence
 * has big letters); the riddle opens it as ever, so no one is locked out.
 */
export function pangramChest(chestId: string): boolean {
  return chestHash(chestId) % PANGRAM_CHEST_EVERY === 0;
}

/** The sentence on this chest's lock (the same every time). */
export function pangramFor(chestId: string): string {
  return PANGRAMS[Math.floor(chestHash(chestId) / PANGRAM_CHEST_EVERY) % PANGRAMS.length];
}

/** Every letter of the alphabet, at least once. */
export function isPangram(text: string): boolean {
  const letters = new Set(text.toLowerCase().replace(/[^a-z]/g, ''));
  return letters.size === 26;
}

// --- Pen-pal replies (#159, item 9) --------------------------------------------

/**
 * A letter quest where the kid can add a line in their own hand: at the bring
 * step, with a keyboard and the capitals lesson, the recipient offers it —
 * pick one of a few lines and type it; the giver reads it back at the end.
 * The line is one of `replies` (kept as a flag by its number — never free
 * text, which has no place in a save), so nothing a kid types leaves the
 * browser. Shush's Pen-Pal Papers (#75 item 15f) is the first.
 */
export interface PenPal {
  questId: string;
  /** The bring step whose recipient offers the reply. */
  stepId: string;
  /** Who reads it at the end. */
  to: string;
  replies: readonly string[];
  /** The recipient's offer, what they say once it's written, and how the giver reads it back. */
  offer: string;
  written: string;
  read: (reply: string) => string;
}

export const PEN_PALS: readonly PenPal[] = [
  {
    questId: SHUSH_QUEST,
    stepId: 'shush-deliver',
    to: 'Shush',
    replies: ['The cliffs are singing again!', 'Ember says hello to the Quiet Quarter.', 'Five kittens! Please send a drawing.'],
    offer: "Shush would love a line in YOUR hand too. Pick one and type it, and I'll tuck it in with mine!",
    written: "There — your line is in the envelope, in your own hand. Shush will read it twice, I'm sure of it.",
    read: (reply) => `And a line in YOUR hand! "${reply}" Shush reads it twice, and smiles the quietest smile.`,
  },
];

/** The pen-pal moment at this bring step, if the quest has one. */
export function penPalFor(stepId: string): PenPal | null {
  return PEN_PALS.find((p) => p.stepId === stepId) ?? null;
}

/** The flag that remembers which line was written (by its number). */
export function penPalReplyFlag(questId: string, index: number): string {
  return `penpal:${questId}:${index}`;
}

/** The line the kid wrote for this quest, if any. */
export function penPalReply(questId: string, flags: Record<string, boolean>): string | null {
  const pal = PEN_PALS.find((p) => p.questId === questId);
  if (!pal) return null;
  const i = pal.replies.findIndex((_, n) => flags[penPalReplyFlag(questId, n)] === true);
  return i < 0 ? null : pal.replies[i];
}

/** What the giver says about the kid's line as the quest ends — null when none was written. */
export function penPalReadLine(questId: string, flags: Record<string, boolean>): string | null {
  const reply = penPalReply(questId, flags);
  const pal = PEN_PALS.find((p) => p.questId === questId);
  return reply && pal ? pal.read(reply) : null;
}
