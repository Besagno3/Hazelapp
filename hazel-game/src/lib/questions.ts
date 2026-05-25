import { supabase } from './supabase';
import { errorMessage, resolveErrorMessage } from './errors';
import type { Question, Topic } from '../types';

/** Questions per quiz round. */
export const QUIZ_QUESTION_COUNT = 5;
/** Questions fetched per battle (cycled across the battle's rounds). */
export const BATTLE_QUESTION_COUNT = 9;

/** A question as returned by the generate-questions edge function. */
interface ApiQuestion {
  id: string;
  level: number;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  timesAsked: number;
}

/** Calls the generate-questions edge function and adapts the result. */
async function invokeGenerate(
  topic: Topic,
  age: number,
  skillLevel: number,
  count: number,
): Promise<Question[]> {
  const { data, error } = await supabase.functions.invoke('generate-questions', {
    body: { topic, age, skillLevel, count },
  });
  // Surface the edge function's real {error, detail} body, not the generic
  // "non-2xx status code" message (see lib/errors.ts).
  if (error) throw new Error(`Question generation failed — ${await resolveErrorMessage(error)}`);

  const api = (data?.questions ?? []) as ApiQuestion[];
  return api.map((q) => ({
    id: q.id,
    topic,
    level: q.level,
    text: q.text,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    timesAsked: q.timesAsked,
  }));
}

// --- Prefetch cache ---------------------------------------------------------
// A consume-once promise cache: prefetchQuestions() starts a request ahead of
// time; fetchQuestions() uses a matching prefetched promise if one is waiting,
// otherwise it requests fresh. Entries are consumed (deleted) on use, so a
// repeat request triggers a new generation — the server re-randomises the
// cache/fresh mix on every call anyway.

const prefetched = new Map<string, Promise<Question[]>>();

function cacheKey(topic: Topic, skillLevel: number, count: number): string {
  return `${topic}|${skillLevel}|${count}`;
}

/** Warms a question request so it is ready before the screen needs it. */
export function prefetchQuestions(
  topic: Topic,
  age: number,
  skillLevel: number,
  count: number,
): void {
  const key = cacheKey(topic, skillLevel, count);
  if (prefetched.has(key)) return;
  const promise = invokeGenerate(topic, age, skillLevel, count);
  prefetched.set(key, promise);
  // Drop a failed prefetch so a real request retries cleanly; this also marks
  // the rejection handled if the prefetch is never consumed.
  promise.catch(() => prefetched.delete(key));
}

/**
 * Gets questions for a topic — consuming a prefetched batch if one is waiting,
 * otherwise requesting fresh.
 */
export async function fetchQuestions(
  topic: Topic,
  age: number,
  skillLevel: number,
  count = QUIZ_QUESTION_COUNT,
): Promise<Question[]> {
  const key = cacheKey(topic, skillLevel, count);
  const pre = prefetched.get(key);
  if (pre) {
    prefetched.delete(key); // consume once
    return pre;
  }
  return invokeGenerate(topic, age, skillLevel, count);
}

/** Reasons surfaced in the flag UI; free-form `reason` strings are also accepted. */
export type FlagReason = 'wrong_answer' | 'confusing' | 'difficulty';

/**
 * Flags a question for review. Any single flag quarantines the question from
 * the cache pool (see edge function). Requires an authenticated session — the
 * `question_flags` RLS policy enforces `profile_id = auth.uid()`.
 */
export async function flagQuestion(questionId: string, reason?: FlagReason): Promise<void> {
  // Synthetic IDs ("fresh-…") come from a question that failed to cache; it
  // doesn't exist server-side, so the FK insert would fail. Treat as no-op.
  if (questionId.startsWith('fresh-')) return;

  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw new Error(`Couldn't flag question — ${errorMessage(authErr)}`);
  const profile_id = userData?.user?.id;
  if (!profile_id) throw new Error('Please sign in to flag a question.');

  const { error } = await supabase
    .from('question_flags')
    .insert({ question_id: questionId, profile_id, reason: reason ?? null });
  if (error) throw new Error(`Couldn't flag question — ${errorMessage(error)}`);
}
