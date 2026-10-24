import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { nextStreak, provesPlayed, todayIso } from '../lib/streak';
import {
  addUnreadStep,
  addUnreadXp,
  forgetUnreadSteps,
  mergeProfiles,
  readLocalProfile,
  readUnreadSteps,
  skillStartsFrom,
  takeUnreadSteps,
  withoutSteps,
  withStepsLock,
  writeLocalProfile,
} from '../lib/profile';
import { useAuthStore } from './authStore';
import { gainXp, levelState } from '../lib/level';
import { takeOwedXp } from '../lib/kidXp';
import {
  addDayXp,
  flushPlayDays,
  markPlayDays,
  MISSING_RECHECK_MS,
  noteDayAnswer,
  noteDayLevel,
  notePlayDay,
  recheckPlayFunctions,
} from '../lib/playDays';
import { ageToStartLevel, clampLevel, playerAge, skillLevelFor } from '../lib/age';
import { withTopicStart } from '../lib/save';
import { isStarterId } from '../content/starterQuestions';
import { useSaveStore } from './saveStore';
import type { PowerUpId, PowerUps, Profile, Question, SkillLevels, Topic, TopicStart } from '../types';

/** Shape of a row in the Supabase `profiles` table (snake_case). */
interface ProfileRow {
  id: string;
  birth_year: number;
  birth_month: number;
  skill_levels: SkillLevels | null;
  xp: number | null;
  level: number | null;
  level_xp: number | null;
  power_ups: PowerUps | null;
  current_streak: number | null;
  longest_streak: number | null;
  last_played_on: string | null;
  /** Where each topic started (migration 0026, #174): absent when read from a database without the column. */
  skill_starts?: unknown;
}

type Starts = Partial<Record<Topic, TopicStart>>;

function fromRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    birthYear: row.birth_year,
    birthMonth: row.birth_month,
    skillLevels: row.skill_levels ?? {},
    xp: row.xp ?? 0,
    // Null until migration 0012 backfills it — levelState falls back to xp.
    ...(row.level != null && row.level_xp != null ? { level: row.level, levelXp: row.level_xp } : {}),
    powerUps: row.power_ups ?? {},
    currentStreak: row.current_streak ?? 0,
    longestStreak: row.longest_streak ?? 0,
    lastPlayedOn: row.last_played_on ?? null,
    ...(row.skill_starts !== undefined ? { skillStarts: skillStartsFrom(row.skill_starts) } : {}),
  };
}

function toRow(p: Profile): ProfileRow {
  const { level, levelXp } = levelState(p);
  return {
    id: p.id,
    birth_year: p.birthYear,
    birth_month: p.birthMonth,
    skill_levels: p.skillLevels,
    xp: p.xp,
    level,
    level_xp: levelXp,
    power_ups: p.powerUps,
    current_streak: p.currentStreak,
    longest_streak: p.longestStreak,
    last_played_on: p.lastPlayedOn,
    // The starts go with a whole-row write when there are any (#174); the
    // server keeps the first for each topic, so sending them again is harmless.
    ...(p.skillStarts && Object.keys(p.skillStarts).length > 0 ? { skill_starts: p.skillStarts } : {}),
  };
}

type Birth = Pick<Profile, 'birthYear' | 'birthMonth'>;

/** `amount` more XP, the level and the XP into it following. */
function withXp(p: Profile, amount: number): Profile {
  const { level, levelXp } = gainXp(levelState(p), amount);
  return { ...p, xp: p.xp + amount, level, levelXp };
}

/** `today` played: the streak moves on (or starts again), the best follows. */
function withDayPlayed(p: Profile, today: string): Profile {
  const currentStreak = nextStreak(p.currentStreak, p.lastPlayedOn, today);
  return { ...p, currentStreak, longestStreak: Math.max(p.longestStreak, currentStreak), lastPlayedOn: today };
}

/** How long after a failed read the row is first asked for again — on a timer, or by the next change. */
export const RETRY_READ_MS = 15_000;

/** The longest wait between reads of an unread row: each read that fails doubles it, from `RETRY_READ_MS` (#176 review round 1). */
export const RETRY_READ_MAX_MS = 5 * 60_000;

