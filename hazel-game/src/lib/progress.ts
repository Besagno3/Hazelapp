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
import { ACT2_SEEN, ACT3_SEEN, ACT4_SEEN, INTRO_SEEN, SPIRE_CLEARED } from '../content/story';
import { UMBRA_NAMED } from '../content/questFlags';
import { TYPING_BADGE_ID, TYPING_LESSONS, pagesCopied, typingLessonFlag } from '../content/typing';
import { badgeInfo, type BadgeInfo } from '../content/badges';
import type { CrystalTopic, Profile, SaveData, Topic, TopicStart } from '../types';

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

/**
 * "Today", "Yesterday", "Monday" (this past week), "3 October", "3 October
 * 2025". A day after `today` reads "Today": the kid's device is a time zone
 * ahead of this one, and it was their today (#29 review round 1). A date
 * further ahead than that is said as the date itself — never "Today" (#29
 * review round 2; `streakSummary` doesn't even ask).
 */
export function dayWords(iso: string, today: string): string {
  const ago = daysAgo(iso, today);
  if (ago === 0 || ago === -1) return 'Today';
  if (ago === 1) return 'Yesterday';
  const d = dateOf(iso);
  if (ago > 1 && ago < 7) return WEEKDAYS[d.getDay()];
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === dateOf(today).getFullYear() ? date : `${date} ${d.getFullYear()}`;
}

/**
 * The profile's last day played as the page can trust it (#29 review round
 * 2): a day after `today` is the kid's device a time zone ahead (the server
 * allows play days that far ahead too, 0025); further ahead is a device clock
 * set wrong — unknown, so it says nothing about "today" or a streak.
 */
function lastDayKnown(last: string | null, today: string): { day: string | null; clockAhead: boolean } {
  if (last === null) return { day: null, clockAhead: false };
  return last > isoOffset(today, 1) ? { day: null, clockAhead: true } : { day: last, clockAhead: false };
}

export interface StreakSummary {
  /** Days in a row right now — 0 once a day has been missed (the saved number waits for their next game to reset). */
  current: number;
  best: number;
  /** Words for the last day played, or null if never (or not known). */
  lastPlayed: string | null;
  /** "7 days ago" once it's a week or more — a bare date doesn't say they've stopped. */
  lastPlayedAgo: string | null;
  /** The last day played is more than a day ahead of today: their device's clock is wrong, so it isn't known (#29 review round 2). */
  clockAhead: boolean;
}

export function streakSummary(stats: Pick<KidStats, 'currentStreak' | 'longestStreak' | 'lastPlayedOn'> | null, today: string): StreakSummary {
  const { day: last, clockAhead } = lastDayKnown(stats?.lastPlayedOn ?? null, today);
  // A day ahead of this device's today was the kid's today (a time zone ahead): still alive.
  const alive = last !== null && last >= isoOffset(today, -1);
  const current = alive ? stats?.currentStreak ?? 0 : 0;
  const ago = last ? daysAgo(last, today) : 0;
  return {
    current,
    best: Math.max(stats?.longestStreak ?? 0, current),
    lastPlayed: last ? dayWords(last, today) : null,
    lastPlayedAgo: last && ago >= 7 ? `${ago} days ago` : null,
    clockAhead,
  };
}

export interface RecentDay {
  iso: string;
  /** "Mon" on the strip, "Monday 20 October" read out. */
  short: string;
  long: string;
  /** Noted that day (migration 0025) or the profile's last day played, or shown by their live streak. */
  played: boolean;
  /** Played, known only from their live streak — not noted that day (#29 review round 2): drawn and said apart. */
  fromStreak: boolean;
  today: boolean;
}

/**
 * The last `RECENT_DAYS` days, oldest first: played when the database noted
 * the day (migration 0025) or it's the profile's last day played — and, since
 * a live streak of N ending on that day proves those N days were played,
 * those days too (#29 review round 2: in the first week after 0025, or after
 * a day's note didn't send, the week said "1 of 7" over a "6 days" streak),
 * marked `fromStreak` so the page says where they came from. Nothing else is
 * guessed — a day without either reads "no play noted". A day after `today`
 * (the kid's device a time zone ahead) counts as today; one further ahead
 * (a clock set wrong) counts for nothing.
 */
export function recentDays(today: string, playDays: readonly string[], lastPlayedOn: string | null, currentStreak = 0): RecentDay[] {
  const ahead = isoOffset(today, 1);
  const asToday = (d: string) => (d > today ? today : d);
  const last = lastDayKnown(lastPlayedOn, today).day;
  const noted = new Set([...playDays, ...(last ? [last] : [])].filter((d) => d <= ahead).map(asToday));
  const streak = new Set<string>();
  // Only a live streak (they played today or yesterday) says anything about this week.
  if (last !== null && last >= isoOffset(today, -1)) {
    const n = Math.min(Math.max(0, Math.floor(currentStreak)), RECENT_DAYS + 1);
    for (let i = 0; i < n; i++) streak.add(asToday(isoOffset(last, -i)));
  }
  return Array.from({ length: RECENT_DAYS }, (_, i) => {
    const iso = isoOffset(today, i - (RECENT_DAYS - 1));
    const d = dateOf(iso);
    const name = WEEKDAYS[d.getDay()];
    const fromStreak = !noted.has(iso) && streak.has(iso);
    return {
      iso,
      short: name.slice(0, 3),
      long: `${name} ${d.getDate()} ${MONTHS[d.getMonth()]}`,
      played: noted.has(iso) || fromStreak,
      fromStreak,
      today: iso === today,
    };
  });
}

