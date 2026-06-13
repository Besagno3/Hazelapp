import { useCallback, useEffect, useState } from 'react';
import { fetchQuestions } from '../lib/questions';
import { errorMessage } from '../lib/errors';
import { playerAge, skillLevelFor } from '../lib/age';
import { useProfileStore } from '../store/profileStore';
import type { Question, Topic } from '../types';

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
  const age = playerAge(profile);
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
        console.error('Question generation failed:', e);
        setResult({ key: requestKey, questions: [], error: errorMessage(e) });
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
