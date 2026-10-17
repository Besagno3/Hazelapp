import { useCallback, useEffect, useState } from 'react';
import { moreQuestions, quickQuestions, waitFor, QUICK_WAIT_MS } from '../lib/questions';
import { playerAge, skillLevelFor } from '../lib/age';
import { useProfileStore } from '../store/profileStore';
import type { Question, Topic } from '../types';
import type { FlavorId } from '../../supabase/functions/_shared/flavors';

/** A battle's pool, tagged with the request it belongs to. */
interface Pool {
  key: string;
  questions: Question[];
}

/**
 * A battle's questions without the wait (#158). `loading` lasts only until
 * the first saved questions are in (`quickQuestions`: a look-ahead warmed on
 * entering the zone, or a saved-questions-only request — no Claude call, at
 * most `QUICK_WAIT_MS`); the battle starts on those, and the rest of the
 * batch (`moreQuestions`, which may ask Claude) is added to `questions` when
 * it arrives. A saved batch that came too late to start with is added when
 * it lands, and the rest are only asked for once it has (or a little later),
 * so nothing the server handed over is wasted. Same shape as
 * `useGeneratedQuestions`; it never errors. The spell pool uses it too
 * (`flavor` 'spell'), so spells are ready as soon as the battle is.
 */
export function useBattleQuestions(topic: Topic, count: number, levelOverride?: number, flavor?: FlavorId) {
  const profile = useProfileStore((s) => s.profile);
  const age = playerAge(profile);
  const skillLevel = levelOverride ?? skillLevelFor(profile?.skillLevels ?? {}, topic, age);

  const [attempt, setAttempt] = useState(0);
  const requestKey = `${topic}|${age}|${skillLevel}|${count}|${attempt}`;

  const [pool, setPool] = useState<Pool>({ key: '', questions: [] });
  const loading = pool.key !== requestKey;

  useEffect(() => {
    let active = true;
    // What this request's pool holds, kept beside the state so additions can
    // skip questions already in it.
    let have: Question[] = [];
    const add = (qs: Question[]) => {
      if (!active) return;
      const ids = new Set(have.map((q) => q.id));
      const fresh = qs.filter((q) => !ids.has(q.id));
      if (fresh.length === 0) return;
      have = [...have, ...fresh];
      setPool((p) => (p.key === requestKey ? { key: p.key, questions: [...p.questions, ...fresh] } : p));
    };
    (async () => {
      const { questions: first, late } = await quickQuestions(topic, age, skillLevel, count, { flavor });
      if (!active) return;
      have = first;
      setPool({ key: requestKey, questions: first });
      late.then(add);
      // A saved batch that was too slow to start with is on its way: give it a
      // little longer, so the rest aren't asked for twice.
      await Promise.race([late, waitFor(QUICK_WAIT_MS)]);
      if (!active) return;
      add(await moreQuestions(topic, age, skillLevel, count, have, flavor));
    })().catch((e) => console.error('Battle questions failed:', e));
    return () => {
      active = false;
    };
  }, [requestKey, topic, age, skillLevel, count, flavor]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);

  return { questions: pool.questions, loading, error: null as string | null, age, skillLevel, reload };
}