// --- Question levels -----------------------------------------------------------

/**
 * The question writer's bands (generate-questions): a level is pitched to the
 * child's age — 1–3 easy for a typical child of that age, 4–6 right for it,
 * 7–8 a stretch, 9–10 for the strongest.
 */
export type LevelBand = 'easy' | 'right' | 'stretch' | 'top';

export function levelBand(level: number): LevelBand {
  if (level <= 3) return 'easy';
  if (level <= 6) return 'right';
  if (level <= 8) return 'stretch';
  return 'top';
}

/**
 * A level's words against where that topic really started (#29 review round
 * 2): the start the game noted when it first saved the topic's level
 * (`SaveData.topicStarts`). Never against where a player of the kid's age
 * *today* would start — a birthday moves that, so a topic held (or climbed)
 * since the kid was younger read "below their starting level". A topic with
 * no noted start (saved before the game noted them) makes no above / below
 * claim; only the question writer's top bands, which describe the questions
 * themselves, are said. Nothing here claims a level went down: the database
 * keeps no history.
 */
export function topicMeaning(level: number, start: TopicStart | null): string | null {
  const band = levelBand(level);
  const pitch = band === 'stretch' ? 'a stretch for their age' : band === 'top' ? 'for the strongest at their age' : null;
  if (!start) return pitch && `${pitch[0].toUpperCase()}${pitch.slice(1)}`;
  const from = `level ${start.level}, where they started at age ${start.age}`;
  if (level < start.level) return `Below ${from} — a good one to practise together`;
  if (level === start.level) return `At ${from}`;
  return `Up ${level - start.level} from ${from}${pitch ? ` — ${pitch}` : ''}`;
}

export interface TopicLevel {
  id: Topic;
  label: string;
  emoji: string;
  level: number;
  /** False: no level saved yet, so it's at the start for their age (it moves once a round moves it). */
  measured: boolean;
  /** Where the topic really started, when the game noted it (measured topics only). */
  start: TopicStart | null;
  /** One short line for a grown-up, or null when there's nothing true to add to the level. */
  meaning: string | null;
}

/**
 * Every topic, in the game's order, with its question level (1–10) and what
 * it means. Measured topics read against their noted start (`starts`, from
 * the save); the rest stand at the start for the kid's age now (`age`) —
 * where they'd begin if played today.
 */
export function topicLevels(skillLevels: KidStats['skillLevels'], age: number, starts: SaveData['topicStarts'] = {}): TopicLevel[] {
  const ageStart = ageToStartLevel(age);
  return ALL_TOPIC_INFO.map((t) => {
    const saved = skillLevels[t.id];
    const measured = typeof saved === 'number' && Number.isFinite(saved);
    const level = measured ? clampLevel(saved) : ageStart;
    const start = measured ? (starts[t.id] ?? null) : null;
    return { id: t.id, label: t.label, emoji: t.emoji, level, measured, start, meaning: measured ? topicMeaning(level, start) : null };
  });
}

// --- At a glance ---------------------------------------------------------------

/** "Math", "Math and Science", "Math, Science and 2 more" (`max` = Infinity names them all). */
export function nameList(names: readonly string[], max = 2): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

/** This many questions of one topic waiting at the Library is "several" — worth a look together. */
export const SEVERAL_MISSED = 3;

export interface Glance {
  /** Days played in the last week, or null when the database can't say (no 0025). */
  playedDays: number | null;
  /** How many of those only their live streak shows (#29 review round 2). */
  streakDays: number;
  /** The topics that climbed most since their noted start (none unless one climbed). */
  climbed: TopicLevel[];
  /** Measured topics below their noted start. */
  belowStart: TopicLevel[];
  /** Topics with several questions waiting at the Library, most first. */
  missedByTopic: { label: string; count: number }[];
  missedCount: number;
}

/**
 * The page's opening lines (#29 review round 1): how much they've played,
 * what's going well and what could use a hand — all from what's stored
 * (a topic against the start the game noted for it; several missed questions
 * waiting), never guessed: a topic with no noted start is in neither list
 * (#29 review round 2). `levels` / `missed` are null where nothing was saved.
 */
