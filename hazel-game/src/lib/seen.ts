import { supabase } from './supabase';
import { errorMessage } from './errors';
import { useFamilyStore } from '../store/familyStore';

/**
 * Tells the server which questions the kid playing has actually seen (#130).
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

let pending: { kid: string; ids: Set<string> } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Ids already sent for this kid this session: a battle asks its 9 again and again. */
let sent: { kid: string; ids: Set<string> } | null = null;

/** Notes that a question is on screen for the kid playing now. */
export function markSeen(questionId: string): void {
  // Synthetic ids ("fresh-…") are questions that failed to cache: not in the bank.
  if (!questionId || questionId.startsWith('fresh-')) return;
  const kid = useFamilyStore.getState().activeKidId;
  if (!kid) return;
  if (sent?.kid !== kid) sent = { kid, ids: new Set() };
  if (sent.ids.has(questionId)) return;
  sent.ids.add(questionId);
  // A switch of player: send the last kid's first, as theirs.
  if (pending && pending.kid !== kid) flushSeen();
  if (!pending) pending = { kid, ids: new Set() };
  pending.ids.add(questionId);
  if (pending.ids.size >= SEEN_BATCH_MAX) flushSeen();
  else if (!timer) timer = setTimeout(flushSeen, SEEN_FLUSH_MS);
}

/** Sends whatever is waiting now (also on a timer, and when a batch fills). */
export function flushSeen(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const batch = pending;
  pending = null;
  if (!batch || batch.ids.size === 0) return;
  void sendSeen(batch.kid, [...batch.ids]);
}

async function sendSeen(kid: string, ids: string[]): Promise<void> {
  try {
    const { error } = await supabase.rpc('mark_questions_seen', { p_profile: kid, p_ids: ids });
    if (error) console.error('Could not mark questions seen:', errorMessage(error));
  } catch (e) {
    console.error('Could not mark questions seen:', errorMessage(e));
  }
}
