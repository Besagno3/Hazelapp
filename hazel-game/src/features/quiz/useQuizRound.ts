import { useCallback, useEffect, useState } from 'react';
import { useBattleQuestions } from '../../hooks/useBattleQuestions';
import { nextRoundQuestion, spareStarter, QUICK_WAIT_MS } from '../../lib/questions';
import type { Question, Topic } from '../../types';

/**
 * A quiz round without the wait (#163). The questions load the battle's way
 * (`useBattleQuestions`, #158): saved questions first — the next-round
 * look-ahead, or a saved-questions-only request, at most `QUICK_WAIT_MS` —
 * starter questions filling in for a thin, slow or down bank, and the rest
 * asked for while the kid answers. Each question is taken as the kid reaches
 * it: a bank question when one is in (they move the level and pay XP, #153),
 * else a starter, never one the round has asked. A kid who reaches one before
 * anything new has arrived waits (`waiting`: "One moment…") at most
 * `QUICK_WAIT_MS`, then gets a starter, so a round always finishes.
 */
export function useQuizRound(topic: Topic, count: number, levelOverride?: number) {
  const { questions: pool, loading, age, skillLevel } = useBattleQuestions(topic, count, levelOverride);
  /** The round's questions so far, in the order asked. */
  const [asked, setAsked] = useState<Question[]>([]);
  /** Where the kid is in the round, from 0. */
  const [number, setNumber] = useState(0);

  // At a question not taken yet: take the next one from the pool — now, or
  // in the render after something lands. (State set while rendering, React's
  // way for state that follows other state: no effect, no extra frame.)
  if (!loading && number < count && number >= asked.length) {
    const next = nextRoundQuestion(pool, asked);
    if (next) setAsked([...asked, next]);
  }
  const waiting = number >= asked.length;

  // Nothing new in time: a starter question, so the round goes on. (The very
  // first wait is `quickQuestions`' own, which ends in starters by itself.)
  useEffect(() => {
    if (!waiting || loading) return;
    const t = setTimeout(() => setAsked((a) => (a.length > number ? a : [...a, spareStarter(topic, skillLevel, a)])), QUICK_WAIT_MS);
    return () => clearTimeout(t);
  }, [waiting, loading, number, topic, skillLevel]);

  /** On to the next question (stays on the last). */
  const advance = useCallback(() => setNumber((n) => Math.min(n + 1, count - 1)), [count]);

  return { question: waiting ? null : asked[number], number, asked, waiting, advance, age, skillLevel };
}
