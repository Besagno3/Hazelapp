import { useCallback, useEffect, useRef, useState } from 'react';
import { useBattleQuestions } from '../../hooks/useBattleQuestions';
import { carryOver, nextRoundQuestion, withSpareStarters, QUICK_WAIT_MS } from '../../lib/questions';
import { useFamilyStore } from '../../store/familyStore';
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
 *
 * Nothing the server hands over is wasted (#163 review): the round starts on
 * the questions an earlier round of the topic got too late, and what it can't
 * use — in once every slot is taken, or not asked when the kid leaves — is
 * carried over to the next (`carryOver`). `covered`: the round's saved
 * questions covered it, so nothing was written for it (#30) — its end asks
 * for the next round's the normal way (`warmNextRound`'s `fresh`).
 */
export function useQuizRound(topic: Topic, count: number, levelOverride?: number) {
  const { questions: pool, loading, covered, age, skillLevel } = useBattleQuestions(topic, count, levelOverride, undefined, { carry: true });
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

  // Nothing new in time: a starter question, so the round goes on — in the
  // kid's slot and any before it still empty. (The very first wait is
  // `quickQuestions`' own, which ends in starters by itself.)
  useEffect(() => {
    if (!waiting || loading) return;
    const t = setTimeout(() => setAsked((a) => withSpareStarters(a, number, topic, skillLevel)), QUICK_WAIT_MS);
    return () => clearTimeout(t);
  }, [waiting, loading, number, topic, skillLevel]);

  // What the round can't use goes to the kid's next round of the topic: once
  // every slot is taken, whatever else is in or comes in; when the kid leaves
  // mid-round, whatever wasn't asked. For the kid it was asked for, even
  // after a switch of player.
  const [kid] = useState(() => useFamilyStore.getState().activeKidId);
  const carried = useRef(new Set<string>());
  const unused = useRef<Question[]>([]);
  useEffect(() => {
    const ids = new Set(asked.map((q) => q.id));
    unused.current = pool.filter((q) => !ids.has(q.id) && !carried.current.has(q.id));
    if (asked.length < count) return;
    unused.current.forEach((q) => carried.current.add(q.id));
    carryOver(kid, topic, unused.current);
    unused.current = [];
  }, [pool, asked, count, kid, topic]);
  useEffect(() => {
    const left = unused;
    return () => carryOver(kid, topic, left.current);
  }, [kid, topic]);

  /**
   * On from question `from` — the one whose Next was tapped — to the next
   * (stays on the last). A second tap, on a question already left (it's
   * still sliding out), does nothing (#163 review).
   */
  const advance = useCallback((from: number) => setNumber((n) => (n === from ? Math.min(n + 1, count - 1) : n)), [count]);

  return { question: waiting ? null : asked[number], number, asked, waiting, advance, covered, age, skillLevel };
}
