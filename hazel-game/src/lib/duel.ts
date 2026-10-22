import { QUIZ_QUESTION_COUNT, spareStarter } from './questions';
import type { Question, Topic } from '../types';

/**
 * 🆚 Quiz Duel (#177): two players on one screen take turns — the kid playing
 * first, then Player 2, round and round — each answering questions at their
 * own level, so a 6-year-old and a 12-year-old (or a grown-up) play fair.
 * The most right answers wins. Pure rules here; the screen is
 * `features/duel/QuizDuel.tsx`.
 */

/** Questions each player answers in a duel — a quiz round's worth. */
export const DUEL_QUESTIONS_EACH = QUIZ_QUESTION_COUNT;

/** Which player: 0 the kid playing, 1 Player 2. */
export type SeatIndex = 0 | 1;

/** The two players' lists of something, in seat order. */
export type BySeat<T> = [T, T];

/** Turns in a whole duel. */
export const DUEL_TURNS = 2 * DUEL_QUESTIONS_EACH;

/** Whose turn number `turn` (from 0) is, and which of their questions it is (from 0). */
export function duelTurn(turn: number): { seat: SeatIndex; number: number } {
  return { seat: (turn % 2) as SeatIndex, number: Math.floor(turn / 2) };
}

/** The other player. */
export function otherSeat(seat: SeatIndex): SeatIndex {
  return seat === 0 ? 1 : 0;
}

/** Right answers per player. */
export function duelScores(answers: BySeat<boolean[]>): BySeat<number> {
  return [answers[0].filter(Boolean).length, answers[1].filter(Boolean).length];
}

/** Who won: the player with more right answers, or a tie. */
export function duelWinner(scores: BySeat<number>): SeatIndex | 'tie' {
  if (scores[0] === scores[1]) return 'tie';
  return scores[0] > scores[1] ? 0 : 1;
}

/** Every question the duel has asked, both players' — so neither is asked one the other was. */
export function allAsked(asked: BySeat<Question[]>): Question[] {
  return [...asked[0], ...asked[1]];
}

/**
 * `asked` with starter questions in `seat`'s slot `number` and any of theirs
 * before it still empty — none either player has had — and unchanged when a
 * question already came for it (one landing in the same tick as the timer).
 */
export function withDuelStarters(asked: BySeat<Question[]>, seat: SeatIndex, number: number, topic: Topic, skillLevel: number): BySeat<Question[]> {
  let mine = asked[seat];
  while (mine.length <= number) {
    const both: BySeat<Question[]> = seat === 0 ? [mine, asked[1]] : [asked[0], mine];
    mine = [...mine, spareStarter(topic, skillLevel, allAsked(both))];
  }
  if (mine === asked[seat]) return asked;
  return seat === 0 ? [mine, asked[1]] : [asked[0], mine];
}
