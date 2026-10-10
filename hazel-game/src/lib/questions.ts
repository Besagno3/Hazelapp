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
  context?: string,
): Promise<Question[]> {
  const { data, error } = await supabase.functions.invoke('generate-questions', {
    body: { topic, age, skillLevel, count, ...(context ? { context } : {}) },
  });
  // Surface the edge function's real {error, detail} body, not the generic
  // "non-2xx status code" message (see lib/errors.ts).
  if (error) throw new Error(`Question generation failed — ${await resolveErrorMessage(error)}`);

  const api = (data?.questions ?? []) as ApiQuestion[];
  return api.map((q) =>
    shuffleAnswers({
      id: q.id,
      topic,
      level: q.level,
      text: q.text,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      timesAsked: q.timesAsked,
    }),
  );
}

/**
 * The same question with its options in a random order and `correctIndex`
 * following the right answer. The model that writes the questions tends to
 * put the right answer in the same spot (most often B), so a kid could learn
 * the position instead of the answer. Every question is shuffled as it
 * arrives — cached ones too, which were stored in the model's order — and the
 * Library shuffles again each time it re-asks a miss.
 */
export function shuffleAnswers<T extends Pick<Question, 'options' | 'correctIndex'>>(
  q: T,
  random: () => number = Math.random,
): T {
  // A malformed index would make every option wrong once shuffled; leave it be.
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) return q;
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...q, options: order.map((i) => q.options[i]), correctIndex: order.indexOf(q.correctIndex) };
}

// --- Prefetch cache ---------------------------------------------------------
// A consume-once promise cache: prefetchQuestions() starts a request ahead of
// time; fetchQuestions() uses a matching prefetched promise if one is waiting,
// otherwise it requests fresh. Entries are consumed (deleted) on use, so a
// repeat request triggers a new generation — the server re-randomises the
// cache/fresh mix on every call anyway.

const prefetched = new Map<string, Promise<Question[]>>();

function cacheKey(topic: Topic, skillLevel: number, count: number, context?: string): string {
  return `${topic}|${skillLevel}|${count}|${context ?? ''}`;
}

/** Warms a question request so it is ready before the screen needs it. */
export function prefetchQuestions(
  topic: Topic,
  age: number,
  skillLevel: number,
  count: number,
  context?: string,
): void {
  const key = cacheKey(topic, skillLevel, count, context);
  if (prefetched.has(key)) return;
  const promise = invokeGenerate(topic, age, skillLevel, count, context);
  prefetched.set(key, promise);
  // Drop a failed prefetch so a real request retries cleanly; this also marks
  // the rejection handled if the prefetch is never consumed.
  promise.catch(() => prefetched.delete(key));
}

/**
 * Gets questions for a topic — consuming a prefetched batch if one is waiting,
 * otherwise requesting fresh. `context` is an optional flavor hint forwarded
 * to the edge function (e.g. "a gatekeeper's challenge on a fantasy path") —
 * it shapes freshly-generated questions only; cached reuse is unaffected (#37).
 */
export async function fetchQuestions(
  topic: Topic,
  age: number,
  skillLevel: number,
  count = QUIZ_QUESTION_COUNT,
  context?: string,
): Promise<Question[]> {
  const key = cacheKey(topic, skillLevel, count, context);
  const pre = prefetched.get(key);
  if (pre) {
    prefetched.delete(key); // consume once
    return pre;
  }
  return invokeGenerate(topic, age, skillLevel, count, context);
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
