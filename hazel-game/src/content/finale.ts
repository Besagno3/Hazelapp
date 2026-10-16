import { ALL_TOPICS } from './topics';
import type { Topic } from '../types';

/**
 * The Name (#75 item 16e, STORY-4X §6): Umbra Remembered waits at the Root's
 * Heart. He is never fought to zero — his questions come as a gauntlet (the
 * Spire's: candle-lights, a wrong answer snuffs one), and it ends at the only
 * question he has left, "What was my name?". Only a hero who has heard the
 * five memories (`name-learned`) can answer it (roadmap §8 decision 17).
 */

/** Umbra's questions before his own. */
export const NAME_QUESTIONS = 5;
/** Candle-lights for the gauntlet; the last one out sends the hero up to Glim's Nook. */
export const NAME_LIVES = 3;
/** How far above the hero's own level each question asks (the Spire's top floor asks +2). */
export const NAME_LEVEL_BONUS = 2;
/** The hero's reward, paid the first time only (like the Spire's, #109). */
export const NAME_CLEAR_XP = 600;

/** The answer — and the names Umbra might be mistaken for. */
export const NAME_ANSWER = 'Aster';
export const NAME_CHOICES: readonly string[] = ['Aster', 'Aurora', 'Lumen', 'Umbra'];

/** What Umbra says to a wrong name (gently: nothing is lost, pick again). */
export const WRONG_NAME_LINES: Record<string, string> = {
  Aurora: '"Aurora keeps the lamps. She was kind to me once." Umbra shakes his head. "That isn\'t my name."',
  Lumen: '"Lumen was the boy who asked the most questions." A tired smile. "That isn\'t my name."',
  Umbra: '"That is what the dark calls me." The shadow shivers. "It isn\'t the name I was given."',
};

/** XP for the gauntlet: every right answer, plus the reward on the first naming. */
export function nameClearXp(correct: number, perCorrect: number, namedBefore: boolean): number {
  return correct * perCorrect + (namedBefore ? 0 : NAME_CLEAR_XP);
}

/**
 * Umbra's questions come from everything Lumina forgot: `count` different
 * topics, picked at random from all of them (`rand` for tests).
 */
export function finaleTopics(count = NAME_QUESTIONS, rand: () => number = Math.random): Topic[] {
  const pool = [...ALL_TOPICS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}
