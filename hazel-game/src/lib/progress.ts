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
import type { CrystalTopic, PlayDayRecord, Profile, SaveData, Topic, TopicStart, TopicTally } from '../types';

/**
 * 👪 Grown-ups → 📈 Progress (#29): what a grown-up sees of each kid — read
 * from the database (RLS: a grown-up's own kids only, migrations 0013, 0025
 * and 0026), then shaped here by pure functions the page renders. Never the kid's
 * birth date (their age only picks the starting level of a topic not played
 * yet) or their PIN (no client can read one). Reading is not a grown-up
 * action, so it needs no 👪 window; the page lives inside 👪 Grown-ups.
 */

// --- Reading -------------------------------------------------------------------

/** The `profiles` columns the page reads — progress only, nothing personal. */
export const PROGRESS_COLUMNS = 'id, skill_levels, xp, level, level_xp, current_streak, longest_streak, last_played_on';

/** Where each topic started (#174, migration 0026) — read with the progress columns when the database has it. */
export const STARTS_COLUMN = 'skill_starts';

/** The `play_days` columns of a day's play (#169, #172, #173; migration 0026). */
export const HISTORY_COLUMNS = 'profile_id, day, xp, minutes, topics';

/** A kid's progress numbers from their `profiles` row. */
export type KidStats = Pick<Profile, 'skillLevels' | 'xp' | 'level' | 'levelXp' | 'currentStreak' | 'longestStreak' | 'lastPlayedOn' | 'skillStarts'>;

/** One kid's progress as read: null where there's nothing (yet) to read. */
export interface KidProgressData {
  stats: KidStats | null;
  /** Their saved game, normalized (null: no save on the server yet). */
  save: SaveData | null;
  /** Days played in the last `RECENT_DAYS` (`YYYY-MM-DD`); null when the database can't say (no migration 0025, or the read failed). */
  playDays: string[] | null;
  /**
   * Each day's play in the last `HISTORY_DAYS`, oldest first — XP, minutes and
   * answers per topic (#169, #172, #173); null when the database can't say
   * (no migration 0026, or the read failed).
   */
  history: PlayDayRecord[] | null;
  /** The first day ever noted for them (`play_history_since`, #170); null when not known. */
  countedSince: string | null;
}

/** How many days the page shows: the last week. */
export const RECENT_DAYS = 7;

/** How many days of play it reads: what the database keeps (migration 0026 — 4 weeks of XP, and the week before the last for "since last week"). */
export const HISTORY_DAYS = 35;

