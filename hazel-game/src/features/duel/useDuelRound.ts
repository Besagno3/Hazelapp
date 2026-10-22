import { useEffect, useRef, useState } from 'react';
import { useBattleQuestions } from '../../hooks/useBattleQuestions';
import { carryOver, nextRoundQuestion, QUICK_WAIT_MS } from '../../lib/questions';
import { allAsked, duelTurn, withDuelStarters, DUEL_QUESTIONS_EACH, DUEL_TURNS, type BySeat } from '../../lib/duel';
import { useFamilyStore } from '../../store/familyStore';
import type { Seat } from '../../lib/playerTwo';
import type { Question, Topic } from '../../types';

/**
 * A 🆚 Quiz Duel's questions (#177): one pool per player, loaded the quiz's way
 * (`useBattleQuestions`, #158/#163 — saved questions at once, starters for a
 * thin or slow bank, the rest while they play), each at that player's own
 * level and asked for as them (`Seat`: a family kid's own id; a guest under
 * the kid playing's). Turns go the kid playing, then Player 2, round and round;
 * each turn takes its question as it's reached, never one either player has
 * had (a guest at the same level shares the kid playing's pool), and a player
 * who reaches a question before anything new has come waits at most
 * `QUICK_WAIT_MS`, then gets a starter, so a duel always finishes.
 *
 * What a pool can't use is kept for that kid's next round of the topic
 * (`carryOver`, #163 review), once they've had their five or the duel ends.
 */
export function useDuelRound(topic: Topic, seats: BySeat<Seat>) {
  const pools: BySeat<ReturnType<typeof useBattleQuestions>> = [
    useBattleQuestions(topic, DUEL_QUESTIONS_EACH, undefined, undefined, { carry: true, seat: seats[0] }),
    useBattleQuestions(topic, DUEL_QUESTIONS_EACH, undefined, undefined, { carry: true, seat: seats[1] }),
  ];
  /** Each player's questions so far, in the order asked. */
  const [asked, setAsked] = useState<BySeat<Question[]>>([[], []]);
  /** Whose turn, from 0; `DUEL_TURNS` once everyone has answered. */
  const [turn, setTurn] = useState(0);
  const finished = turn >= DUEL_TURNS;
  const { seat, number } = duelTurn(Math.min(turn, DUEL_TURNS - 1));
  const pool = pools[seat];

  // At a question not taken yet: take the next one from this player's pool —
  // now, or in the render after something lands (state set while rendering,
  // as `useQuizRound` does).
  if (!finished && !pool.loading && number >= asked[seat].length) {
    const next = nextRoundQuestion(pool.questions, allAsked(asked));
    if (next) setAsked(seat === 0 ? [[...asked[0], next], asked[1]] : [asked[0], [...asked[1], next]]);
  }
  const waiting = !finished && number >= asked[seat].length;

  // Nothing new in time: a starter, so the duel goes on. (A pool's very first
  // wait is `quickQuestions`' own, which ends in starters by itself.)
  const level = seats[seat].skillLevel;
  useEffect(() => {
    if (!waiting || pool.loading) return;
    const t = setTimeout(() => setAsked((a) => withDuelStarters(a, seat, number, topic, level)), QUICK_WAIT_MS);
    return () => clearTimeout(t);
  }, [waiting, pool.loading, seat, number, topic, level]);

  // What a pool can't use goes to its kid's next round of the topic: once
  // they've had all theirs, whatever else is in or comes in; when the duel is
  // left, whatever wasn't asked.
  const [kids] = useState<BySeat<string | null>>(() => {
    const active = useFamilyStore.getState().activeKidId;
    return [seats[0].kid ?? active, seats[1].kid ?? active];
  });
  const carried = useRef(new Set<string>());
  const unused = useRef<BySeat<Question[]>>([[], []]);
  const [pool0, pool1] = [pools[0].questions, pools[1].questions];
  useEffect(() => {
    const ids = new Set(allAsked(asked).map((q) => q.id));
    ([pool0, pool1] as const).forEach((qs, s) => {
      const left = qs.filter((q) => !ids.has(q.id) && !carried.current.has(q.id));
      if (asked[s].length < DUEL_QUESTIONS_EACH) {
        unused.current[s] = left;
        return;
      }
      left.forEach((q) => carried.current.add(q.id));
      carryOver(kids[s], topic, left);
      unused.current[s] = [];
    });
  }, [pool0, pool1, asked, kids, topic]);
  useEffect(() => {
    const left = unused;
    return () => {
      carryOver(kids[0], topic, left.current[0]);
      carryOver(kids[1], topic, left.current[1]);
    };
  }, [kids, topic]);

  /** On from turn `from` — the one whose Next was tapped — to the next; a second tap does nothing. */
  const advance = (from: number) => setTurn((t) => (t === from ? t + 1 : t));

  return { turn, seat, number, question: waiting || finished ? null : asked[seat][number], waiting, asked, finished, advance };
}
