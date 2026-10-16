import { fetchQuestions, type FlavorId } from './questions';
import type { Question, Topic } from '../types';

/**
 * A question gauntlet (the Spire's, pulled out for the Name finale, #75 item
 * 16e): one shuffled pool across several topics, each asked at its own level.
 * Every step needs a question, so a short pool is an error the caller can
 * retry — never a run that stalls.
 */
export async function loadGauntlet(opts: {
  topics: Topic[];
  count: number;
  age: number;
  levelFor: (t: Topic) => number;
  flavor: FlavorId;
}): Promise<Question[]> {
  const { topics, count, age, levelFor, flavor } = opts;
  const perTopic = Math.ceil(count / topics.length);
  const batches = await Promise.all(topics.map((t) => fetchQuestions(t, age, levelFor(t), perTopic, flavor)));
  const pool = shuffle(batches.flat());
  if (pool.length < count) throw new Error(`only ${pool.length} of ${count} riddles came back.`);
  return pool.slice(0, count);
}

/** What a snuffed candle says: the dark creeps closer, so many left. */
export function candleLine(remaining: number): string {
  return `A candle snuffs out — the dark creeps closer. ${remaining} light${remaining === 1 ? '' : 's'} left!`;
}

/** Fisher-Yates — a fair shuffle. */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