/**
 * The kid's `profiles` row couldn't be read (#29 review round 3): the profile
 * in memory is this device's copy (`base`), or — with none — a made-up start
 * (level 1, no topics). Nothing is written to the row until it is read (a
 * made-up or stale profile written back wiped real XP, levels and streaks —
 * #61's class — and noted a topic's start wrongly); play goes on in memory,
 * and the row is asked for again on a timer, as soon as the device is back
 * online, and on the next change after that long (#176) — first after
 * `RETRY_READ_MS`, then twice as long after each read that fails, up to
 * `RETRY_READ_MAX_MS` (review round 1: a server down for an hour was asked
 * every 15 s by every open tab).
 * `xp`: earned since, added to the real total once it's read. `steps`: each
 * topic's net level step since (#176), carried onto the row's level once
 * it's read. `starts`: the start of a topic first played since (the level
 * for the kid's age then, that age and the day) — theirs if the row has no
 * level for it either. With this device's copy (`base`) the steps and the
 * XP are also kept beside it (#180), and those kept are what's put on —
 * every tab's, once (`takeUp`); `unstored`: they couldn't be kept (storage
 * can't be written), so this tab puts on its own.
 */
export interface Unread {
  base: Profile | null;
  xp: number;
  triedAt: number;
  steps: Partial<Record<Topic, number>>;
  starts: Starts;
  unstored?: true;
}

const NO_STEPS: { steps: Partial<Record<Topic, number>>; starts: Starts } = { steps: {}, starts: {} };

/** This device's copy may take a change: always once the row is read; while it isn't, only if the profile came from that copy (never a made-up start). */
function held(unread: Unread | null): boolean {
  return !unread || unread.base !== null;
}

const COLUMNS =
  'id, birth_year, birth_month, skill_levels, xp, level, level_xp, power_ups, current_streak, longest_streak, last_played_on';

/**
 * Whether the database has `profiles.skill_starts` (migration 0026, #174):
 * read and written while it does; a read or write that finds it missing
 * leaves it out for `MISSING_RECHECK_MS` (the save's `topicStarts` still
 * holds every start) — then it's asked for again, and on every profile load
 * (review round 2: remembered for the tab's whole life, a tab left open
 * across the deploy never wrote a start to the profile).
 */
let startsGoneUntil = 0;
/** How long `skill_starts` is left out after the database said it hasn't the column (the same while as a missing note function). */
export const STARTS_RECHECK_MS = MISSING_RECHECK_MS;
const startsColumn = () => Date.now() >= startsGoneUntil;
const startsGone = () => {
  startsGoneUntil = Date.now() + STARTS_RECHECK_MS;
};

/** PostgREST's word for a database without `skill_starts`: "column … does not exist" on a read, "Could not find the 'skill_starts' column" on a write. */
function noStartsColumn(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  return !!e && (e.code === '42703' || e.code === 'PGRST204') && /skill_starts/.test(String(e.message ?? ''));
}

interface Answer {
  data: unknown;
  error: unknown;
}

/**
 * How long the first read of the kid's row may take (#184): one still
 * unanswered by then — a captive portal, a half-open connection, where the
 * browser would wait minutes — ends as a failed read, so the retry and its
 * back-off carry on. The whole read is timed, not only its fetch:
 * supabase-js first waits for the session (a token refresh after the tab
 * slept), which the fetch's abort signal never reaches (#184 review).
 */
export const READ_TIMEOUT_MS = 10_000;

/**
 * The longest a read may take: each read that fails doubles the time the
 * next one gets, from `READ_TIMEOUT_MS` (10 s, 20 s, then 30 s), so a slow
 * connection that does answer gets its row in the end (#184 review).
 */
export const READ_TIMEOUT_MAX_MS = 30_000;

/** How long the next read may take: back to `READ_TIMEOUT_MS` on a read, a load or a clear (`stopWatchingUnread`). */
let readTimeout = READ_TIMEOUT_MS;

/** A read that failed: the next gets twice as long, up to `READ_TIMEOUT_MAX_MS`. */
function readFailed(): void {
  readTimeout = Math.min(READ_TIMEOUT_MAX_MS, readTimeout * 2);
}

/** One read of a kid's row — with their topic starts while the database has them, else without (and not asked for again for a while). */
async function readRow(userId: string): Promise<Answer> {
  const ms = readTimeout;
  const read = async (starts: boolean): Promise<Answer> => {
    const stop = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Whatever is still pending by then — the fetch, or the session it waits
    // for — the read ends as a failed one; the fetch is called off too.
    const late = new Promise<Answer>((resolve) => {
      timer = setTimeout(() => {
        stop.abort();
        resolve({ data: null, error: { message: `AbortError: no answer in ${ms / 1000} s`, code: '' } });
      }, ms);
    });
    try {
      const query = supabase
        .from('profiles')
        .select(starts ? `${COLUMNS}, skill_starts` : COLUMNS)
        .eq('id', userId)
        .abortSignal(stop.signal)
        .maybeSingle();
      return await Promise.race<Answer>([query, late]);
    } finally {
      clearTimeout(timer);
    }
  };
  if (!startsColumn()) return read(false);
  const got = await read(true);
  if (!noStartsColumn(got.error)) return got;
  startsGone();
  return read(false);
}

