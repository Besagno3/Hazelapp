import { supabase } from './supabase';
import { errorMessage, resolveErrorMessage } from './errors';
import { useFamilyStore } from '../store/familyStore';
import { isStarterId, starterQuestions } from '../content/starterQuestions';
import type { Question, Topic } from '../types';
import type { FlavorId } from '../../supabase/functions/_shared/flavors';

export type { FlavorId } from '../../supabase/functions/_shared/flavors';

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

/**
 * The start of the edge function's error for a topic it doesn't accept
 * (generate-questions/index.ts — the two must keep the same wording).
 */
const UNKNOWN_TOPIC = 'topic must be one of';

/** What a child sees when their topic isn't ready on the server yet (#135). */
export const TOPIC_NOT_READY = "These questions aren't ready yet — pick another topic for now!";

/** Calls the generate-questions edge function and adapts the result. */
async function invokeGenerate(
  topic: Topic,
  age: number,
  skillLevel: number,
  count: number,
  flavor?: FlavorId,
  cacheOnly = false,
): Promise<Question[]> {
  // The kid playing (#124): their seen questions are their own. This app tells
  // the server what it shows (`markSeen`, #134), so a batch handed over here is
  // only held back, not counted as seen.
  const profileId = useFamilyStore.getState().activeKidId;
  const { data, error } = await supabase.functions.invoke('generate-questions', {
    body: {
      topic,
      age,
      skillLevel,
      count,
      reportsSeen: true,
      ...(flavor ? { flavor } : {}),
      // A look-ahead (B5): saved questions only, never a Claude call.
      ...(cacheOnly ? { cacheOnly: true } : {}),
      ...(profileId ? { profileId } : {}),
    },
  });
  // Surface the edge function's real {error, detail} body, not the generic
  // "non-2xx status code" message (see lib/errors.ts).
  if (error) {
    const reason = await resolveErrorMessage(error);
    // A topic the deployed function doesn't know yet (a new topic shipped
    // before `generate-questions` was redeployed, #135): no developer text for a child.
    if (reason.startsWith(UNKNOWN_TOPIC)) throw new Error(TOPIC_NOT_READY);
    throw new Error(`Question generation failed — ${reason}`);
  }

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

function cacheKey(topic: Topic, skillLevel: number, count: number, flavor?: FlavorId): string {
  // Per kid, so a batch warmed for one never goes to a sibling after a switch.
  return `${useFamilyStore.getState().activeKidId ?? ''}|${topic}|${skillLevel}|${count}|${flavor ?? ''}`;
}

export interface PrefetchOptions {
  /**
   * Saved questions only (B5): the server hands over what its bank already
   * has, never asking Claude, so warming a battle that may never happen
   * costs nothing. A short batch is finished when it's used.
   */
  cacheOnly?: boolean;
}

/** Warms a question request so it is ready before the screen needs it. */
export function prefetchQuestions(
  topic: Topic,
  age: number,
  skillLevel: number,
  count: number,
  flavor?: FlavorId,
  { cacheOnly = false }: PrefetchOptions = {},
): void {
  const key = cacheKey(topic, skillLevel, count, flavor);
  if (prefetched.has(key)) return;
  const promise = invokeGenerate(topic, age, skillLevel, count, flavor, cacheOnly);
  prefetched.set(key, promise);
  // Drop a failed prefetch so a real request retries cleanly; this also marks
  // the rejection handled if the prefetch is never consumed.
  promise.catch(() => prefetched.delete(key));
}

/** The server's questions, or none when it fails — the starters fill in (B5). */
async function fromServer(
  topic: Topic,
  age: number,
  skillLevel: number,
  count: number,
  flavor?: FlavorId,
): Promise<Question[]> {
  try {
    return await invokeGenerate(topic, age, skillLevel, count, flavor);
  } catch (e) {
    console.warn('Questions unavailable — using starter questions:', errorMessage(e));
    return [];
  }
}

/**
 * Gets questions for a topic — consuming a prefetched batch if one is waiting,
 * otherwise requesting fresh. `flavor` optionally names the adventure moment
 * (a gate, a spell, the Spire…) by key; the edge function picks its own words
 * for it, so no text from here reaches the prompt (Act I launch review B8). It
 * shapes freshly-generated questions only; cached reuse is unaffected (#37).
 *
 * Never fails and never comes back short (B5): a prefetched batch that's short
 * (a saved-questions-only look-ahead) is finished with a request for the rest,
 * and whatever the server can't give — it's down, offline, out of today's
 * budget, or doesn't know the topic yet — comes from the starter questions
 * (`content/starterQuestions.ts`).
 */
export async function fetchQuestions(
  topic: Topic,
  age: number,
  skillLevel: number,
  count = QUIZ_QUESTION_COUNT,
  flavor?: FlavorId,
): Promise<Question[]> {
  const key = cacheKey(topic, skillLevel, count, flavor);
  const pre = prefetched.get(key);
  let have: Question[] = [];
  if (pre) {
    prefetched.delete(key); // consume once
    have = await pre.catch(() => []); // failed: ask again below
    if (have.length >= count) return have;
  }
  const ids = new Set(have.map((q) => q.id));
  const more = await fromServer(topic, age, skillLevel, count - have.length, flavor);
  have = [...have, ...more.filter((q) => !ids.has(q.id))];
  if (have.length >= count) return have;
  return [...have, ...starterQuestions(topic, skillLevel, count - have.length).map((q) => shuffleAnswers(q))];
}

/**
 * Whether a question is in the server's question bank — not a starter
 * question (B5), nor one that failed to cache ("fresh-…").
 */
export function inQuestionBank(id: string): boolean {
  return !!id && !id.startsWith('fresh-') && !isStarterId(id);
}

/** Reasons surfaced in the flag UI; free-form `reason` strings are also accepted. */
export type FlagReason = 'not_for_kids' | 'wrong_answer' | 'confusing' | 'difficulty';

/**
 * Flags a question for review (B10). The reporting family never gets it again
 * (the edge function); everyone else stops getting it once it's held back for
 * review — at once for "not OK for kids", after three families for any other
 * reason (migration 0015's trigger). Sent as the kid playing — the
 * `question_flags` RLS policy only accepts one of the signed-in grown-up's
 * kids (#124).
 */
export async function flagQuestion(questionId: string, reason?: FlagReason): Promise<void> {
  // A starter question (B5), or one that failed to cache ("fresh-…"), isn't
  // in the server's bank, so the FK insert would fail. Treat as no-op.
  if (!inQuestionBank(questionId)) return;

  const profile_id = useFamilyStore.getState().activeKidId;
  if (!profile_id) throw new Error('Please sign in to flag a question.');

  const { error } = await supabase
    .from('question_flags')
    .insert({ question_id: questionId, profile_id, reason: reason ?? null });
  if (error) throw new Error(`Couldn't flag question — ${errorMessage(error)}`);
}
