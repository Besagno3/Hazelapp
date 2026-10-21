import { supabase } from './supabase';
import { errorMessage } from './errors';
import { normalizeSave } from './save';
import { levelState, xpProgress } from './level';
import { isoOffset } from './streak';
import { ageToStartLevel, clampLevel } from './age';
import { ROUNDS_TO_UNLOCK } from './utils';
import { nextObjective } from './wayfinding';
import { LEAF_MILESTONES, leavesFlag } from './leaves';
import { ALL_TOPIC_INFO, actComplete, actCrystals, crystalFlag, type Act } from '../content/topics';
import { ACT2_SEEN, ACT3_SEEN, ACT4_SEEN, SPIRE_CLEARED } from '../content/story';
import { UMBRA_NAMED } from '../content/questFlags';
import { TYPING_BADGE_ID, TYPING_LESSONS, pagesCopied, typingLessonFlag } from '../content/typing';
import { badgeInfo, type BadgeInfo } from '../content/badges';
import type { CrystalTopic, Profile, SaveData, Topic } from '../types';

/**
 * 👪 Grown-ups → 📈 Progress (#29): what a grown-up sees of each kid — read
 * from the database (RLS: a grown-up's own kids only, migrations 0013 and
 * 0025), then shaped here by pure functions the page renders. Never the kid's
 * birth date (their age only picks the starting level of a topic not played
 * yet) or their PIN (no client can read one). Reading is not a grown-up
 * action, so it needs no 👪 window; the page lives inside 👪 Grown-ups.
 */

// --- Reading -------------------------------------------------------------------

/** The `profiles` columns the page reads — progress only, nothing personal. */
export const PROGRESS_COLUMNS = 'id, skill_levels, xp, level, level_xp, current_streak, longest_streak, last_played_on';

/** A kid's progress numbers from their `profiles` row. */
export type KidStats = Pick<Profile, 'skillLevels' | 'xp' | 'level' | 'levelXp' | 'currentStreak' | 'longestStreak' | 'lastPlayedOn'>;

/** One kid's progress as read: null where there's nothing (yet) to read. */
export interface KidProgressData {
  stats: KidStats | null;
  /** Their saved game, normalized (null: no save on the server yet). */
  save: SaveData | null;
  /** Days played in the last `RECENT_DAYS` (`YYYY-MM-DD`); null when the database can't say (no migration 0025, or the read failed). */
  playDays: string[] | null;
}

/** How many days the page shows: the last week. */
export const RECENT_DAYS = 7;

interface ProgressRow {
  id: string;
  skill_levels: unknown;
  xp: number | null;
  level: number | null;
  level_xp: number | null;
  current_streak: number | null;
  longest_streak: number | null;
  last_played_on: string | null;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Only finite numbers survive from the `skill_levels` JSON. */
function skillLevelsFrom(raw: unknown): KidStats['skillLevels'] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out as KidStats['skillLevels'];
}

export function statsFromRow(r: ProgressRow): KidStats {
  return {
    skillLevels: skillLevelsFrom(r.skill_levels),
    xp: Math.max(0, num(r.xp)),
    ...(r.level != null && r.level_xp != null ? { level: r.level, levelXp: r.level_xp } : {}),
    currentStreak: Math.max(0, num(r.current_streak)),
    longestStreak: Math.max(0, num(r.longest_streak)),
    lastPlayedOn: typeof r.last_played_on === 'string' ? r.last_played_on : null,
  };
}

/** A Supabase error as a thrown `Error` that keeps its code (the page words it, the console gets it whole). */
function asError(err: unknown): Error {
  if (err instanceof Error) return err;
  const o = (typeof err === 'object' && err !== null ? err : {}) as Record<string, unknown>;
  const e = new Error(typeof o.message === 'string' && o.message ? o.message : "Progress didn't load");
  for (const k of ['code', 'details', 'hint', 'status', 'name'] as const) {
    if (o[k] !== undefined && o[k] !== null) Object.assign(e, { [k]: o[k] });
  }
  return e;
}

/**
 * Every kid's progress in three reads (whatever the family's size): their
 * profiles, their saves, and the last week's play days. A failed profiles or
 * saves read throws (the page says so and offers "Try again"); a failed
 * play-days read leaves `playDays` null and the page leaves the week out.
 */