/**
 * One write to the kid's row (`insert`: create it unless it's there). Any
 * `skill_starts` goes with it while the database has the column (#174); one
 * without it gets the same write again without them. Resolves to the error,
 * if any.
 */
async function writeRow(userId: string, fields: Partial<ProfileRow>, { insert = false } = {}): Promise<unknown> {
  const send = (f: Partial<ProfileRow>): PromiseLike<{ error: unknown }> =>
    insert
      ? supabase.from('profiles').upsert(f, { onConflict: 'id', ignoreDuplicates: true })
      : supabase
          .from('profiles')
          .update({ ...f, updated_at: new Date().toISOString() })
          .eq('id', userId);
  const { skill_starts: starts, ...rest } = fields;
  if (starts === undefined || !startsColumn()) return (await send(rest)).error;
  const { error } = await send(fields);
  if (!noStartsColumn(error)) return error;
  startsGone();
  return (await send(rest)).error;
}

/** Bumped on every load and clear: a read that answers after the kid changed is dropped. */
let readGen = 0;
/**
 * The load (`readGen`) whose unread row is being read again right now: one
 * read at a time for a kid, and never one still out for the last kid that
 * holds up the next kid's (#176 review round 1: a read that hung for the
 * last kid stopped the new kid's timer for good).
 */
let readingGen = -1;
/** How long until the unread row is asked for again: doubled by each read that fails, back to `RETRY_READ_MS` on a read, a load or a clear. */
let retryWait = RETRY_READ_MS;

/** While a row is unread (#176): the timer that asks for it again, and the `online` listener. */
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let onOnline: (() => void) | null = null;

/** Ask for the unread row again in `retryWait`, and as soon as the device is back online — not only on the next change (#176). */
function watchUnread(): void {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void useProfileStore.getState().retryRead({ now: true }), retryWait);
  if (!onOnline && typeof window !== 'undefined') {
    onOnline = () => void useProfileStore.getState().retryRead({ now: true });
    window.addEventListener('online', onOnline);
  }
}

/** The row was read (or the profile put away): no more asking, and the next unread row starts at the first wait and the first read time. */
function stopWatchingUnread(): void {
  clearTimeout(retryTimer);
  retryTimer = undefined;
  retryWait = RETRY_READ_MS;
  readTimeout = READ_TIMEOUT_MS;
  if (onOnline) {
    window.removeEventListener('online', onOnline);
    onOnline = null;
  }
}

/**
 * A question from the server's bank — the rule `lib/questions`'
 * `inQuestionBank` follows (not a starter, nor one that failed to cache);
 * not imported from there, which loads the family store, which loads this
 * one. `profileStore.answers.test` keeps the two the same.
 */
function inBank(id: string): boolean {
  return !!id && !id.startsWith('fresh-') && !isStarterId(id);
}

/**
 * The topic starts in the kid's save that their profile lacks (#174) —
 * noted there before `skill_starts` existed, or by an app or database
 * without it — merged under the profile's own (the first stays); null when
 * there are none, the save isn't this kid's (or isn't loaded), or the
 * database has no column for them.
 */
function startsToCarry(p: Profile): Starts | null {
  if (!startsColumn()) return null;
  const { userId, save, status } = useSaveStore.getState();
  if (userId !== p.id || !save || status !== 'ready') return null;
  const missing = (Object.keys(save.topicStarts) as Topic[]).filter((t) => !p.skillStarts?.[t]);
  if (missing.length === 0) return null;
  return { ...Object.fromEntries(missing.map((t) => [t, save.topicStarts[t]])), ...p.skillStarts };
}

/**
 * A working profile to use when the Supabase `profiles` row is missing (the
 * auto-create trigger never ran, the migration isn't applied, or we're
 * offline). Birth date comes from the kid's family row (or an old account's
 * sign-up metadata) so age-based difficulty stays correct; everything else
 * starts fresh. Without this, a missing row left `profile` null and silently
 * dropped all XP — the level gauge never moved.
 */
function defaultProfile(userId: string, birth?: Birth): Profile {
  const meta = useAuthStore.getState().session?.user?.user_metadata as
    | { birth_year?: number; birth_month?: number }
    | undefined;
  return {
    id: userId,
    birthYear: birth?.birthYear ?? meta?.birth_year ?? new Date().getFullYear() - 10,
    birthMonth: birth?.birthMonth ?? meta?.birth_month ?? 1,
    skillLevels: {},
    xp: 0,
    level: 1,
    levelXp: 0,
    powerUps: {},
    currentStreak: 0,
    longestStreak: 0,
    lastPlayedOn: null,
  };
}

