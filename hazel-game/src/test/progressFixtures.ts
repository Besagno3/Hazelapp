/**
 * Kids for 👪 Grown-ups → 📈 Progress tests (#29): a kid mid-Act-II with
 * mixed topic levels and eight questions on their Library shelf, a kid only
 * just through the Training Grounds, and the raw rows the database would
 * hand back (snake_case, as PostgREST does).
 */
import { defaultSave } from '../lib/save';
import { isoOffset } from '../lib/streak';
import type { LibraryEntry, Question, SaveData, Topic } from '../types';

const q = (id: string, topic: Topic, text: string, options: string[], correctIndex: number, explanation?: string): Question => ({
  id,
  topic,
  level: 5,
  text,
  options,
  correctIndex,
  ...(explanation ? { explanation } : {}),
});

/** Eight missed questions, oldest first (as the save keeps them): mixed topics, one timed out, one with no explanation. */
export const EIGHT_MISSED: LibraryEntry[] = [
  { question: q('q-math-1', 'math', 'What is 7 × 8?', ['54', '56', '64', '48'], 1, '7 × 8 = 56: seven eights make fifty-six.'), picked: 0 },
  { question: q('q-sci-1', 'science', 'Which planet is known as the Red Planet?', ['Venus', 'Jupiter', 'Mars', 'Mercury'], 2, 'Rust in its soil makes Mars look red.'), picked: 1 },
  { question: q('q-eng-1', 'engineering', 'Which shape makes a bridge strongest?', ['Square', 'Triangle', 'Circle', 'Oval'], 1, "Triangles can't be pushed out of shape."), picked: -1 },
  { question: q('q-hist-1', 'history', 'Who built the pyramids at Giza?', ['The Romans', 'The Vikings', 'The ancient Egyptians', 'The Aztecs'], 2, 'They were built about 4,500 years ago in Egypt.'), picked: 3 },
  { question: q('q-cre-1', 'creativity', 'Mixing blue and yellow paint makes…', ['Purple', 'Green', 'Orange', 'Brown'], 1), picked: 2 },
  { question: q('q-nat-1', 'nature', 'How many legs does a spider have?', ['6', '8', '10', '4'], 1, 'Spiders have eight legs; insects have six.'), picked: 0 },
  { question: q('q-space-1', 'space', 'What is at the centre of our solar system?', ['The Moon', 'Earth', 'The Sun', 'Mars'], 2, 'All the planets travel around the Sun.'), picked: 1 },
  { question: q('q-words-1', 'words', 'Which word means the same as "happy"?', ['Sad', 'Joyful', 'Angry', 'Tired'], 1, '"Joyful" and "happy" both mean full of good feeling.'), picked: 3 },
];

/** Mid-Act-II: Act I's four crystals and the Spire done, Act II under way, four typing lessons, three keys and two badges. */
export function midActTwoSave(): SaveData {
  const save = defaultSave();
  return {
    ...save,
    revision: 412,
    avatarId: 'a3',
    zoneId: 'silver-shallows',
    coins: 340,
    worldUnlocked: true,
    passedRounds: 5,
    badges: ['verdara-key', 'gearfall-key', 'chromaria-key', 'badge:compass', 'badge:leaf', 'not-a-real-badge'],
    sages: ['math', 'science', 'engineering', 'creativity'],
    flags: {
      ...save.flags,
      'intro-seen': true,
      'ember-hatched': true,
      'crystal-math-restored': true,
      'crystal-science-restored': true,
      'crystal-engineering-restored': true,
      'crystal-creativity-restored': true,
      'spire-cleared': true,
      'spire-victory-seen': true,
      'act2-seen': true,
      'typing:home-fj': true,
      'typing:home-dk': true,
      'typing:home-sl': true,
      'typing:home-a': true,
      'leaves:10': true,
    },
    library: EIGHT_MISSED,
  };
}

/** Through the Training Grounds' first round, nothing else. */
export function trainingSave(): SaveData {
  return { ...defaultSave(), passedRounds: 1 };
}

/** A `profiles` row as PostgREST returns it, for the mid-Act-II kid (last played yesterday, a 3-day streak). */
export function midActTwoRow(id: string, today: string) {
  return {
    id,
    skill_levels: { math: 6, science: 8, engineering: 4, creativity: 3, history: 5, nature: 9 },
    xp: 2340,
    level: 12,
    level_xp: 80,
    current_streak: 3,
    longest_streak: 7,
    last_played_on: isoOffset(today, -1),
  };
}

/** A brand-new kid's row (made with the kid, never played). */
export function newKidRow(id: string) {
  return { id, skill_levels: {}, xp: 0, level: 1, level_xp: 0, current_streak: 0, longest_streak: 0, last_played_on: null };
}
