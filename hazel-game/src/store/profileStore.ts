import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { nextStreak, todayIso } from '../lib/streak';
import { mergeProfiles, readLocalProfile, skillStartsFrom, writeLocalProfile } from '../lib/profile';
import { useAuthStore } from './authStore';
import { gainXp, levelState } from '../lib/level';
import { addDayXp, flushPlayDays, noteDayAnswer, noteDayLevel, notePlayDay } from '../lib/playDays';
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

/** How long after a failed read the row is asked for again — on a timer, or by the next change. */
export const RETRY_READ_MS = 15_000;

/**
 * The kid's `profiles` row couldn't be read (#29 review round 3): the profile
 * in memory is this device's copy (`base`), or — with none — a made-up start
 * (level 1, no topics). Nothing is written to the row until it is read (a
 * made-up or stale profile written back wiped real XP, levels and streaks —
 * #61's class — and noted a topic's start wrongly); play goes on in memory,
 * and the row is asked for again every `RETRY_READ_MS`, as soon as the
 * device is back online, and on the next change after that long (#176).
 * `xp`: earned since, added to the real total once it's read. `steps`: each
 * topic's net level step since (#176), carried onto the row's level once
 * it's read. `starts`: the start of a topic first played since (the level
 * for the kid's age then, and that age) — theirs if the row has no level for
 * it either.
 */
export interface Unread {
  base: Profile | null;
  xp: number;
  triedAt: number;
  steps: Partial<Record<Topic, number>>;
  starts: Starts;
}

/** This device's copy may take a change: always once the row is read; while it isn't, only if the profile came from that copy (never a made-up start). */
function held(unread: Unread | null): boolean {
  return !unread || unread.base !== null;
}

const COLUMNS =
  'id, birth_year, birth_month, skill_levels, xp, level, level_xp, power_ups, current_streak, longest_streak, last_played_on';

/**
 * Whether the database has `profiles.skill_starts` (migration 0026, #174):
 * read and written while it does; the first read or write that finds it
 * missing leaves it out for the rest of the session (the save's
 * `topicStarts` still holds every start).
 */
let startsColumn = true;

/** PostgREST's word for a database without `skill_starts`: "column … does not exist" on a read, "Could not find the 'skill_starts' column" on a write. */
function noStartsColumn(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  return !!e && (e.code === '42703' || e.code === 'PGRST204') && /skill_starts/.test(String(e.message ?? ''));
}

interface Answer {
  data: unknown;
  error: unknown;
}

/** One read of a kid's row — with their topic starts while the database has them, else without (and not asked for again). */
async function readRow(userId: string): Promise<Answer> {
  const read = (starts: boolean): PromiseLike<Answer> =>
    supabase
      .from('profiles')
      .select(starts ? `${COLUMNS}, skill_starts` : COLUMNS)
      .eq('id', userId)
      .maybeSingle();
  if (!startsColumn) return read(false);
  const got = await read(true);
  if (!noStartsColumn(got.error)) return got;
  startsColumn = false;
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
  if (starts === undefined || !startsColumn) return (await send(rest)).error;
  const { error } = await send(fields);
  if (!noStartsColumn(error)) return error;
  startsColumn = false;
  return (await send(rest)).error;
}

/** Bumped on every load and clear: a read that answers after the kid changed is dropped. */
let readGen = 0;
let reading = false;

/** While a row is unread (#176): the timer that asks for it again, and the `online` listener. */
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let onOnline: (() => void) | null = null;

/** Ask for the unread row again in `RETRY_READ_MS`, and as soon as the device is back online — not only on the next change (#176). */
function watchUnread(): void {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void useProfileStore.getState().retryRead({ now: true }), RETRY_READ_MS);
  if (!onOnline && typeof window !== 'undefined') {
    onOnline = () => void useProfileStore.getState().retryRead({ now: true });
    window.addEventListener('online', onOnline);
  }
}