interface ProfileStore {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  /** Set when remote persistence is failing (local progress still works). */
  remoteError: string | null;
  /** Set while the kid's row hasn't been read (the read failed): nothing is written to it meanwhile (#29 review round 3). */
  unread: Unread | null;
  /** Fetch a kid's profile row; `birth` seeds a fresh profile if the read fails. */
  loadProfile: (userId: string, birth?: Birth) => Promise<void>;
  /**
   * After a failed read: read the row again (one at a time; the wait since
   * the last try — `RETRY_READ_MS`, doubled by each failure — unless `now`:
   * the timer and coming back online) and take it up with what was played
   * since.
   */
  retryRead: (opts?: { now?: boolean }) => Promise<void>;
  /**
   * Persist a new skill level for one topic (optimistic update). The first
   * time a topic's level is saved, where it started — the level for the kid's
   * age now, the one the round began from — is noted on their profile
   * (`skill_starts`, #174) and in their save (`topicStarts`, #29 review
   * round 2) — only once the row has been read: "no level here" in a profile
   * that wasn't read says nothing (round 3); the step is kept instead (#176).
   */
  setSkillLevel: (topic: Topic, level: number) => Promise<void>;
  /** Add experience points (optimistic update). Any XP earned is play, so it counts the day too (`recordActivity`). */
  addXp: (amount: number) => Promise<void>;
  /** Record a power-up chosen on level-up (optimistic update). */
  addPowerUp: (id: PowerUpId) => Promise<void>;
  /** Advance the daily streak and note the day played (#28, #29): after a round, a battle, any XP earned, and five active minutes (#177). */
  recordActivity: () => Promise<void>;
  /**
   * A question answered — the final pick (#173): counted in today's tally
   * for its topic, bank questions only (starters repeat), asked at most one
   * level above the topic's level (review round 2), with the topic's level
   * now once the row has been read.
   */
  noteAnswer: (question: Pick<Question, 'id' | 'topic' | 'level'>, correct: boolean) => void;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  profile: null,
  loading: false,
  error: null,
  remoteError: null,
  unread: null,

  loadProfile: async (userId, birth) => {
    const gen = ++readGen;
    stopWatchingUnread();
    // A migration found missing a while ago may be there now (review round 2): asked for again.
    startsGoneUntil = 0;
    recheckPlayFunctions();
    set({ loading: true, error: null });
    const { data, error } = await readRow(userId);
    if (gen !== readGen) return; // another kid was picked (or the game put away) meanwhile
    const local = readLocalProfile(userId);
    // Level steps played on the copy while the row was unread (#180) —
    // before a reload, or in another tab of the kid, so read as the row
    // answers: they come off the copy for the profile the row is merged
    // with, and go on again from the row's levels once it's read.
    const kept = local ? readUnreadSteps(userId) : null;
    const base = local && kept ? withoutSteps(local, kept) : local;

    if (data && local && kept) {
      set({ profile: local, loading: false, unread: { base, xp: kept.xp ?? 0, triedAt: Date.now(), steps: kept.steps, starts: kept.starts } });
      await takeUp(userId, gen, data);
      payOwedXp(userId, gen);
      return;
    }

    if (data) {
      // Reconcile the remote row with any local progress, keeping the higher of
      // each — this protects a player whose remote writes are silently failing
      // (e.g. an RLS policy not applied on the live DB) from being reset to
      // Level 1 by a remote row stuck at 0.
      const remote = fromRow(data as ProfileRow);
      let merged = mergeProfiles(remote, local);
      // Starts noted in the save the profile lacks go onto it (#174) — now if
      // the save is here, else once it is.
      const carried = startsToCarry(merged);
      if (carried) merged = { ...merged, skillStarts: carried };
      set({ profile: merged, loading: false, remoteError: null, unread: null });
      // Days the profile proves played — its last day, and the days its live
      // streak counts, here or on another device: this device's play for
      // them goes up too (review rounds 1–2).
      const today = todayIso();
      markPlayDays(userId, (d) => provesPlayed(merged, d, today));
      // Days played while offline (or before migration 0025) go up now (#29),
      // even after a failed send this session (unless 0025 isn't there).
      void flushPlayDays(userId, { now: true });
      writeLocalProfile(merged);
      forgetUnreadSteps(userId);
      // If the local cache was ahead, best-effort push the merge back up.
      const remoteLevel = levelState(remote);
      const mergedLevel = levelState(merged);
      // Also push when the row has no saved level yet (migration 0012 not run
      // when it was last written) or the local cache's level is ahead.
      const push =
        (local && merged.xp > remote.xp) ||
        remote.level == null ||
        mergedLevel.level !== remoteLevel.level ||
        mergedLevel.levelXp !== remoteLevel.levelXp;
      const sent = push ? writeRow(userId, toRow(merged)) : carried ? writeRow(userId, { skill_starts: carried }) : null;
      void sent?.then((e) => {
        if (e) set({ remoteError: errorMessage(e) });
      });
      if (!carried) carryWhenSaved(userId, gen);
      payOwedXp(userId, gen, sent);
      return;
    }

    if (error) {
      // The read FAILED — never overwrite the remote row with a zeroed default
      // (the old bug that destroyed XP). Fall back to the local cache if we have
      // one, else an in-memory default; surface the failure. Nothing is written
      // to the row until it's read (`unread`, #29 review round 3), and a
      // made-up default never becomes this device's copy.
      const profile = local ?? defaultProfile(userId, birth);
      set({
        profile,
        loading: false,
        remoteError: errorMessage(error),
        unread: { base, xp: kept?.xp ?? 0, triedAt: Date.now(), steps: kept?.steps ?? {}, starts: kept?.starts ?? {} },
      });
      readFailed();
      watchUnread();
      payOwedXp(userId, gen); // held until the row is read, like any XP
      return;
    }

    // Genuinely no row. Seed from local progress if we have any, and create it
    // with DO-NOTHING-on-conflict so a racing/existing row is never clobbered.
    const seed = local ?? defaultProfile(userId, birth);
    set({ profile: seed, loading: false, remoteError: null, unread: null });
    writeLocalProfile(seed);
    forgetUnreadSteps(userId);
    const created = writeRow(userId, toRow(seed), { insert: true });
    void created.then((e) => {
      if (e) set({ remoteError: errorMessage(e) });
    });
    payOwedXp(userId, gen, created);
  },

