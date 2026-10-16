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
  /** Where it's for, in the error ("for this floor"). */
  where?: string;
}): Promise<Question[]> {
  const { topics, count, age, levelFor, flavor, where } = opts;
  // One spare a topic (16e code review round 2): one topic coming back short mustn't sink the run.
  const perTopic = Math.ceil(count / topics.length) + 1;
  const batches = (await Promise.all(topics.map((t) => fetchQuestions(t, age, levelFor(t), perTopic, flavor)))).map((b) => shuffle(b));
  // Fair to every topic (16e code review round 3: the spares let one topic crowd out another):
  // each topic's share first, then any shortfall from the spares, then shuffled together.
  // Which topics get one more is picked at random (16e code review round 4: the throne
  // floor's five questions from seven topics always skipped the last two).
  const share = Math.floor(count / topics.length);
  const lucky = new Set(shuffle(topics.map((_, i) => i)).slice(0, count % topics.length));
  const take = (i: number) => share + (lucky.has(i) ? 1 : 0);
  const picked = batches.flatMap((b, i) => b.slice(0, take(i)));
  const spares = shuffle(batches.flatMap((b, i) => b.slice(take(i))));
  const pool = [...picked, ...spares.slice(0, Math.max(0, count - picked.length))];
  if (pool.length < count) throw new Error(`only ${pool.length} of ${count} riddles came back${where ? ` ${where}` : ''}.`);
  return shuffle(pool);
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
