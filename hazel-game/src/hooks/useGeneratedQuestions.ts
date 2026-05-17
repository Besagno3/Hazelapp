import { useCallback, useEffect, useState } from 'react';
import { fetchQuestions } from '../lib/questions';
import { calcAge, skillLevelFor } from '../lib/age';
import { useProfileStore } from '../store/profileStore';
import type { Question, Topic } from '../types';

/** Age used when no profile is loaded (e.g. the migration isn't applied yet). */
const DEFAULT_AGE = 10;

/** A fetch result tagged with the request it belongs to. */
interface Result {
  key: string;
  questions: Question[];
  error: string | null;
}

/**
 * Loads AI-generated questions for a topic. Difficulty is the player's
 * per-topic skill level by default, or `levelOverride` when given (e.g. an
 * NPC's level in a battle). `loading` is derived from a request/result key
 * mismatch rather than set inside the effect.
 */
export function useGeneratedQuestions(topic: Topic, count: number, levelOverride?: number) {
  const profile = useProfileStore((s) => s.profile);
  const age = profile ? calcAge(profile.birthYear, profile.birthMonth) : DEFAULT_AGE;
  const skillLevel = levelOverride ?? skillLevelFor(profile?.skillLevels ?? {}, topic, age);

  const [attempt, setAttempt] = useState(0);
  const requestKey = `${topic}|${age}|${skillLevel}|${count}|${attempt}`;

  const [result, setResult] = useState<Result>({ key: '', questions: [], error: null });
  const loading = result.key !== requestKey;

  useEffect(() => {
    let active = true;
    fetchQuestions(topic, age, skillLevel, count)
      .then((qs) => {
        if (!active) return;
        setResult({
          key: requestKey,
          questions: qs,
          error: qs.length === 0 ? 'No questions were returned. Please try again.' : null,
        });
      })
      .catch((e) => {
        if (!active) return;
        setResult({
          key: requestKey,
          questions: [],
          error: e instanceof Error ? e.message : 'Could not load questions.',
        });
      });
    return () => {
      active = false;
    };
  }, [requestKey, topic, age, skillLevel, count]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);

  return {
    questions: result.questions,
    loading,
    error: loading ? null : result.error,
    age,
    skillLevel,
    reload,
  };
}