  retryRead: async ({ now: soon = false } = {}) => {
    const { profile, unread } = get();
    // A read already out for this kid re-arms the timer when it answers.
    if (!profile || !unread || readingGen === readGen || (!soon && Date.now() - unread.triedAt < retryWait)) return;
    const gen = readGen;
    const userId = profile.id;
    readingGen = gen;
    clearTimeout(retryTimer);
    set({ unread: { ...unread, triedAt: Date.now() } });
    let got: Answer;
    try {
      got = await readRow(userId);
    } catch (err) {
      got = { data: null, error: err };
    } finally {
      if (readingGen === gen) readingGen = -1;
    }
    const now = get();
    if (gen !== readGen || !now.profile || !now.unread) return; // another kid, or the game put away, meanwhile
    if (got.error) {
      set({ remoteError: errorMessage(got.error) });
      retryWait = Math.min(RETRY_READ_MAX_MS, retryWait * 2);
      readFailed(); // and the next read may take longer (#184 review)
      watchUnread(); // again in a while (longer each time), or once back online
      return;
    }
    await takeUp(userId, gen, got.data);
  },

  setSkillLevel: async (topic, level) => {
    const { profile, unread } = get();
    if (!profile) return;
    const age = playerAge(profile);
    const today = todayIso();
    const was = profile.skillLevels[topic];
    // Its first saved level: until now the topic stood at the start for the
    // kid's age (`skillLevelFor`) — the round began from there. With the day
    // (#183): the database works the start's age out from it and the kid's
    // birth date, so a birth date corrected later (or one this device holds
    // stale) still gives the right age.
    const start: TopicStart | null = was === undefined ? { level: ageToStartLevel(age), age, on: today } : null;
    const skillLevels = { ...profile.skillLevels, [topic]: level };
    let updated: Profile = { ...profile, skillLevels };
    if (unread) {
      // Not read: no start noted and no level for today — "no level here"
      // says nothing about a profile that wasn't read. The step from where it
      // was is kept for when the row is read (#176), and the start it was
      // played from, in case the row has no level for it either.
      const step = level - (was ?? (start as TopicStart).level);
      const steps = { ...unread.steps, [topic]: (unread.steps[topic] ?? 0) + step };
      const fresh = start && !unread.starts[topic] ? start : undefined;
      const starts = fresh ? { ...unread.starts, [topic]: fresh } : unread.starts;
      // Durable locally even if the remote write fails — and the step beside
      // it, added to what's kept (#180): a reload keeps a step down, and two
      // tabs of the kid put each step on once.
      let unstored = unread.unstored;
      if (held(unread)) {
        writeLocalProfile(updated);
        if (!addUnreadStep(profile.id, topic, step, fresh)) unstored = true;
      }
      set({ profile: updated, unread: { ...unread, steps, starts, ...(unstored ? { unstored } : {}) } }); // optimistic
      void get().retryRead(); // the row first: nothing is written over it unread
      return;
    }
    let starts: Starts | null = null;
    if (start) {
      // Note that start, and the age, for good: on the profile (#174) and in
      // the save — for a database or an app without `skill_starts`. One the
      // profile or the save already holds stays (the first is the start).
      const saves = useSaveStore.getState();
      const mine = saves.userId === profile.id ? saves : null;
      const first = profile.skillStarts?.[topic] ?? mine?.save?.topicStarts[topic] ?? start;
      starts = { ...profile.skillStarts, [topic]: first };
      updated = { ...updated, skillStarts: starts };
      mine?.update((s) => withTopicStart(s, topic, first));
    }
    set({ profile: updated }); // optimistic
    writeLocalProfile(updated); // durable locally even if the remote write fails
    void noteDayLevel(profile.id, today, topic, level, { played: provesPlayed(updated, today, today) }); // the topic's level today (#173)
    const error = await writeRow(profile.id, { skill_levels: skillLevels, ...(starts ? { skill_starts: starts } : {}) });
    if (error) set({ remoteError: errorMessage(error) });
  },

