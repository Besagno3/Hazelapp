import { supabase } from './supabase';
import { errorMessage } from './errors';
import { useFamilyStore } from '../store/familyStore';
import { isStarterId } from '../content/starterQuestions';

/**
 * Tells the server which questions the kid playing has actually seen (#134).
 * The question function only holds back what it hands over for an hour (a
 * batch fetched ahead for a battle that never happens shouldn't count); a
 * question counts as seen, and stays out of that kid's next batches in the
 * topic, once it's been on screen. Ids are gathered and sent together a moment
 * later (`mark_questions_seen`, migration 0015) — best-effort: a failed send is
 * logged, and the question is simply eligible again after the hold.
 */

/** How long ids wait to be sent together. */
export const SEEN_FLUSH_MS = 1500;
/** `mark_questions_seen` takes at most this many ids a call. */
export const SEEN_BATCH_MAX = 20;
/**
 * A question shown again sooner than this isn't sent again (a battle asks its
 * 9 round and round); later it is, so it stays in the kid's recent window.
 * The server skips a repeat within the same half hour too.
 */
export const SEEN_RESEND_MS = 30 * 60 * 1000;

/** Ids waiting to be sent, per kid (a duel shows two kids' questions in turn, #177). */
const pending = new Map<string, Set<string>>();
let timer: ReturnType<typeof setTimeout> | null = null;
/** When each id was last sent, per kid. */
const sent = new Map<string, Map<string, number>>();

/**
 * Notes that a question is on screen for the kid playing now — or for `kid`,
 * a duel's or a co-op battle's Player 2 (#177), whose questions are their own.
 */
export function markSeen(questionId: string, kid: string | null = useFamilyStore.getState().activeKidId): void {
  // Starter questions (B5) and ones that failed to cache ("fresh-…") aren't in the bank.
  if (!questionId || questionId.startsWith('fresh-') || isStarterId(questionId)) return;
  if (!kid) return;
  let at = sent.get(kid);
  if (!at) sent.set(kid, (at = new Map()));
  const now = Date.now();
  const last = at.get(questionId);
  if (last !== undefined && now - last < SEEN_RESEND_MS) return;
  at.set(questionId, now);
  let ids = pending.get(kid);
  if (!ids) pending.set(kid, (ids = new Set()));
  ids.add(questionId);
  if (ids.size >= SEEN_BATCH_MAX) flushSeen();
  else if (!timer) timer = setTimeout(flushSeen, SEEN_FLUSH_MS);
}

/** Sends whatever is waiting now, each kid's as theirs (also on a timer, and when a batch fills). */
export function flushSeen(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const batches = [...pending];
  pending.clear();
  for (const [kid, ids] of batches) if (ids.size > 0) void sendSeen(kid, [...ids]);
}

async function sendSeen(kid: string, ids: string[]): Promise<void> {
  let failure: unknown;
  try {
    ({ error: failure } = await supabase.rpc('mark_questions_seen', { p_profile: kid, p_ids: ids }));
  } catch (e) {
    failure = e;
  }
  if (!failure) return;
  console.error('Could not mark questions seen:', errorMessage(failure));
  // Not sent after all: the next time one of them shows, try again.
  const at = sent.get(kid);
  if (at) for (const id of ids) at.delete(id);
}
