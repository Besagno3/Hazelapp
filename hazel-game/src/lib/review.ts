import { supabase } from './supabase';
import { errorMessage } from './errors';

/**
 * The owner's question review (#147): the review queue and decisions, through
 * migration 0019's admin functions. Only a grown-up listed in `public.admins`
 * gets anything; everyone else is refused by the database, not just hidden by
 * the app.
 */

/** Release (back into the game), approve (back, served first, harder to pull) or retire (never again). */
export type ReviewDecision = 'active' | 'approved' | 'retired';

export interface ReviewItem {
  id: string;
  topic: string;
  level: number;
  /** The age it was written for (null = saved before ages were stored). */
  age: number | null;
  /** 'review' = held back from everyone; 'active' / 'approved' = still shown, with new reports. */
  status: string;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  reports: number;
  families: number;
  notForKids: number;
  /** Report reasons, and what the checks found ("recheck: …"). */
  reasons: string[];
  lastReport: string | null;
}

/** Shown when the signed-in grown-up isn't an admin. */
export const NOT_AN_ADMIN = "Only the game's owner can review questions.";

/** Whether the signed-in grown-up may review questions. Any failure is a no. */
export async function isAdmin(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_admin');
    return !error && data === true;
  } catch {
    return false;
  }
}

interface QueueRow {
  id: string;
  topic: string;
  level: number;
  age: number | null;
  status: string;
  text: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  reports: number | string;
  families: number | string;
  not_for_kids: number | string;
  reasons: string[] | null;
  last_report: string | null;
}

/** What's waiting: held-back questions first, then live ones with new reports. */
export async function fetchReviewQueue(): Promise<ReviewItem[]> {
  const { data, error } = await supabase.rpc('admin_review_queue');
  if (error) {
    if (error.code === '42501') throw new Error(NOT_AN_ADMIN);
    throw new Error(`Couldn't load the review queue — ${errorMessage(error)}`);
  }
  return ((data ?? []) as QueueRow[]).map((r) => ({
    id: r.id,
    topic: r.topic,
    level: r.level,
    age: r.age,
    status: r.status,
    text: r.text,
    options: r.options,
    correctIndex: r.correct_index,
    explanation: r.explanation,
    // Counts arrive as bigint, which PostgREST may send as strings.
    reports: Number(r.reports),
    families: Number(r.families),
    notForKids: Number(r.not_for_kids),
    reasons: r.reasons ?? [],
    lastReport: r.last_report,
  }));
}

/** Decide a question; throws with a message to show. */
export async function reviewQuestion(id: string, decision: ReviewDecision): Promise<void> {
  const { error } = await supabase.rpc('admin_review_question', { p_question: id, p_status: decision });
  if (error) {
    if (error.code === '42501') throw new Error(NOT_AN_ADMIN);
    throw new Error(`Couldn't save that — ${errorMessage(error)}`);
  }
}

/** The report reasons in words; the checks' notes as they are. */
const REASON_WORDS: Record<string, string> = {
  not_for_kids: 'Not OK for kids',
  wrong_answer: 'Wrong answer',
  confusing: 'Confusing',
  difficulty: 'Too hard or too easy',
};
export function reasonLabel(reason: string): string {
  // A check's note arrives as "recheck: <note>" (the queue's label for it, 0017).
  if (reason.startsWith('recheck: ')) return `🔎 ${reason.slice('recheck: '.length)}`;
  return REASON_WORDS[reason] ?? reason;
}