  addXp: async (amount) => {
    const { profile, unread } = get();
    if (!profile || amount <= 0) return;
    const updated = withXp(profile, amount);
    let unstored = unread?.unstored;
    if (held(unread)) {
      writeLocalProfile(updated);
      // While unread, the XP is kept beside the copy too (#180 review): after a
      // reload it goes on top of the row, never lost to "the higher wins".
      if (unread && !addUnreadXp(profile.id, amount, { xp: profile.xp, ...levelState(profile) })) unstored = true;
    }
    set({ profile: updated, ...(unread ? { unread: { ...unread, xp: unread.xp + amount, ...(unstored ? { unstored } : {}) } } : {}) }); // optimistic
    // Today's XP for 📈 Progress (#169) — real even while the row is unread.
    const today = todayIso();
    void addDayXp(profile.id, today, amount, { played: provesPlayed(profile, today, today) });
    // Every XP the game pays — typing lessons, the Library, a shrine, the
    // Scriptorium, not only rounds and battles — is a day played (#29 review
    // round 1): the streak, "last played" and 📈 Progress's week agree.
    void get().recordActivity();
    if (unread) {
      void get().retryRead(); // the row first: nothing is written over it unread
      return;
    }
    const error = await writeRow(profile.id, { xp: updated.xp, level: updated.level, level_xp: updated.levelXp });
    if (error) set({ remoteError: errorMessage(error) });
  },

  addPowerUp: async (id) => {
    const { profile, unread } = get();
    if (!profile) return;
    const powerUps = { ...profile.powerUps, [id]: (profile.powerUps[id] ?? 0) + 1 };
    const updated = { ...profile, powerUps };
    set({ profile: updated }); // optimistic
    if (held(unread)) writeLocalProfile(updated);
    if (unread) {
      void get().retryRead(); // the row first: nothing is written over it unread
      return;
    }
    const error = await writeRow(profile.id, { power_ups: powerUps });
    if (error) set({ remoteError: errorMessage(error) });
  },

  recordActivity: async () => {
    const { profile, unread } = get();
    if (!profile) return;
    const today = todayIso();
    // Same day — don't write or even nudge the streak. Today already counts
    // as played (maybe on another device or browser), so this device's play
    // for it — and for any day the streak proves — is sent too (review
    // rounds 1–2), with what else is waiting: a couple of minutes after the
    // last send at most, unless a send just failed (lib/playDays, #29).
    if (profile.lastPlayedOn === today) {
      markPlayDays(profile.id, (d) => provesPlayed(profile, d, today));
      void flushPlayDays(profile.id);
      return;
    }
    const updated = withDayPlayed(profile, today);
    set({ profile: updated });
    if (held(unread)) writeLocalProfile(updated);
    // A new day played: kept for 👪 Grown-ups → 📈 Progress (#29, migration 0025)
    // — the day itself, true whatever the profile holds — with any day the
    // streak it continues proves.
    markPlayDays(profile.id, (d) => provesPlayed(updated, d, today));
    void notePlayDay(profile.id, today);
    if (unread) {
      void get().retryRead(); // the row first: nothing is written over it unread
      return;
    }
    const error = await writeRow(profile.id, {
      current_streak: updated.currentStreak,
      longest_streak: updated.longestStreak,
      last_played_on: today,
    });
    if (error) set({ remoteError: errorMessage(error) });
  },