export async function fetchFamilyProgress(kidIds: string[], today: string): Promise<Record<string, KidProgressData>> {
  const out: Record<string, KidProgressData> = {};
  for (const id of kidIds) out[id] = { stats: null, save: null, playDays: null };
  if (kidIds.length === 0) return out;
  const [profiles, saves, days] = await Promise.all([
    supabase.from('profiles').select(PROGRESS_COLUMNS).in('id', kidIds),
    supabase.from('saves').select('profile_id, data').in('profile_id', kidIds),
    supabase.from('play_days').select('profile_id, day').in('profile_id', kidIds).gte('day', isoOffset(today, -(RECENT_DAYS - 1))),
  ]);
  if (profiles.error) throw asError(profiles.error);
  if (saves.error) throw asError(saves.error);
  for (const row of (profiles.data ?? []) as ProgressRow[]) {
    if (out[row.id]) out[row.id].stats = statsFromRow(row);
  }
  for (const row of (saves.data ?? []) as { profile_id: string; data: unknown }[]) {
    if (out[row.profile_id] && row.data != null) out[row.profile_id].save = normalizeSave(row.data);
  }
  if (days.error) {
    console.warn('Reading the days played failed (the week is left out):', errorMessage(days.error));
  } else {
    for (const id of kidIds) out[id].playDays = [];
    for (const row of (days.data ?? []) as { profile_id: string; day: string }[]) {
      out[row.profile_id]?.playDays?.push(row.day);
    }
  }
  return out;
}

// --- Has this kid played? ------------------------------------------------------

/** Anything at all saved from play — else the page says they haven't played yet. */
export function hasPlayed({ stats, save }: Pick<KidProgressData, 'stats' | 'save'>): boolean {
  const fromStats = !!stats && (stats.xp > 0 || stats.lastPlayedOn !== null || Object.keys(stats.skillLevels).length > 0);
  const fromSave = !!save && (save.passedRounds > 0 || save.worldUnlocked || save.library.length > 0 || save.avatarId !== null);
  return fromStats || fromSave;
}

// --- Level and XP --------------------------------------------------------------

export interface LevelSummary {
  level: number;
  /** XP earned toward the next level, and how much it takes. */
  into: number;
  needed: number;
  toNext: number;
  /** 0–100, for the meter. */
  percent: number;
  totalXp: number;
}

export function levelSummary(stats: Pick<KidStats, 'xp' | 'level' | 'levelXp'> | null): LevelSummary {
  const state = levelState(stats);
  const { into, needed, fraction } = xpProgress(state);
  return { level: state.level, into, needed, toNext: needed - into, percent: Math.round(fraction * 100), totalXp: stats?.xp ?? 0 };
}

