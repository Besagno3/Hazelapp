import { supabase } from './supabase';
import { errorMessage } from './errors';
import { plainErrorOr } from './familyErrors';
import { grownUpsLocked } from './grownUpsGate';
import { screenQuestion } from '../../supabase/functions/_shared/questionScreen';

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

/**
 * Plain words for the review pages (#130 S6): "only the owner" and a refused
 * fix as they are, else the trouble or `fallback`; the caller logs the raw error.
 */
export function reviewTrouble(err: unknown, fallback: string): string {
  if (err instanceof FixRefused) return err.message;
  if (err instanceof Error && err.message === NOT_AN_ADMIN) return NOT_AN_ADMIN;
  return plainErrorOr(err, fallback);
}

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
    // 👪 Grown-ups locked again (#167): kept recognisable, so the gate is asked for.
    if (grownUpsLocked(error)) throw Object.assign(new Error(error.message), { code: error.code });
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

/** A fix the database (or the screening) refused: its message is plain words to show as they are. */
export class FixRefused extends Error {}

/** A question as the owner corrects it (migration 0028). */
export interface QuestionFix {
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
}

/** Plain words for why screenQuestion would never serve a fix (`_shared/questionScreen.ts`). */
const SCREEN_WORDS: Record<string, string> = {
  'no question text': 'The question needs words.',
  'question too long': 'The question is too long (220 characters at most).',
  'not 4 options': 'A question needs exactly four answers.',
  'an empty option': 'Every answer needs words.',
  'an option too long': 'An answer is too long (80 characters at most).',
  'two options the same': 'Two answers are the same.',
  'no right answer': 'Pick the right answer.',
  'explanation too long': 'The explanation is too long (280 characters at most).',
  'a link, email or phone number': 'Take out the link, email or phone number.',
  'a word not for kids': 'A word in it is on the not-for-kids list.',
  'points at an option by its place': 'The answers get shuffled, so don\'t point at one by its place ("all of the above", "B").',
};

/**
 * Why the game would refuse this fix, in words, or null when it would serve
 * it: the same screenQuestion the edge function runs on every saved question
 * as it serves it, so the owner hears now rather than the question quietly
 * never showing.
 */
export function fixProblem(fix: QuestionFix): string | null {
  const why = screenQuestion({
    text: fix.text.trim(),
    options: fix.options.map((o) => o.trim()),
    correctIndex: fix.correctIndex,
    explanation: fix.explanation?.trim() || null,
  });
  return why === null ? null : (SCREEN_WORDS[why] ?? `The game would refuse it: ${why}.`);
}

/** Save a corrected question (it's approved, migration 0028); throws with a message to show. */
export async function fixQuestion(id: string, fix: QuestionFix): Promise<void> {
  const problem = fixProblem(fix);
  if (problem) throw new FixRefused(problem);
  const { error } = await supabase.rpc('admin_fix_question', {
    p_question: id,
    p_text: fix.text.trim(),
    p_options: fix.options.map((o) => o.trim()),
    p_correct_index: fix.correctIndex,
    p_explanation: fix.explanation?.trim() || null,
  });
  if (error) {
    if (error.code === '42501') throw new Error(NOT_AN_ADMIN);
    if (grownUpsLocked(error)) throw Object.assign(new Error(error.message), { code: error.code });
    // The database's own checks (0028) say what's wrong in words.
    if (error.code === '22023') throw new FixRefused(`${error.message.charAt(0).toUpperCase()}${error.message.slice(1)}.`);
    if (error.code === 'P0002') throw new FixRefused('That question is gone — it was retired or removed. Refresh the list.');
    throw new Error(`Couldn't save the fix — ${errorMessage(error)}`);
  }
}

/** A question in the bank, as 📚 Browse shows it (migration 0028). */
export interface BankQuestion {
  id: string;
  topic: string;
  level: number;
  age: number | null;
  /** 'active', 'approved', 'review' (held back) or 'retired'. */
  status: string;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  timesAsked: number;
  reports: number;
  createdAt: string;
}

export interface BankFilter {
  topic?: string;
  level?: number;
  status?: string;
  search?: string;
}

/** How many questions 📚 Browse loads at a time. */
export const BANK_PAGE = 50;

interface BankRow {
  id: string;
  topic: string;
  level: number;
  age: number | null;
  status: string;
  text: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  times_asked: number;
  reports: number | string;
  created_at: string;
}

/** A page of the bank, newest first (retired ones only when asked for). */
export async function browseQuestions(filter: BankFilter, offset = 0): Promise<BankQuestion[]> {
  const { data, error } = await supabase.rpc('admin_browse_questions', {
    p_topic: filter.topic || null,
    p_level: filter.level ?? null,
    p_status: filter.status || null,
    p_search: filter.search?.trim() || null,
    p_limit: BANK_PAGE,
    p_offset: offset,
  });
  if (error) {
    if (error.code === '42501') throw new Error(NOT_AN_ADMIN);
    if (grownUpsLocked(error)) throw Object.assign(new Error(error.message), { code: error.code });
    throw new Error(`Couldn't load the questions — ${errorMessage(error)}`);
  }
  return ((data ?? []) as BankRow[]).map((r) => ({
    id: r.id,
    topic: r.topic,
    level: r.level,
    age: r.age,
    status: r.status,
    text: r.text,
    options: r.options,
    correctIndex: r.correct_index,
    explanation: r.explanation,
    timesAsked: r.times_asked,
    // bigint, which PostgREST may send as a string.
    reports: Number(r.reports),
    createdAt: r.created_at,
  }));
}

/** Decide a question; throws with a message to show. */
export async function reviewQuestion(id: string, decision: ReviewDecision): Promise<void> {
  const { error } = await supabase.rpc('admin_review_question', { p_question: id, p_status: decision });
  if (error) {
    if (error.code === '42501') throw new Error(NOT_AN_ADMIN);
    if (grownUpsLocked(error)) throw Object.assign(new Error(error.message), { code: error.code });
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