  noteAnswer: (question, correct) => {
    // Called as the kid picks an answer: nothing here may get in the way of it.
    try {
      const { profile, unread } = get();
      if (!profile || !inBank(question.id)) return;
      const now = skillLevelFor(profile.skillLevels ?? {}, question.topic, playerAge(profile));
      // Only questions asked at most one level above the topic's level count
      // toward its "right" (review round 2): a spell or a Pair Attack asks
      // three above on purpose (`SPELL_LEVEL_BONUS`), the Spire up to three,
      // a speed boost +2 on its second step — hard on purpose, not a sign of
      // a topic to practise. A boost's first step (+1) still counts.
      if (!(question.level <= now + 1)) return;
      // The level it was answered at — only from a row that was read: a
      // made-up start's level isn't theirs (the answer itself still counts).
      const level = unread ? undefined : now;
      const today = todayIso();
      void noteDayAnswer(profile.id, today, question.topic, correct, level, { played: provesPlayed(profile, today, today) });
    } catch (err) {
      console.warn('Noting an answer failed:', errorMessage(err));
    }
  },

  clearProfile: () => {
    readGen += 1;
    stopWatchingUnread();
    set({ profile: null, loading: false, error: null, remoteError: null, unread: null });
  },
}));

/**
 * The unread row was read (#176): taken up as if the page had loaded with
 * the copy this device had (`unread.base`), then what was played since — the
 * XP earned, today played, each level step from the row's level — and the
 * result written. From `retryRead`, and from a load that finds steps kept
 * from before a reload or by another tab (#180). The steps (and XP) put on
 * are those kept beside the copy, taken under the kid's steps lock: two tabs
 * of the kid that read the row put them on once — the second finds them gone
 * and takes each topic it stepped from the copy the first one left.
 */
/**
 * XP the kid earned as Player 2 on this device that couldn't be saved then
 * (`lib/kidXp.ts`), paid now through `addXp` — so it goes the way any XP does
 * (held while the row is unread, today's XP for 📈 Progress) — once `after`
 * (the load's own write) has landed, so that write can't land over it. Another
 * kid loaded meanwhile: it stays owed.
 */
function payOwedXp(userId: string, gen: number, after?: Promise<unknown> | null): void {
  void Promise.resolve(after).then(() => {
    const store = useProfileStore.getState();
    if (gen !== readGen || store.profile?.id !== userId) return;
    const owed = takeOwedXp(userId);
    if (owed > 0) void store.addXp(owed);
  });
}

async function takeUp(userId: string, gen: number, data: unknown): Promise<void> {
  const done = await withStepsLock(userId, () => takeUpNow(userId, gen, data));
  if (!done) return;
  const error = await writeRow(userId, toRow(done.merged), { insert: !data });
  if (error) useProfileStore.setState({ remoteError: errorMessage(error) });
  if (!done.carried) carryWhenSaved(userId, gen);
}