// --- Streak, last played, the last week ----------------------------------------

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function dateOf(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole days from `iso` to `today` (both `YYYY-MM-DD`). */
function daysAgo(iso: string, today: string): number {
  return Math.round((dateOf(today).getTime() - dateOf(iso).getTime()) / 86_400_000);
}

/** "Today", "Yesterday", "Monday" (this past week), "3 October", "3 October 2025". */
export function dayWords(iso: string, today: string): string {
  const ago = daysAgo(iso, today);
  if (ago === 0) return 'Today';
  if (ago === 1) return 'Yesterday';
  const d = dateOf(iso);
  if (ago > 1 && ago < 7) return WEEKDAYS[d.getDay()];
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === dateOf(today).getFullYear() ? date : `${date} ${d.getFullYear()}`;
}

export interface StreakSummary {
  /** Days in a row right now — 0 once a day has been missed (the saved number waits for their next game to reset). */
  current: number;
  best: number;
  /** Words for the last day played, or null if never. */
  lastPlayed: string | null;
}

export function streakSummary(stats: Pick<KidStats, 'currentStreak' | 'longestStreak' | 'lastPlayedOn'> | null, today: string): StreakSummary {
  const last = stats?.lastPlayedOn ?? null;
  const alive = last !== null && (last === today || last === isoOffset(today, -1));
  const current = alive ? stats?.currentStreak ?? 0 : 0;
  return { current, best: Math.max(stats?.longestStreak ?? 0, current), lastPlayed: last ? dayWords(last, today) : null };
}

export interface RecentDay {
  iso: string;
  /** "Mon" on the strip, "Monday 20 October" read out. */
  short: string;
  long: string;
  played: boolean;
  today: boolean;
}

/**
 * The last `RECENT_DAYS` days, oldest first: played when the database noted
 * the day (migration 0025) or it's the profile's last day played. Nothing is
 * guessed — a day without a note reads "no play noted".
 */
export function recentDays(today: string, playDays: readonly string[], lastPlayedOn: string | null): RecentDay[] {
  const played = new Set(playDays);
  if (lastPlayedOn) played.add(lastPlayedOn);
  return Array.from({ length: RECENT_DAYS }, (_, i) => {
    const iso = isoOffset(today, i - (RECENT_DAYS - 1));
    const d = dateOf(iso);
    const name = WEEKDAYS[d.getDay()];
    return { iso, short: name.slice(0, 3), long: `${name} ${d.getDate()} ${MONTHS[d.getMonth()]}`, played: played.has(iso), today: iso === today };
  });
}

// --- Question levels -----------------------------------------------------------

/**
 * What a level means for this child's age — the bands the question writer
 * pitches to (generate-questions: 1–3 easy for a typical child of this age,
 * 4–6 right for it, 7–8 a stretch, 9–10 for the strongest).
 */
export type LevelBand = 'easy' | 'right' | 'stretch' | 'top';

export function levelBand(level: number): LevelBand {
  if (level <= 3) return 'easy';
  if (level <= 6) return 'right';
  if (level <= 8) return 'stretch';
  return 'top';
}

export const BAND_WORDS: Record<LevelBand, string> = {
  easy: 'Easy questions for their age',
  right: 'Right for their age',
  stretch: 'A stretch for their age',
  top: 'For the strongest at their age',
};

/** A topic no round has moved yet: the starting level for their age. */
export const STARTING_WORDS = 'Starting level for their age — not moved yet';

export interface TopicLevel {
  id: Topic;
  label: string;
  emoji: string;
  level: number;
  /** False: no level saved yet, so it's the starting level for their age. */
  measured: boolean;
  /** One short line for a grown-up. */
  meaning: string;
}

/** Every topic, in the game's order, with its question level (1–10) and what it means. `age` is the kid's age now. */
export function topicLevels(skillLevels: KidStats['skillLevels'], age: number): TopicLevel[] {
  return ALL_TOPIC_INFO.map((t) => {
    const saved = skillLevels[t.id];
    const measured = typeof saved === 'number' && Number.isFinite(saved);
    const level = measured ? clampLevel(saved) : ageToStartLevel(age);
    return { id: t.id, label: t.label, emoji: t.emoji, level, measured, meaning: measured ? BAND_WORDS[levelBand(level)] : STARTING_WORDS };
  });
}

// --- The story -----------------------------------------------------------------

/** Each act's name, shown only once the kid has reached it (no spoilers). */
export const ACT_NAMES: Record<Act, string> = {
  1: 'The Four Crystals',
  2: 'The Crystal of Memory',
  3: 'The Starfall Sea',
  4: 'The Name',
};

const ROMAN: Record<Act, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

export interface CrystalLine {
  topic: CrystalTopic;
  crystal: string;
  topicLabel: string;
  emoji: string;
  restored: boolean;
}

export interface StorySummary {
  /** In the Training Grounds, out in the world, or the whole story done. */
  stage: 'training' | 'world' | 'finished';
  practiceRounds: number;
  roundsToOpen: number;
  act: Act;
  /** "Act II · The Crystal of Memory". */
  actTitle: string;
  /** The crystals of the acts reached so far — never a later act's. */
  crystals: CrystalLine[];
  restored: number;
  /** The Crystal Spire: not mentioned before Act I's crystals are all back. */
  spire: 'hidden' | 'open' | 'cleared';
  /** What their own 🚩 says to do next (null in training or once finished). */
  goal: string | null;
  trophies: BadgeInfo[];
}

/** The act the story is in, by the act-opening flags. */
export function storyAct(flags: Record<string, boolean>): Act {
  if (flags[ACT4_SEEN]) return 4;
  if (flags[ACT3_SEEN]) return 3;
  if (flags[ACT2_SEEN]) return 2;
  return 1;
}

export function storySummary(save: SaveData): StorySummary {
  const { flags } = save;
  const act = storyAct(flags);
  const crystals: CrystalLine[] = [];
  for (let a = 1; a <= act; a++) {
    for (const t of actCrystals(a as Act)) {
      crystals.push({ topic: t.id, crystal: t.crystalName, topicLabel: t.label, emoji: t.emoji, restored: flags[crystalFlag(t.id)] === true });
    }
  }
  const finished = flags[UMBRA_NAMED] === true;
  const stage = !save.worldUnlocked ? 'training' : finished ? 'finished' : 'world';
  const seen = new Set<string>();
  const trophies: BadgeInfo[] = [];
  for (const id of save.badges) {
    const info = badgeInfo(id);
    if (info && !seen.has(id)) {
      seen.add(id);
      trophies.push(info);
    }
  }
  return {
    stage,
    practiceRounds: Math.min(save.passedRounds, ROUNDS_TO_UNLOCK),
    roundsToOpen: ROUNDS_TO_UNLOCK,
    act,
    actTitle: `Act ${ROMAN[act]} · ${ACT_NAMES[act]}`,
    crystals,
    restored: crystals.filter((c) => c.restored).length,
    spire: flags[SPIRE_CLEARED] ? 'cleared' : actComplete(flags, 1) ? 'open' : 'hidden',
    goal: stage === 'world' ? nextObjective(flags).title : null,
    trophies,
  };
}

// --- Missed questions (the Library queue) --------------------------------------

export interface MissedQuestion {
  key: string;
  topicLabel: string;
  emoji: string;
  question: string;
  rightAnswer: string;
  /** What they picked, when it's a real wrong option. */
  theirAnswer: string | null;
  /** Their clock ran out before they answered (a timed defend question). */
  timedOut: boolean;
  explanation: string | null;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * The Library queue — questions they missed and haven't answered again yet —
 * newest first, in words: the question, the right answer, what they picked,
 * the explanation, the topic's name. An entry this can't read (a junk save)
 * is left out rather than shown half-broken.
 */
export function missedQuestions(save: SaveData): MissedQuestion[] {
  const out: MissedQuestion[] = [];
  save.library.forEach((entry, i) => {
    const q = (entry as { question?: unknown } | null)?.question as Record<string, unknown> | undefined;
    if (!q || typeof q !== 'object') return;
    const question = text(q.text);
    const options = Array.isArray(q.options) ? q.options : [];
    const correct = q.correctIndex;
    if (!question || options.length < 2 || !options.every((o) => typeof o === 'string')) return;
    if (typeof correct !== 'number' || !Number.isInteger(correct) || correct < 0 || correct >= options.length) return;
    const rightAnswer = text(options[correct]);
    if (!rightAnswer) return;
    const topic = ALL_TOPIC_INFO.find((t) => t.id === q.topic);
    const picked = (entry as { picked?: unknown }).picked;
    const pickedOk = typeof picked === 'number' && Number.isInteger(picked) && picked >= 0 && picked < options.length && picked !== correct;
    out.push({
      key: `${i}:${typeof q.id === 'string' ? q.id : ''}`,
      topicLabel: topic?.label ?? 'A question',
      emoji: topic?.emoji ?? '❓',
      question,
      rightAnswer,
      theirAnswer: pickedOk ? text(options[picked]) : null,
      timedOut: picked === -1,
      explanation: text(q.explanation),
    });
  });
  return out.reverse();
}

// --- Touch typing (#165) -------------------------------------------------------

export interface TypingSummary {
  cleared: number;
  total: number;
  /** The next lesson's title (null once every lesson is cleared). */
  next: string | null;
  badge: boolean;
  pagesCopied: number;
  /** The biggest 🍂 Falling Leaves milestone reached in one round, if any. */
  leavesBest: number | null;
}

export function typingSummary(save: SaveData): TypingSummary {
  const { flags } = save;
  const cleared = TYPING_LESSONS.filter((l) => flags[typingLessonFlag(l.id)] === true).length;
  const next = TYPING_LESSONS.find((l) => flags[typingLessonFlag(l.id)] !== true)?.title ?? null;
  const leaves = LEAF_MILESTONES.filter((m) => flags[leavesFlag(m)] === true);
  return {
    cleared,
    total: TYPING_LESSONS.length,
    next,
    badge: save.badges.includes(TYPING_BADGE_ID),
    pagesCopied: pagesCopied(flags),
    leavesBest: leaves.length ? Math.max(...leaves) : null,
  };
}
