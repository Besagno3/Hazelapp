import { useCallback, useEffect, useState } from 'react';
import { moreQuestions, quickQuestions } from '../lib/questions';
import { playerAge, skillLevelFor } from '../lib/age';
import { useProfileStore } from '../store/profileStore';
import type { Question, Topic } from '../types';

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
 * it arrives. Same shape as `useGeneratedQuestions`; it never errors.
 */
export function useBattleQuestions(topic: Topic, count: number, levelOverride?: number) {
  const profile = useProfileStore((s) => s.profile);
  const age = playerAge(profile);
  const skillLevel = levelOverride ?? skillLevelFor(profile?.skillLevels ?? {}, topic, age);

  const [attempt, setAttempt] = useState(0);
  const requestKey = `${topic}|${age}|${skillLevel}|${count}|${attempt}`;

  const [pool, setPool] = useState<Pool>({ key: '', questions: [] });
  const loading = pool.key !== requestKey;

  useEffect(() => {
    let active = true;
    quickQuestions(topic, age, skillLevel, count)
      .then((first) => {
        if (!active) return;
        setPool({ key: requestKey, questions: first });
        return moreQuestions(topic, age, skillLevel, count, first).then((rest) => {
          if (!active || rest.length === 0) return;
          setPool((p) => (p.key === requestKey ? { key: p.key, questions: [...p.questions, ...rest] } : p));
        });
      })
      .catch((e) => console.error('Battle questions failed:', e));
    return () => {
      active = false;
    };
  }, [requestKey, topic, age, skillLevel, count]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);

  return { questions: pool.questions, loading, error: null as string | null, age, skillLevel, reload };
}