/** `takeUp`'s work, all in one synchronous step (inside the lock): null when the kid changed, or the row was taken up already, while the lock was waited for. */
function takeUpNow(userId: string, gen: number, data: unknown): { merged: Profile; carried: Starts | null } | null {
  const { profile, unread } = useProfileStore.getState();
  if (gen !== readGen || !profile || !unread || profile.id !== userId) return null;
  stopWatchingUnread();
  const today = todayIso();
  const played = profile.lastPlayedOn === today;
  // The steps to put on: with this device's copy, those kept beside it —
  // every tab's not taken up yet, maybe none if another tab just took them
  // (they're on the row then); this tab's own without a copy (a made-up
  // start) or when they couldn't be kept.
  const taken = unread.base ? takeUnreadSteps(userId) : null;
  const own = !unread.base || unread.unstored;
  const { steps, starts: firstPlayed } = own ? unread : (taken ?? NO_STEPS);
  /** The XP earned since: kept beside the copy like the steps, or this tab's own. */
  const xpSince = own ? unread.xp : (taken?.xp ?? 0);
  let merged: Profile;
  /** The topics the row (with this device's copy) has a level for — before the steps go on. */
  let rowLevels: SkillLevels = {};
  if (data) {
    // As if the page had loaded with the copy this device had — then what
    // was played since: its XP added, today counted on the real streak.
    // Power-ups chosen since count (the higher wins, as always) only from
    // a real copy, never from a made-up start.
    merged = mergeProfiles(fromRow(data as ProfileRow), unread.base);
    if (unread.base) merged = mergeProfiles(merged, { ...merged, powerUps: profile.powerUps });
    if (xpSince > 0) merged = withXp(merged, xpSince);
    if (played && merged.lastPlayedOn !== today) merged = withDayPlayed(merged, today);
    // Levels moved since go on as steps (#176): a topic the row has a level
    // for moves from it by as much as it moved here; one it hasn't moves
    // from the start it was first played from — the level played to (its
    // start for the kid's age was the real one), in whichever tab.
    rowLevels = merged.skillLevels;
    const skillLevels = { ...rowLevels };
    for (const topic of Object.keys(steps) as Topic[]) {
      const from = rowLevels[topic] ?? firstPlayed[topic]?.level;
      const here = profile.skillLevels[topic];
      if (from !== undefined) skillLevels[topic] = clampLevel(from + (steps[topic] ?? 0));
      else if (here !== undefined) skillLevels[topic] = here;
    }
    // A topic stepped here whose kept step another tab of the kid took up
    // first (#180 review): it's on the row that tab wrote and in the copy it
    // left, but the row this tab read may be from before that write — and
    // "the higher wins" would undo a step down. Its level is the copy's.
    if (unread.base && !unread.unstored) {
      const copy = readLocalProfile(userId);
      for (const topic of Object.keys(unread.steps) as Topic[]) {
        const level = copy?.skillLevels[topic];
        if (steps[topic] === undefined && level !== undefined) skillLevels[topic] = level;
      }
    }
    merged = { ...merged, skillLevels };
  } else {
    // No row after all (a new kid): what's in memory is all there is.
    merged = profile;
  }
  // A topic first played since that the row has no level for: the start it
  // was played from is its real start, noted now — on the profile and in
  // the save (the first one noted stays).
  const noted = (Object.keys(firstPlayed) as Topic[]).filter((t) => rowLevels[t] === undefined && merged.skillLevels[t] !== undefined);
  if (noted.length > 0) {
    merged = { ...merged, skillStarts: { ...Object.fromEntries(noted.map((t) => [t, firstPlayed[t]])), ...merged.skillStarts } };
    const saves = useSaveStore.getState();
    if (saves.userId === userId) {
      saves.update((s) => noted.reduce((acc, t) => withTopicStart(acc, t, merged.skillStarts?.[t] as TopicStart), s));
    }
  }
  const carried = startsToCarry(merged);
  if (carried) merged = { ...merged, skillStarts: carried };
  useProfileStore.setState({ profile: merged, remoteError: null, unread: null });
  writeLocalProfile(merged);
  // Days the row proves played (maybe by another device): this device's play for them goes up too (review rounds 1–2).
  markPlayDays(userId, (d) => provesPlayed(merged, d, today));
  void flushPlayDays(userId, { now: true });
  // Each level moved since is the topic's level today now (#173).
  for (const topic of Object.keys(steps) as Topic[]) {
    const level = merged.skillLevels[topic];
    if (level !== undefined) void noteDayLevel(userId, today, topic, level, { played: provesPlayed(merged, today, today) });
  }
  return { merged, carried };
}

/**
 * Whether the profile in play proves `kidId` played on `day` — its last day
 * played, or a day its live streak counts (#29 review round 2). Play noted
 * for such a day goes up like any played day's (`lib/playDays`' `played`):
 * the minute watcher asks (`App`), as `noteAnswer`, `addXp` and
 * `setSkillLevel` do here. A day nobody has played yet proves nothing — until
 * five active minutes here count it (`countMinutesPlayed`, #177).
 */
export function dayPlayed(kidId: string, day: string): boolean {
  const { profile } = useProfileStore.getState();
  return !!profile && profile.id === kidId && provesPlayed(profile, day, todayIso());
}

/**
 * Five active minutes on this device count the day as played (#177, the
 * lead's call — `lib/activeMinutes`, wired in `App`): `recordActivity`, as a
 * round or XP would, so the 🔥 streak, "last played", 📈's week and the
 * minutes agree, and the day goes up on the usual sends. For the kid in play
 * only.
 */
export function countMinutesPlayed(kidId: string): void {
  const { profile, recordActivity } = useProfileStore.getState();
  if (profile?.id === kidId) void recordActivity();
}

/**
 * Once the kid's save is here too, carry the starts it holds that the
 * profile lacks onto the row (#174) — one write. The save and the profile
 * load side by side, so on a load the save is often still on its way. Stops
 * at the next load or clear.
 */
function carryWhenSaved(userId: string, gen: number): void {
  const now = useSaveStore.getState();
  if (!startsColumn() || (now.userId === userId && now.status === 'ready')) return; // nothing to wait for
  const unsubscribe = useSaveStore.subscribe((s) => {
    if (gen !== readGen) return unsubscribe();
    if (s.userId !== userId || s.status !== 'ready' || !s.save) return;
    unsubscribe();
    const { profile, unread } = useProfileStore.getState();
    if (!profile || profile.id !== userId || unread) return;
    const carried = startsToCarry(profile);
    if (!carried) return;
    const updated = { ...profile, skillStarts: carried };
    useProfileStore.setState({ profile: updated });
    writeLocalProfile(updated);
    void writeRow(userId, { skill_starts: carried }).then((e) => {
      if (e) useProfileStore.setState({ remoteError: errorMessage(e) });
    });
  });
}