interface ProgressRow {
  id: string;
  skill_levels: unknown;
  xp: number | null;
  level: number | null;
  level_xp: number | null;
  current_streak: number | null;
  longest_streak: number | null;
  last_played_on: string | null;
  /** Absent on a database without migration 0026. */
  skill_starts?: unknown;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** A whole number from `lo` to `hi`, else null. */
const whole = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const TOPIC_IDS: readonly string[] = ALL_TOPIC_INFO.map((t) => t.id);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Only finite numbers survive from the `skill_levels` JSON. */
function skillLevelsFrom(raw: unknown): KidStats['skillLevels'] {
  if (!isObject(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out as KidStats['skillLevels'];
}

/** `skill_starts` as the database keeps it (#174): known topics only, each a whole level 1–10 and a whole age 3–18. */
function skillStartsFrom(raw: unknown): Partial<Record<Topic, TopicStart>> {
  if (!isObject(raw)) return {};
  const out: Partial<Record<Topic, TopicStart>> = {};
  for (const [topic, v] of Object.entries(raw)) {
    if (!TOPIC_IDS.includes(topic) || !isObject(v)) continue;
    const level = whole(v.level, 1, 10);
    const age = whole(v.age, 3, 18);
    if (level !== null && age !== null) out[topic as Topic] = { level, age };
  }
  return out;
}

export function statsFromRow(r: ProgressRow): KidStats {
  return {
    skillLevels: skillLevelsFrom(r.skill_levels),
    xp: Math.max(0, num(r.xp)),
    ...(r.level != null && r.level_xp != null ? { level: r.level, levelXp: r.level_xp } : {}),
    currentStreak: Math.max(0, num(r.current_streak)),
    longestStreak: Math.max(0, num(r.longest_streak)),
    lastPlayedOn: typeof r.last_played_on === 'string' ? r.last_played_on : null,
    ...(r.skill_starts !== undefined ? { skillStarts: skillStartsFrom(r.skill_starts) } : {}),
  };
}

/**
 * One `play_days` row as the page can trust it (#169, #172, #173), or null:
 * a real day; XP 0–100,000 and minutes 0–1,440 (else 0 — never more than was
 * noted); per known topic a whole `a` asked 0–10,000 and `r` right 0–`a`
 * (else the topic is left out) and `l`, the level at the day's end, 1–10
 * (else dropped). Unknown keys are left out.
 */
export function playDayFromRow(row: unknown): PlayDayRecord | null {
  if (!isObject(row) || typeof row.day !== 'string' || !ISO_DAY.test(row.day)) return null;
  const topics: Record<string, TopicTally> = {};
  if (isObject(row.topics)) {
    for (const [topic, v] of Object.entries(row.topics)) {
      if (!TOPIC_IDS.includes(topic) || !isObject(v)) continue;
      const a = whole(v.a, 0, 10_000);
      const r = a === null ? null : whole(v.r, 0, a);
      if (a === null || r === null) continue;
      const l = whole(v.l, 1, 10);
      topics[topic] = l === null ? { a, r } : { a, r, l };
    }
  }
  return { day: row.day, xp: whole(row.xp, 0, 100_000) ?? 0, minutes: whole(row.minutes, 0, 1440) ?? 0, topics };
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

const codeOf = (err: unknown): string => (isObject(err) && typeof err.code === 'string' ? err.code : '');
const messageOf = (err: unknown): string => (isObject(err) && typeof err.message === 'string' ? err.message : '');

/** A column the database doesn't have yet (a migration not applied): Postgres's undefined_column, as PostgREST passes it on. */
export function missingColumn(err: unknown): boolean {
  return codeOf(err) === '42703' || codeOf(err) === 'PGRST204' || /column .* does not exist/i.test(messageOf(err));
}

/**
 * Every kid's progress in four reads (whatever the family's size): their
 * profiles, their saves, the last five weeks' play (`play_days`) and the
 * first day noted for each (`play_history_since`). A failed profiles or saves
 * read throws (the page says so and offers "Try again"); a failed play read
 * leaves `playDays` / `history` null and the page leaves those parts out.
 * A database without migration 0026 is read as before it (#169–#174): the
 * profiles without `skill_starts`, the play as the last week's days alone —
 * one more read each, only then.
 */
export async function fetchFamilyProgress(kidIds: string[], today: string): Promise<Record<string, KidProgressData>> {
  const out: Record<string, KidProgressData> = {};
  for (const id of kidIds) out[id] = { stats: null, save: null, playDays: null, history: null, countedSince: null };
  if (kidIds.length === 0) return out;
  const readProfiles = (columns: string) => supabase.from('profiles').select(columns).in('id', kidIds);
  const readDays = (columns: string, days: number) =>
    supabase.from('play_days').select(columns).in('profile_id', kidIds).gte('day', isoOffset(today, -(days - 1)));
  const [profilesNew, saves, history, since] = await Promise.all([
    readProfiles(`${PROGRESS_COLUMNS}, ${STARTS_COLUMN}`),
    supabase.from('saves').select('profile_id, data').in('profile_id', kidIds),
    readDays(HISTORY_COLUMNS, HISTORY_DAYS),
    supabase.from('play_history_since').select('profile_id, since').in('profile_id', kidIds),
  ]);
  // No migration 0026: the columns it adds aren't there — read what is.
  const [profilesOld, daysOld] = await Promise.all([
    missingColumn(profilesNew.error) ? readProfiles(PROGRESS_COLUMNS) : null,
    missingColumn(history.error) ? readDays('profile_id, day', RECENT_DAYS) : null,
  ]);
  const profiles = profilesOld ?? profilesNew;
  if (profiles.error) throw asError(profiles.error);
  if (saves.error) throw asError(saves.error);
  for (const row of (profiles.data ?? []) as unknown as ProgressRow[]) {
    if (out[row.id]) out[row.id].stats = statsFromRow(row);
  }
  for (const row of (saves.data ?? []) as { profile_id: string; data: unknown }[]) {
    if (out[row.profile_id] && row.data != null) out[row.profile_id].save = normalizeSave(row.data);
  }
  const weekStart = isoOffset(today, -(RECENT_DAYS - 1));
  const days = daysOld ?? history;
  if (days.error) {
    console.warn('Reading the days played failed (the week is left out):', errorMessage(days.error));
  } else {
    for (const id of kidIds) {
      out[id].playDays = [];
      if (!daysOld) out[id].history = [];
    }
    for (const row of (days.data ?? []) as unknown as { profile_id: string }[]) {
      const kid = out[row.profile_id];
      const record = kid && playDayFromRow(row);
      if (!record) continue;
      if (record.day >= weekStart) kid.playDays?.push(record.day);
      if (kid.history && !kid.history.some((d) => d.day === record.day)) kid.history.push(record);
    }
    for (const id of kidIds) out[id].history?.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  }
  if (since.error) {
    console.warn('Reading when their days were first noted failed (no "counted from"):', errorMessage(since.error));
  } else {
    for (const row of (since.data ?? []) as { profile_id: string; since: unknown }[]) {
      if (out[row.profile_id] && typeof row.since === 'string' && ISO_DAY.test(row.since)) out[row.profile_id].countedSince = row.since;
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
  /** Noted that day (migration 0025), the profile's last day played, or a day their live streak proves (#29 review round 2). */
  played: boolean;
  today: boolean;
  /**
   * False: before the first day ever noted for them (`countedSince`, #170) —
   * not recorded, rather than "no play noted". True when that isn't known.
   */
  counted: boolean;
  /**
   * The XP noted that day (#169), or null: no play noted, or a day noted
   * without its play — by an app from before migration 0026, or one only
   * their streak proves. Never a 0 for what wasn't recorded.
   */
  xp: number | null;
  /** Active minutes noted that day (#172); null as for `xp`. */
  minutes: number | null;
}

/** What else a day can say, when the database has it (migration 0026). */
export interface DayHistory {
  /** Each day's play, as read (`KidProgressData.history`). */
  history?: readonly PlayDayRecord[] | null;
  /** The first day ever noted for them (#170). */
  countedSince?: string | null;
  /** How many days, ending today (default: the last week). */
  days?: number;
}

/**
 * A day noted by an app that counts its play (migration 0026): any XP,
 * minute or answer at all. A day with none was noted by an older app (or
 * before 0026: the column defaults) — that it was played is known, how much
 * isn't.
 */
const playNoted = (d: PlayDayRecord) => d.xp > 0 || d.minutes > 0 || Object.keys(d.topics).length > 0;

/**
 * The last `RECENT_DAYS` days (or `days`), oldest first: played when the
 * database noted the day (migration 0025) or it's the profile's last day
 * played — and, since a live streak of N ending on that day proves those N
 * days were played, those days too (#29 review round 2: in the first week
 * after 0025, or after a day's note didn't send, the week said "1 of 7" over
 * a "6 days" streak) — played like any other (round 3: a second kind of ✓
 * had no job for a parent and made the count sound unsure). Nothing else is
 * guessed — a day without either reads "no play noted", or "not recorded"
 * before the first day ever noted (#170). A day after `today` (the kid's
 * device a time zone ahead) counts as today; one further ahead (a clock set
 * wrong) counts for nothing. XP and minutes only from a day whose play was
 * noted (#169, #172).
 */
export function recentDays(
  today: string,
  playDays: readonly string[],
  lastPlayedOn: string | null,
  currentStreak = 0,
  { history = null, countedSince = null, days = RECENT_DAYS }: DayHistory = {},
): RecentDay[] {
  const ahead = isoOffset(today, 1);
  const asToday = (d: string) => (d > today ? today : d);
  const last = lastDayKnown(lastPlayedOn, today).day;
  const records = (history ?? []).filter((d) => d.day <= ahead);
  const noted = new Set([...playDays, ...records.map((d) => d.day), ...(last ? [last] : [])].filter((d) => d <= ahead).map(asToday));
  // A day's play, from the days noted with it (a day ahead joins today's).
  const play = new Map<string, { xp: number; minutes: number }>();
  for (const d of records.filter(playNoted)) {
    const iso = asToday(d.day);
    const was = play.get(iso);
    play.set(iso, { xp: (was?.xp ?? 0) + d.xp, minutes: (was?.minutes ?? 0) + d.minutes });
  }
  const streak = new Set<string>();
  // Only a live streak (they played today or yesterday) says anything about these days.
  if (last !== null && last >= isoOffset(today, -1)) {
    const n = Math.min(Math.max(0, Math.floor(currentStreak)), days + 1);
    for (let i = 0; i < n; i++) streak.add(asToday(isoOffset(last, -i)));
  }
  const since = countedSince && ISO_DAY.test(countedSince) ? asToday(countedSince) : null;
  return Array.from({ length: days }, (_, i) => {
    const iso = isoOffset(today, i - (days - 1));
    const d = dateOf(iso);
    const name = WEEKDAYS[d.getDay()];
    const played = noted.has(iso) || streak.has(iso);
    const noting = played ? play.get(iso) : undefined;
    return {
      iso,
      short: name.slice(0, 3),
      long: `${name} ${d.getDate()} ${MONTHS[d.getMonth()]}`,
      played,
      today: iso === today,
      counted: since === null || iso >= since,
      xp: noting?.xp ?? null,
      minutes: noting?.minutes ?? null,
    };
  });
}

/**
 * The first day ever noted for them, when it falls after the first of `days`
 * — so the days before it weren't recorded (#170) — as a short note:
 * "Counted from Tuesday 21 October — earlier days weren't recorded." Null
 * when every shown day was counted (or that isn't known).
 */
export function countedFromText(days: readonly RecentDay[]): string | null {
  const first = days.findIndex((d) => d.counted);
  if (first <= 0) return null;
  return `Counted from ${days[first].long} — earlier days weren't recorded.`;
}

/** Five-minute steps: 37 → 35, 38 → 40. */
const toFive = (m: number) => Math.round(m / 5) * 5;

/**
 * Minutes as a grown-up says them (#172), mid-sentence: "under a minute",
 * "a few minutes" (under 5), "about 40 minutes" (to the nearest 5), "about 1
 * hour 20 minutes", "about 2 hours". The count is active minutes, never
 * exact, so it's always "about".
 */
export function minutesWords(minutes: number): string {
  if (minutes < 1) return 'under a minute';
  if (minutes < 5) return 'a few minutes';
  const m = toFive(minutes);
  if (m < 60) return `about ${m} minutes`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return `about ${hours} ${hours === 1 ? 'hour' : 'hours'}${rest ? ` ${rest} minutes` : ''}`;
}

/**
 * The ⏱️ line (#172): "About 40 minutes of play in the last 7 days." — the
 * minutes of the days whose play was noted, and how many days they played
 * that weren't ("— not recorded on 2 days they played"). Null when they
 * didn't play (the 📅 line says so).
 */
export function minutesText(week: readonly RecentDay[]): string | null {
  const played = week.filter((d) => d.played);
  if (played.length === 0) return null;
  const noted = played.filter((d) => d.minutes !== null);
  const missing = played.length - noted.length;
  if (noted.length === 0) return `How long they played wasn't recorded on ${missing === 1 ? 'that day' : `those ${missing} days`}.`;
  const total = noted.reduce((n, d) => n + (d.minutes ?? 0), 0);
  const words = minutesWords(total);
  const gap = missing > 0 ? ` — not recorded on ${missing === 1 ? '1 day' : `${missing} days`} they played` : '';
  return `${words[0].toUpperCase()}${words.slice(1)} of play in the last 7 days${gap}.`;
}

// --- XP over the last 4 weeks (#169) -------------------------------------------

/** The XP chart's weeks. */
export const XP_WEEKS = 4;

export interface XpWeek {
  /** "15–21 October", "29 September – 5 October". */
  label: string;
  /** Its seven days, oldest first. */
  days: RecentDay[];
  /** "310 XP", "0 XP", or what's known instead: "XP not recorded", "No play noted", "Not recorded". */
  total: string;
}

/** "15–21 October", or across a month "29 September – 5 October". */
export function dayRange(first: string, last: string): string {
  const a = dateOf(first);
  const b = dateOf(last);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`;
  return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

/**
 * The last `XP_WEEKS` weeks of `days` (each ending on today's weekday), oldest
 * first, each with its dates and its XP in words — only from days whose play
 * was noted: a week whose played days weren't is "XP not recorded", one
 * without play "No play noted", one wholly before counting began "Not
 * recorded" (#169, #170). Never a 0 that wasn't noted.
 */
export function xpWeeks(days: readonly RecentDay[]): XpWeek[] {
  const weeks: XpWeek[] = [];
  for (let end = days.length; end >= 7 && weeks.length < XP_WEEKS; end -= 7) {
    const week = days.slice(end - 7, end);
    const noted = week.filter((d) => d.xp !== null);
    const total = noted.length
      ? `${noted.reduce((n, d) => n + (d.xp ?? 0), 0).toLocaleString('en')} XP`
      : week.some((d) => d.played)
        ? 'XP not recorded'
        : week.some((d) => d.counted)
          ? 'No play noted'
          : 'Not recorded';
    weeks.unshift({ label: dayRange(week[0].iso, week[6].iso), days: week, total });
  }
  return weeks;
}

/** The day with the most XP (the latest of a tie), or null when no day has any. */
export function bestXpDay(days: readonly RecentDay[]): RecentDay | null {
  let best: RecentDay | null = null;
  for (const d of days) if ((d.xp ?? 0) > 0 && (best === null || (d.xp ?? 0) >= (best.xp ?? 0))) best = d;
  return best;
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
export function topicMeaning(level: number, start: TopicStart | null, short = false): string | null {
  const band = levelBand(level);
  const pitch = band === 'stretch' ? 'a stretch for their age' : band === 'top' ? 'for the strongest at their age' : null;
  if (!start) return pitch && `${pitch[0].toUpperCase()}${pitch.slice(1)}`;
  // `short`: every topic started at the same place, said once above them (#29 review round 3).
  if (short) {
    if (level < start.level) return 'Below where they started — a good one to practise together';
    if (level === start.level) return 'At the level they started on';
    return `Up ${level - start.level} since they started${pitch ? ` — ${pitch}` : ''}`;
  }
  const from = `level ${start.level}, where they started at age ${start.age}`;
  if (level < start.level) return `Below ${from} — a good one to practise together`;
  if (level === start.level) return `At ${from}`;
  return `Up ${level - start.level} from ${from}${pitch ? ` — ${pitch}` : ''}`;
}

/**
 * The start every noted topic shares, when there are two or more and they all
 * began at the same level at the same age (#29 review round 3: "…where they
 * started at age 6" five times over) — said once above them, the rows shorter.
 */
export function sharedStart(levels: readonly Pick<TopicLevel, 'measured' | 'start'>[]): TopicStart | null {
  const starts = levels.filter((t) => t.measured && t.start !== null).map((t) => t.start as TopicStart);
  if (starts.length < 2) return null;
  const [first] = starts;
  return starts.every((s) => s.level === first.level && s.age === first.age) ? first : null;
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
  /** Answers noted in the last 7 days (#173), or null when none were. */
  answers: { asked: number; right: number } | null;
  /** The level now against the last one noted the week before (days 8–14 back, #173); null when none was (or no level is saved). */
  sinceLastWeek: number | null;
}

/** One topic's answers in the last 7 days and its level a week before (#173). */
export interface TopicWeek {
  asked: number;
  right: number;
  /** The level at the end of the latest day noted 8–14 days back, or null. */
  levelLastWeek: number | null;
}

/**
 * Per topic, from the days noted (#173): the answers of the last 7 days (a
 * day ahead — the kid's device a time zone ahead — counts) and the level at
 * the end of the latest day noted 8–14 days back. Nothing for a topic the
 * days don't mention.
 */
export function topicWeeks(history: readonly PlayDayRecord[] | null, today: string): Partial<Record<Topic, TopicWeek>> {
  const weekStart = isoOffset(today, -(RECENT_DAYS - 1));
  const before = isoOffset(today, -(2 * RECENT_DAYS - 1));
  const ahead = isoOffset(today, 1);
  const out: Partial<Record<Topic, TopicWeek>> = {};
  // The day each topic's `levelLastWeek` is from: the latest wins.
  const levelDay: Partial<Record<Topic, string>> = {};
  for (const d of history ?? []) {
    if (d.day < before || d.day > ahead) continue;
    for (const [id, tally] of Object.entries(d.topics)) {
      if (!tally) continue;
      const topic = id as Topic;
      const t = (out[topic] ??= { asked: 0, right: 0, levelLastWeek: null });
      if (d.day >= weekStart) {
        t.asked += tally.a;
        t.right += tally.r;
      } else if (tally.l !== undefined && d.day > (levelDay[topic] ?? '')) {
        t.levelLastWeek = tally.l;
        levelDay[topic] = d.day;
      }
    }
  }
  return out;
}

/**
 * The 🎯 row's line from the days noted (#173): "Last 7 days: 7 of 10 right ·
 * Up 1 since last week" (or "Down 1…", "Same as last week"). Only what the
 * days hold: no answers noted → no count; no level noted the week before →
 * no change. Null when there's neither.
 */
export function topicWeekText(t: Pick<TopicLevel, 'answers' | 'sinceLastWeek'>): string | null {
  const parts: string[] = [];
  if (t.answers) parts.push(`Last 7 days: ${t.answers.right} of ${t.answers.asked} right`);
  if (t.sinceLastWeek !== null) {
    const n = Math.abs(t.sinceLastWeek);
    parts.push(t.sinceLastWeek > 0 ? `Up ${n} since last week` : t.sinceLastWeek < 0 ? `Down ${n} since last week` : 'Same as last week');
  }
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Where each topic started (#174): the profile's `skill_starts` first (the
 * database keeps the first), then the save's `topicStarts` (an app or a
 * database from before migration 0026 noted them there).
 */
export function topicStartsOf(data: Pick<KidProgressData, 'stats' | 'save'>): Partial<Record<Topic, TopicStart>> {
  return { ...(data.save?.topicStarts ?? {}), ...(data.stats?.skillStarts ?? {}) };
}

/**
 * Every topic, in the game's order, with its question level (1–10) and what
 * it means. Measured topics read against their noted start (`starts`:
 * `topicStartsOf`); the rest stand at the start for the kid's age now
 * (`age`) — where they'd begin if played today. `weeks` (`topicWeeks`) adds
 * the last 7 days' answers and the change since the week before (#173).
 */
export function topicLevels(
  skillLevels: KidStats['skillLevels'],
  age: number,
  starts: SaveData['topicStarts'] = {},
  weeks: Partial<Record<Topic, TopicWeek>> = {},
): TopicLevel[] {
  const ageStart = ageToStartLevel(age);
  const rows = ALL_TOPIC_INFO.map((t) => {
    const saved = skillLevels[t.id];
    const measured = typeof saved === 'number' && Number.isFinite(saved);
    const level = measured ? clampLevel(saved) : ageStart;
    const start = measured ? (starts[t.id] ?? null) : null;
    const week = weeks[t.id];
    return {
      id: t.id,
      label: t.label,
      emoji: t.emoji,
      level,
      measured,
      start,
      answers: week && week.asked > 0 ? { asked: week.asked, right: week.right } : null,
      sinceLastWeek: measured && week?.levelLastWeek != null ? level - week.levelLastWeek : null,
    };
  });
  const short = sharedStart(rows) !== null;
  return rows.map((t) => ({ ...t, meaning: t.measured ? topicMeaning(t.level, t.start, short) : null }));
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

/** This many answers of one topic in the last 7 days, under half of them right, is worth practising together (#173). */
export const ENOUGH_ANSWERS = 5;

export interface Glance {
  /** Days played in the last week, or null when the database can't say (no 0025, or their device's date is set ahead). */
  playedDays: number | null;
  /**
   * The topics that climbed since their noted start: the ones that climbed
   * most when `ranked`, else every one that climbed, in the game's order.
   */
  climbed: TopicLevel[];
  /**
   * Every measured topic has a noted start, and there are two or more: only
   * then can one be said to have climbed most (#29 review round 3 — a topic
   * first tried after the update was crowned over years of Math it can't be
   * compared with).
   */
  ranked: boolean;
  /** Measured topics below their noted start. */
  belowStart: TopicLevel[];
  /** Topics with several questions waiting at the Library, most first. */
  missedByTopic: { label: string; count: number }[];
  missedCount: number;
  /** Topics with `ENOUGH_ANSWERS` or more in the last 7 days, under half of them right (#173), in the game's order. */
  lowRight: { label: string; asked: number; right: number }[];
}

/**
 * The page's opening lines (#29 review round 1): how much they've played,
 * what's going well and what could use a hand — all from what's stored
 * (a topic against the start the game noted for it; several missed questions
 * waiting; under half right in the last 7 days, #173), never guessed: a
 * topic with no noted start is in neither climb list (#29 review round 2).
 * `levels` / `missed` are null where nothing was saved.
 */
export function glance(week: RecentDay[] | null, levels: TopicLevel[] | null, missed: MissedQuestion[] | null): Glance {
  const measured = (levels ?? []).filter((t) => t.measured);
  const started = measured.filter((t): t is TopicLevel & { start: TopicStart } => t.start !== null);
  const ranked = measured.length >= 2 && started.length === measured.length;
  const most = Math.max(0, ...started.map((t) => t.level - t.start.level));
  const counts = new Map<string, number>();
  for (const m of missed ?? []) counts.set(m.topicLabel, (counts.get(m.topicLabel) ?? 0) + 1);
  return {
    playedDays: week ? week.filter((d) => d.played).length : null,
    climbed: ranked ? (most > 0 ? started.filter((t) => t.level - t.start.level === most) : []) : started.filter((t) => t.level > t.start.level),
    ranked,
    belowStart: started.filter((t) => t.level < t.start.level),
    missedByTopic: [...counts]
      .filter(([, n]) => n >= SEVERAL_MISSED)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count })),
    missedCount: missed?.length ?? 0,
    lowRight: (levels ?? [])
      .filter((t) => t.answers !== null && t.answers.asked >= ENOUGH_ANSWERS && t.answers.right * 2 < t.answers.asked)
      .map((t) => ({ label: t.label, asked: t.answers?.asked ?? 0, right: t.answers?.right ?? 0 })),
  };
}

/**
 * What to practise together, grouped by why and every topic named once (#29
 * review round 2: one long line repeated "(below their starting level)" for
 * each and ended "…and 2 more"; round 3: a topic with both reasons was named
 * twice): "To practise together — below where they started, with questions
 * waiting: Creativity (3) · below where they started: Engineering · questions
 * waiting at the Library: Math (4)." Under half right in the last 7 days
 * (#173) is a third why: "· under half right in the last 7 days: Space (2 of
 * 6 right)". Null when nothing stands out.
 */
export function practiseText(g: Pick<Glance, 'belowStart' | 'missedByTopic'> & Partial<Pick<Glance, 'lowRight'>>): string | null {
  const below = new Set(g.belowStart.map((t) => t.label));
  const low = new Map((g.lowRight ?? []).map((t) => [t.label, t]));
  const waiting = new Map(g.missedByTopic.map((m) => [m.label, m.count]));
  // Each topic once, under the reasons it has — groups with more reasons first.
  const groups = new Map<string, string[]>();
  for (const label of new Set([...below, ...low.keys(), ...waiting.keys()])) {
    const key = `${below.has(label) ? 'B' : ''}${low.has(label) ? 'L' : ''}${waiting.has(label) ? 'W' : ''}`;
    const l = low.get(label);
    const counts = [l && `${l.right} of ${l.asked} right`, waiting.has(label) && (l ? `${waiting.get(label)} waiting` : `${waiting.get(label)}`)].filter(Boolean);
    groups.set(key, [...(groups.get(key) ?? []), counts.length ? `${label} (${counts.join(', ')})` : label]);
  }
  const parts = ['BLW', 'BL', 'BW', 'LW', 'B', 'L', 'W']
    .filter((key) => groups.has(key))
    .map((key) => {
      const why = [key.includes('B') && 'below where they started', key.includes('L') && 'under half right in the last 7 days'].filter(Boolean);
      const words = key.includes('W') ? (why.length ? `${why.join(', ')}, with questions waiting` : 'questions waiting at the Library') : why.join(', ');
      return `${words}: ${nameList(groups.get(key) ?? [], Infinity)}`;
    });
  return parts.length > 0 ? `To practise together — ${parts.join(' · ')}.` : null;
}

/**
 * The 🌟 line. `ranked` (every measured topic has a noted start, two or
 * more): "Most progress: Math — up from level 1 to 3 since they started." (or
 * "Math and Science — up 2 levels each …"). Otherwise only what's known, no
 * winner (#29 review round 3): "Up since they started: Maps & Places (level 4
 * → 5)." Null with no climb.
 */
export function climbedText(climbed: readonly TopicLevel[], ranked: boolean): string | null {
  const first = climbed[0];
  if (!first?.start) return null;
  if (!ranked) {
    return `Up since they started: ${nameList(climbed.map((t) => `${t.label} (level ${t.start?.level} → ${t.level})`), Infinity)}.`;
  }
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