/** The row was read (or the profile put away): no more asking. */
function stopWatchingUnread(): void {
  clearTimeout(retryTimer);
  retryTimer = undefined;
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
  if (!startsColumn) return null;
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
   * After a failed read: read the row again (one at a time; `RETRY_READ_MS`
   * apart unless `now` — the timer and coming back online) and take it up
   * with what was played since.
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
  /** Advance the daily streak and note the day played (#28, #29): after a round, a battle, and any XP earned. */
  recordActivity: () => Promise<void>;
  /**
   * A question answered — the final pick (#173): counted in today's tally
   * for its topic, bank questions only (starters repeat), with the topic's
   * level now once the row has been read.
   */
  noteAnswer: (question: Pick<Question, 'id' | 'topic'>, correct: boolean) => void;
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
    set({ loading: true, error: null });
    const local = readLocalProfile(userId);
    const { data, error } = await readRow(userId);
    if (gen !== readGen) return; // another kid was picked (or the game put away) meanwhile

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
      // Days played while offline (or before migration 0025) go up now (#29),
      // even after a failed send this session (unless 0025 isn't there).
      void flushPlayDays(userId, { now: true });
      writeLocalProfile(merged);
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
        unread: { base: local, xp: 0, triedAt: Date.now(), steps: {}, starts: {} },
      });
      watchUnread();
      return;
    }

    // Genuinely no row. Seed from local progress if we have any, and create it
    // with DO-NOTHING-on-conflict so a racing/existing row is never clobbered.
    const seed = local ?? defaultProfile(userId, birth);
    set({ profile: seed, loading: false, remoteError: null, unread: null });
    writeLocalProfile(seed);
    void writeRow(userId, toRow(seed), { insert: true }).then((e) => {
      if (e) set({ remoteError: errorMessage(e) });
    });
  },

  retryRead: async ({ now: soon = false } = {}) => {
    const { profile, unread } = get();
    if (!profile || !unread || reading || (!soon && Date.now() - unread.triedAt < RETRY_READ_MS)) return;
    const gen = readGen;
    const userId = profile.id;
    reading = true;
    clearTimeout(retryTimer);
    set({ unread: { ...unread, triedAt: Date.now() } });
    let got: Answer;
    try {
      got = await readRow(userId);
    } catch (err) {
      got = { data: null, error: err };
    } finally {
      reading = false;
    }
    const now = get();
    if (gen !== readGen || !now.profile || !now.unread) return; // another kid, or the game put away, meanwhile
    if (got.error) {
      set({ remoteError: errorMessage(got.error) });
      watchUnread(); // again in a while, or once back online
      return;
    }
    stopWatchingUnread();
    const today = todayIso();
    const played = now.profile.lastPlayedOn === today;
    const { steps, starts: firstPlayed } = now.unread;
    let merged: Profile;
    /** The topics the row (with this device's copy) has a level for — before the steps go on. */
    let rowLevels: SkillLevels = {};
    if (got.data) {
      // As if the page had loaded with the copy this device had — then what
      // was played since: its XP added, today counted on the real streak.
      // Power-ups chosen since count (the higher wins, as always) only from
      // a real copy, never from a made-up start.
      merged = mergeProfiles(fromRow(got.data as ProfileRow), now.unread.base);
      if (now.unread.base) merged = mergeProfiles(merged, { ...merged, powerUps: now.profile.powerUps });
      if (now.unread.xp > 0) merged = withXp(merged, now.unread.xp);
      if (played && merged.lastPlayedOn !== today) merged = withDayPlayed(merged, today);
      // Levels moved since go on as steps (#176): a topic the row has a level
      // for moves from it by as much as it moved here; one it hasn't keeps
      // the level played to — its start for the kid's age was the real one.
      rowLevels = merged.skillLevels;
      const skillLevels = { ...rowLevels };
      for (const topic of Object.keys(steps) as Topic[]) {
        const from = rowLevels[topic];
        const here = now.profile.skillLevels[topic];
        if (from !== undefined) skillLevels[topic] = clampLevel(from + (steps[topic] ?? 0));
        else if (here !== undefined) skillLevels[topic] = here;
      }
      merged = { ...merged, skillLevels };
    } else {
      // No row after all (a new kid): what's in memory is all there is.
      merged = now.profile;
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
    set({ profile: merged, remoteError: null, unread: null });
    writeLocalProfile(merged);
    // Each level moved since is the topic's level today now (#173).
    for (const topic of Object.keys(steps) as Topic[]) {
      const level = merged.skillLevels[topic];
      if (level !== undefined) void noteDayLevel(userId, today, topic, level);
    }
    const error = await writeRow(userId, toRow(merged), { insert: !got.data });
    if (error) set({ remoteError: errorMessage(error) });
    if (!carried) carryWhenSaved(userId, gen);
  },

  setSkillLevel: async (topic, level) => {
    const { profile, unread } = get();
    if (!profile) return;
    const age = playerAge(profile);
    const was = profile.skillLevels[topic];
    // Its first saved level: until now the topic stood at the start for the
    // kid's age (`skillLevelFor`) — the round began from there.
    const start: TopicStart | null = was === undefined ? { level: ageToStartLevel(age), age } : null;
    const skillLevels = { ...profile.skillLevels, [topic]: level };
    let updated: Profile = { ...profile, skillLevels };
    if (unread) {
      // Not read: no start noted and no level for today — "no level here"
      // says nothing about a profile that wasn't read. The step from where it
      // was is kept for when the row is read (#176), and the start it was
      // played from, in case the row has no level for it either.
      const step = level - (was ?? (start as TopicStart).level);
      set({
        profile: updated, // optimistic
        unread: {
          ...unread,
          steps: { ...unread.steps, [topic]: (unread.steps[topic] ?? 0) + step },
          starts: start && !unread.starts[topic] ? { ...unread.starts, [topic]: start } : unread.starts,
        },
      });
      if (held(unread)) writeLocalProfile(updated); // durable locally even if the remote write fails
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
    void noteDayLevel(profile.id, todayIso(), topic, level); // the topic's level today (#173)
    const error = await writeRow(profile.id, { skill_levels: skillLevels, ...(starts ? { skill_starts: starts } : {}) });
    if (error) set({ remoteError: errorMessage(error) });
  },

  addXp: async (amount) => {
    const { profile, unread } = get();
    if (!profile || amount <= 0) return;
    const updated = withXp(profile, amount);
    set({ profile: updated, ...(unread ? { unread: { ...unread, xp: unread.xp + amount } } : {}) }); // optimistic
    if (held(unread)) writeLocalProfile(updated);
    // Today's XP for 📈 Progress (#169) — real even while the row is unread.
    void addDayXp(profile.id, todayIso(), amount);
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
    // Same-day no-op — don't write or even nudge the streak. What's waiting
    // on this device is sent, a couple of minutes after the last send at
    // most, unless a send just failed (lib/playDays, #29).
    if (profile.lastPlayedOn === today) {
      void flushPlayDays(profile.id);
      return;
    }
    const updated = withDayPlayed(profile, today);
    set({ profile: updated });
    if (held(unread)) writeLocalProfile(updated);
    // A new day played: kept for 👪 Grown-ups → 📈 Progress (#29, migration 0025)
    // — the day itself, true whatever the profile holds.
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
      // The level it was answered at — only from a row that was read: a
      // made-up start's level isn't theirs (the answer itself still counts).
      const level = unread ? undefined : skillLevelFor(profile.skillLevels ?? {}, question.topic, playerAge(profile));
      void noteDayAnswer(profile.id, todayIso(), question.topic, correct, level);
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
 * Once the kid's save is here too, carry the starts it holds that the
 * profile lacks onto the row (#174) — one write. The save and the profile
 * load side by side, so on a load the save is often still on its way. Stops
 * at the next load or clear.
 */
function carryWhenSaved(userId: string, gen: number): void {
  const now = useSaveStore.getState();
  if (!startsColumn || (now.userId === userId && now.status === 'ready')) return; // nothing to wait for
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