export function glance(week: RecentDay[] | null, levels: TopicLevel[] | null, missed: MissedQuestion[] | null): Glance {
  const started = (levels ?? []).filter((t): t is TopicLevel & { start: TopicStart } => t.measured && t.start !== null);
  const most = Math.max(0, ...started.map((t) => t.level - t.start.level));
  const counts = new Map<string, number>();
  for (const m of missed ?? []) counts.set(m.topicLabel, (counts.get(m.topicLabel) ?? 0) + 1);
  return {
    playedDays: week ? week.filter((d) => d.played).length : null,
    streakDays: week ? week.filter((d) => d.fromStreak).length : 0,
    climbed: most > 0 ? started.filter((t) => t.level - t.start.level === most) : [],
    belowStart: started.filter((t) => t.level < t.start.level),
    missedByTopic: [...counts]
      .filter(([, n]) => n >= SEVERAL_MISSED)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count })),
    missedCount: missed?.length ?? 0,
  };
}

/**
 * What to practise together, grouped by why and every topic named (#29 review
 * round 2: one long line repeated "(below their starting level)" for each and
 * ended "…and 2 more"): "To practise together — below where they started:
 * Engineering and Creativity · questions waiting at the Library: Math (4)."
 * Null when nothing stands out.
 */
export function practiseText(g: Pick<Glance, 'belowStart' | 'missedByTopic'>): string | null {
  const parts: string[] = [];
  if (g.belowStart.length > 0) parts.push(`below where they started: ${nameList(g.belowStart.map((t) => t.label), Infinity)}`);
  if (g.missedByTopic.length > 0) {
    parts.push(`questions waiting at the Library: ${nameList(g.missedByTopic.map((m) => `${m.label} (${m.count})`), Infinity)}`);
  }
  return parts.length > 0 ? `To practise together — ${parts.join(' · ')}.` : null;
}

/** "Most progress: Math — up from level 1 to 3 since they started." (or "Math and Science — up 2 levels each …"); null with no climb. */
export function climbedText(climbed: readonly TopicLevel[]): string | null {
  const first = climbed[0];
  if (!first?.start) return null;
  if (climbed.length === 1) return `Most progress: ${first.label} — up from level ${first.start.level} to ${first.level} since they started.`;
  const by = first.level - first.start.level;
  return `Most progress: ${nameList(climbed.map((t) => t.label), Infinity)} — up ${by} ${by === 1 ? 'level' : 'levels'} each since they started.`;
}

// --- The story -----------------------------------------------------------------

const ROMAN: Record<Act, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

export interface CrystalLine {
  topic: CrystalTopic;
  /** The crystal's name, once the game has said it (else null: "a crystal not found yet"). */
  crystal: string | null;
  /** Its topic, shown with the name only. */
  topicLabel: string | null;
  restored: boolean;
}

export interface StorySummary {
  /** In the Training Grounds, out in the world, or the whole story done. */
  stage: 'training' | 'world' | 'finished';
  practiceRounds: number;
  roundsToOpen: number;
  act: Act;
  /** "Act II" — the game names no acts, so neither does the page (#29 review round 1). */
  actLabel: string;
  /** The crystals of the acts reached so far — never a later act's. */
  crystals: CrystalLine[];
  restored: number;
  /** Crystals of the acts reached still to restore. */
  left: number;
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

/**
 * The story so far, with nothing the game hasn't shown the kid (#29 review
 * round 1, the lead's call): acts by number only; a crystal by name once it's
 * restored, once their own 🚩 names it, or — Act I's four — once the opening
 * story has (it names all four); any other is "a crystal not found yet".
 */
export function storySummary(save: SaveData): StorySummary {
  const { flags } = save;
  const act = storyAct(flags);
  const finished = flags[UMBRA_NAMED] === true;
  const stage = !save.worldUnlocked ? 'training' : finished ? 'finished' : 'world';
  const objective = stage === 'world' ? nextObjective(flags) : null;
  const crystals: CrystalLine[] = [];
  for (let a = 1; a <= act; a++) {
    for (const t of actCrystals(a as Act)) {
      const restored = flags[crystalFlag(t.id)] === true;
      const known = restored || objective?.crystal?.id === t.id || (t.act === 1 && flags[INTRO_SEEN] === true);
      crystals.push({ topic: t.id, crystal: known ? t.crystalName : null, topicLabel: known ? t.label : null, restored });
    }
  }
  const seen = new Set<string>();
  const trophies: BadgeInfo[] = [];
  for (const id of save.badges) {
    const info = badgeInfo(id);
    if (info && !seen.has(id)) {
      seen.add(id);
      trophies.push(info);
    }
  }
  const restored = crystals.filter((c) => c.restored).length;
  return {
    stage,
    practiceRounds: Math.min(save.passedRounds, ROUNDS_TO_UNLOCK),
    roundsToOpen: ROUNDS_TO_UNLOCK,
    act,
    actLabel: `Act ${ROMAN[act]}`,
    crystals,
    restored,
    left: crystals.length - restored,
    spire: flags[SPIRE_CLEARED] ? 'cleared' : actComplete(flags, 1) ? 'open' : 'hidden',
    goal: objective?.title ?? null,
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
