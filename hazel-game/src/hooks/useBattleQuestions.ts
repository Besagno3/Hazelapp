import { useCallback, useEffect, useState } from 'react';
import {
  carryOver,
  moreQuestions,
  quickQuestions,
  shuffleAnswers,
  takeCarried,
  waitFor,
  BATTLE_START_FILL,
  QUICK_WAIT_MS,
} from '../lib/questions';
import { isStarterId, starterQuestions } from '../content/starterQuestions';
import { playerAge, skillLevelFor } from '../lib/age';
import { errorMessage } from '../lib/errors';
import { useFamilyStore } from '../store/familyStore';
import { useProfileStore } from '../store/profileStore';
import type { Question, QuestionSeat, Topic } from '../types';
import type { FlavorId } from '../../supabase/functions/_shared/flavors';

/** An `off` pool's questions: always the same empty list. */
const NO_QUESTIONS: Question[] = [];

/** A battle's pool, tagged with the request it belongs to. */
interface Pool {
  key: string;
  questions: Question[];
  /** The quiz's: its bank questions covered the round, so nothing more was asked of the server. */
  covered?: boolean;
}

/**
 * A battle's questions without the wait (#158). `loading` lasts only until
 * the first saved questions are in (`quickQuestions`: a look-ahead warmed on
 * entering the zone, or a saved-questions-only request — no Claude call, at
 * most `QUICK_WAIT_MS`); the battle starts on those, and the rest of the
 * batch (`moreQuestions`, which may ask Claude) is added to `questions` when
 * it arrives. A saved batch that came too late to start with is added when
 * it lands, and the rest are only asked for once it has (or a little later),
 * so nothing the server handed over is wasted. It never errors. The spell
 * pool uses it too (`flavor` 'spell'), so spells are ready as soon as the
 * battle is, and so does the Training Grounds quiz (`useQuizRound`, #163),
 * with `carry` (#163 review): it starts on the questions an earlier round of
 * the topic was handed too late (`takeCarried`), keeps any that land once it's
 * done with for the next round (`carryOver`), and says when its bank covered
 * the round (`covered`), so nothing was written for it — the round's end then
 * asks for the next one's the normal way, ~1 fresh (`warmNextRound`, #30).
 * With `seat` the pool is for someone else (`QuestionSeat`, #186): a duel's
 * or a co-op battle's Player 2. `off`: no pool at all, nothing asked for (a
 * battle's Player 2 pools when nobody plays beside the hero, #187).
 */
export function useBattleQuestions(
  topic: Topic,
  count: number,
  levelOverride?: number,
  flavor?: FlavorId,
  { carry = false, seat, off = false }: { carry?: boolean; seat?: QuestionSeat; off?: boolean } = {},
) {
  const profile = useProfileStore((s) => s.profile);
  const age = seat?.age ?? playerAge(profile);
  const skillLevel = levelOverride ?? seat?.skillLevel ?? skillLevelFor(profile?.skillLevels ?? {}, topic, age);
  const seatKid = seat?.kid ?? null;

  const [attempt, setAttempt] = useState(0);
  const requestKey = off ? 'off' : `${seatKid ?? ''}|${topic}|${age}|${skillLevel}|${count}|${attempt}`;

  const [pool, setPool] = useState<Pool>({ key: '', questions: [] });
  const loading = !off && pool.key !== requestKey;

  useEffect(() => {
    if (off) return;
    let active = true;
    // The kid this pool is for: what lands after a switch of player is theirs.
    const kid = seatKid ?? useFamilyStore.getState().activeKidId;
    const carried = carry ? takeCarried(topic, skillLevel, count, kid) : [];
    // What this request's pool holds, kept beside the state so additions can
    // skip questions already in it.
    let have: Question[] = [];
    const add = (qs: Question[]) => {
      if (!active) {
        // Landed once the pool is done with: the quiz keeps them for its next round.
        if (carry) carryOver(kid, topic, qs);
        return;
      }
      const ids = new Set(have.map((q) => q.id));
      const fresh = qs.filter((q) => !ids.has(q.id));
      if (fresh.length === 0) return;
      have = [...have, ...fresh];
      setPool((p) => (p.key === requestKey ? { key: p.key, questions: [...p.questions, ...fresh] } : p));
    };
    // Neither request ever fails (starter questions fill in), so a failure
    // here is a bug: logged in words, never shown — neither the battle nor the
    // quiz has an error screen any more (#158, #163).
    (async () => {
      const { questions: first, late } = await quickQuestions(topic, age, skillLevel, count, carry ? { flavor, have: carried, kid } : { flavor, kid });
      if (!active) {
        add(first);
        late.then(add);
        return;
      }
      have = first;
      setPool({ key: requestKey, questions: first });
      late.then(add);
      // A saved batch that was too slow to start with is on its way: give it a
      // little longer, so the rest aren't asked for twice.
      await Promise.race([late, waitFor(QUICK_WAIT_MS)]);
      if (!active) return;
      // A bank that covers the quiz's round asks nothing more for it: the
      // round's end asks for the next one's instead (one of them fresh, #30).
      if (carry && have.filter((q) => !isStarterId(q.id)).length >= count) setPool((p) => (p.key === requestKey ? { ...p, covered: true } : p));
      else add(await moreQuestions(topic, age, skillLevel, count, have, flavor, kid));
    })().catch((e) => {
      console.warn('Questions failed to load:', errorMessage(e));
      if (!active) return add(carried);
      // Never a wait for ever (#163 review): with no pool yet, starter questions.
      const starters = starterQuestions(topic, skillLevel, Math.min(count, BATTLE_START_FILL)).map((q) => shuffleAnswers(q));
      setPool((p) => (p.key === requestKey ? p : { key: requestKey, questions: [...carried, ...starters] }));
    });
    return () => {
      active = false;
    };
  }, [requestKey, topic, age, skillLevel, count, flavor, carry, seatKid, off]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);

  return { questions: off ? NO_QUESTIONS : pool.questions, loading, covered: !loading && pool.covered === true, error: null as string | null, age, skillLevel, reload };
}
