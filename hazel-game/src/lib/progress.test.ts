import { describe, it, expect, vi, beforeEach } from 'vitest';

// The database, as the page reads it: one canned answer per table — or per read, from what it selects.
type Answer = { data: unknown; error: unknown };
const answers = vi.hoisted(() => ({} as Record<string, Answer | ((select: string) => Answer)>));
const calls = vi.hoisted(() => [] as { table: string; select: string; filters: [string, string, unknown][] }[]);
vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      const call = { table, select: '', filters: [] as [string, string, unknown][] };
      calls.push(call);
      const chain = {
        select: (cols: string) => ((call.select = cols), chain),
        in: (col: string, v: unknown) => (call.filters.push(['in', col, v]), chain),
        gte: (col: string, v: unknown) => (call.filters.push(['gte', col, v]), chain),
        then: (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) => {
          const a = answers[table];
          return Promise.resolve((typeof a === 'function' ? a(call.select) : a) ?? { data: [], error: null }).then(ok, bad);
        },
      };
      return chain;
    },
  },
}));

const {
  ENOUGH_ANSWERS,
  HISTORY_COLUMNS,
  HISTORY_DAYS,
  PROGRESS_COLUMNS,
  SEVERAL_MISSED,
  bestXpDay,
  climbedText,
  countedFromText,
  dayRange,
  dayWords,
  fetchFamilyProgress,
  glance,
  hasPlayed,
  levelBand,
  levelSummary,
  minutesText,
  minutesWords,
  missedQuestions,
  missingColumn,
  nameList,
  playDayFromRow,
  practiseText,
  recentDays,
  sharedStart,
  statsFromRow,
  storyAct,
  storySummary,
  streakSummary,
  topicLevels,
  topicMeaning,
  topicStartsOf,
  topicWeekParts,
  topicWeeks,
  topicWeekText,
  typingSummary,
  xpBrief,
  xpWeeks,
  forgetMissingProgress,
  missingTable,
  answersNote,
  windowEnd,
  LACKING_RECHECK_MS,
} = await import('./progress');
const { ageToStartLevel } = await import('./age');
const { ALL_TOPIC_INFO } = await import('../content/topics');
const { ROUNDS_TO_UNLOCK } = await import('./utils');
const { nextObjective } = await import('./wayfinding');
const { BOAT_MENDED } = await import('../content/boat');
const { visitedFlag } = await import('../content/fieldSpells');
const { keyFlag, keyForBoss } = await import('../content/keys');
const { defaultSave } = await import('./save');
const { EIGHT_MISSED, midActTwoRow, midActTwoSave, newKidRow, trainingSave } = await import('../test/progressFixtures');

const TODAY = '2026-10-21'; // a Wednesday

beforeEach(() => {
  for (const k of Object.keys(answers)) delete answers[k];
  calls.length = 0;
  vi.restoreAllMocks();
  forgetMissingProgress();
});

describe('reading a family (#29)', () => {
  it('reads every kid in four queries — only progress columns, never a birth date or a PIN — and five weeks of their play (#169–#174)', async () => {
    answers.profiles = { data: [{ ...midActTwoRow('k1', TODAY), skill_starts: { math: { level: 2, age: 7 } } }, newKidRow('k2')], error: null };
    answers.saves = { data: [{ profile_id: 'k1', data: midActTwoSave() }], error: null };
    answers.play_days = {
      data: [
        { profile_id: 'k1', day: '2026-10-20', xp: 120, minutes: 25, topics: { math: { a: 10, r: 7, l: 6 } } },
        { profile_id: 'k1', day: '2026-10-01', xp: 40, minutes: 5, topics: {} },
        { profile_id: 'k1', day: '2026-10-18', xp: 0, minutes: 0, topics: {} },
      ],
      error: null,
    };
    answers.play_history_since = { data: [{ profile_id: 'k1', since: '2026-09-30' }, { profile_id: 'k2', since: 'soon' }], error: null };
    const got = await fetchFamilyProgress(['k1', 'k2', 'k3'], TODAY);
    expect(calls.map((c) => c.table)).toEqual(['profiles', 'saves', 'play_days', 'play_history_since']);
    expect(calls[0].select).toBe(`${PROGRESS_COLUMNS}, skill_starts`);
    expect(PROGRESS_COLUMNS).not.toMatch(/birth|pin|name/);
    expect(calls[0].filters).toEqual([['in', 'id', ['k1', 'k2', 'k3']]]);
    // Five weeks (what migration 0026 keeps), with the day's play.
    expect(calls[2].select).toBe(HISTORY_COLUMNS);
    expect(calls[2].filters).toContainEqual(['gte', 'day', '2026-09-17']);
    expect(HISTORY_DAYS).toBe(35);
    expect(got.k1.stats?.xp).toBe(2340);
    expect(got.k1.stats?.skillStarts).toEqual({ math: { level: 2, age: 7 } });
    expect(got.k1.save?.worldUnlocked).toBe(true);
    // The week's days from it, as before; the history oldest first.
    expect(got.k1.playDays).toEqual(['2026-10-20', '2026-10-18']);
    expect(got.k1.history?.map((d) => d.day)).toEqual(['2026-10-01', '2026-10-18', '2026-10-20']);
    expect(got.k1.history?.at(-1)).toEqual({ day: '2026-10-20', xp: 120, minutes: 25, topics: { math: { a: 10, r: 7, l: 6 } } });
    expect(got.k1.countedSince).toBe('2026-09-30');
    // Not a date: no "counted from".
    expect(got.k2).toEqual({ stats: expect.objectContaining({ xp: 0 }), save: null, playDays: [], history: [], countedSince: null });
    // A kid the database didn't return (none of this family's) is just empty.
    expect(got.k3).toEqual({ stats: null, save: null, playDays: [], history: [], countedSince: null });
  });

  it('a database without migration 0026: the profiles without starts, the last week\'s days alone — as before it (#169–#174)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    answers.profiles = (select) =>
      select.includes('skill_starts')
        ? { data: null, error: { message: 'column profiles.skill_starts does not exist', code: '42703' } }
        : { data: [midActTwoRow('k1', TODAY)], error: null };
    answers.play_days = (select) =>
      select.includes('xp')
        ? { data: null, error: { message: 'column play_days.xp does not exist', code: '42703' } }
        : { data: [{ profile_id: 'k1', day: '2026-10-20' }], error: null };
    answers.play_history_since = { data: null, error: { message: "Could not find the table 'public.play_history_since' in the schema cache", code: 'PGRST205' } };
    const got = await fetchFamilyProgress(['k1'], TODAY);
    expect(calls.map((c) => `${c.table} ${c.select}`)).toEqual([
      `profiles ${PROGRESS_COLUMNS}, skill_starts`,
      'saves profile_id, data',
      `play_days ${HISTORY_COLUMNS}`,
      'play_history_since profile_id, since',
      `profiles ${PROGRESS_COLUMNS}`,
      'play_days profile_id, day',
    ]);
    // The week only, as before 0026.
    expect(calls[5].filters).toContainEqual(['gte', 'day', '2026-10-15']);
    expect(got.k1).toMatchObject({ playDays: ['2026-10-20'], history: null, countedSince: null });
    expect(got.k1.stats?.xp).toBe(2340);
    expect(got.k1.stats).not.toHaveProperty('skillStarts');
    expect(warn.mock.calls.map((c) => c.join(' ')).join(' | ')).toContain('PGRST205');
    // Remembered for the session (review round 1): the next open reads what's there, in one round — no failed reads first.
    calls.length = 0;
    warn.mockClear();
    const again = await fetchFamilyProgress(['k1'], TODAY);
    expect(calls.map((c) => `${c.table} ${c.select}`)).toEqual([`profiles ${PROGRESS_COLUMNS}`, 'saves profile_id, data', 'play_days profile_id, day']);
    expect(again.k1).toMatchObject({ playDays: ['2026-10-20'], history: null, countedSince: null });
    expect(warn).not.toHaveBeenCalled();
    // …for a while only (review round 2: a tab open across the deploy kept the old shape until a reload). After it,
    // or on the page's own "Try again" (`forgetMissingProgress`), all of it is asked for again.
    for (const askAgain of [() => vi.setSystemTime(Date.now() + LACKING_RECHECK_MS + 1), forgetMissingProgress]) {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        calls.length = 0;
        askAgain();
        await fetchFamilyProgress(['k1'], TODAY);
        expect(calls.slice(0, 4).map((c) => `${c.table} ${c.select}`)).toEqual([
          `profiles ${PROGRESS_COLUMNS}, skill_starts`,
          'saves profile_id, data',
          `play_days ${HISTORY_COLUMNS}`,
          'play_history_since profile_id, since',
        ]);
      } finally {
        vi.useRealTimers();
      }
    }
    // The retry's own failure is the page's to say.
    answers.profiles = (select) =>
      select.includes('skill_starts')
        ? { data: null, error: { message: 'column profiles.skill_starts does not exist', code: '42703' } }
        : { data: null, error: { message: 'JWT expired', code: 'PGRST301' } };
    await expect(fetchFamilyProgress(['k1'], TODAY)).rejects.toMatchObject({ code: 'PGRST301' });
  });

  it('the first day noted: a read that fails for another reason is tried again next time; only a missing table is remembered (review round 1)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    answers.play_history_since = { data: null, error: { message: 'Failed to fetch' } };
    await fetchFamilyProgress(['k1'], TODAY);
    calls.length = 0;
    answers.play_history_since = { data: [{ profile_id: 'k1', since: '2026-10-01' }], error: null };
    expect((await fetchFamilyProgress(['k1'], TODAY)).k1.countedSince).toBe('2026-10-01');
    expect(calls.map((c) => c.table)).toContain('play_history_since');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(missingTable({ code: 'PGRST205', message: "Could not find the table 'public.play_history_since' in the schema cache" })).toBe(true);
    expect(missingTable({ code: '42P01', message: 'relation "public.play_history_since" does not exist' })).toBe(true);
    for (const e of [{ code: '42703', message: 'column x does not exist' }, { message: 'Failed to fetch' }, null]) expect(missingTable(e)).toBe(false);
  });

  it('a missing column is told from any other refusal', () => {
    expect(missingColumn({ code: '42703', message: 'column play_days.xp does not exist' })).toBe(true);
    expect(missingColumn({ code: 'PGRST204', message: "Could not find the 'skill_starts' column of 'profiles' in the schema cache" })).toBe(true);
    expect(missingColumn({ message: 'column profiles.skill_starts does not exist' })).toBe(true);
    for (const e of [{ code: '42P01', message: 'relation "public.play_days" does not exist' }, { code: '500', message: 'boom' }, null, 'x']) {
      expect(missingColumn(e)).toBe(false);
    }
  });

  it('a failed profiles or saves read throws an Error that keeps its code; nothing is asked for no kids', async () => {
    answers.profiles = { data: null, error: { message: 'JWT expired', code: 'PGRST301' } };
    await expect(fetchFamilyProgress(['k1'], TODAY)).rejects.toMatchObject({ message: 'JWT expired', code: 'PGRST301' });
    answers.profiles = { data: [], error: null };
    answers.saves = { data: null, error: { message: 'Failed to fetch' } };
    await expect(fetchFamilyProgress(['k1'], TODAY)).rejects.toBeInstanceOf(Error);
    calls.length = 0;
    expect(await fetchFamilyProgress([], TODAY)).toEqual({});
    expect(calls).toEqual([]);
  });

  it('a failed play-days read (no migration 0025, or any other refusal) leaves the week and the history out and logs the real error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    answers.profiles = { data: [midActTwoRow('k1', TODAY)], error: null };
    answers.play_days = { data: null, error: { message: 'relation "public.play_days" does not exist', code: '42P01' } };
    const got = await fetchFamilyProgress(['k1'], TODAY);
    expect(got.k1.playDays).toBeNull();
    expect(got.k1.history).toBeNull();
    expect(got.k1.stats).not.toBeNull();
    expect(warn.mock.calls[0].join(' ')).toContain('42P01');
    // Not a missing column: no second read.
    expect(calls.filter((c) => c.table === 'play_days')).toHaveLength(1);
    answers.play_days = { data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } };
    expect(await fetchFamilyProgress(['k1'], TODAY)).toMatchObject({ k1: { playDays: null, history: null } });
  });

  it('junk in a row never reaches the page', () => {
    const s = statsFromRow({
      id: 'k',
      skill_levels: { math: 6, science: 'lots', space: null, music: Number.NaN },
      xp: -5,
      level: null,
      level_xp: 30,
      current_streak: null,
      longest_streak: 2,
      last_played_on: null,
    });
    expect(s).toEqual({ skillLevels: { math: 6 }, xp: 0, currentStreak: 0, longestStreak: 2, lastPlayedOn: null });
    expect(statsFromRow({ ...newKidRow('k'), skill_levels: [3, 4] }).skillLevels).toEqual({});
  });

  it('junk in skill_starts never reaches the page: known topics, whole levels 1–10 and ages 3–18 only (#174)', () => {
    const starts = statsFromRow({
      ...newKidRow('k'),
      skill_starts: {
        math: { level: 3, age: 8 },
        science: { level: 0, age: 8 },
        words: { level: 4, age: 2 },
        history: { level: 2.5, age: 7 },
        nature: { level: '3', age: 7 },
        cooking: { level: 3, age: 8 },
        space: null,
        music: { level: 10, age: 18 },
      },
    }).skillStarts;
    expect(starts).toEqual({ math: { level: 3, age: 8 }, music: { level: 10, age: 18 } });
    expect(statsFromRow({ ...newKidRow('k'), skill_starts: [1] }).skillStarts).toEqual({});
  });

  it("junk in a day's play never reaches the page: a real day, numbers in range, r ≤ a, known topics (#169, #172, #173)", () => {
    expect(
      playDayFromRow({
        profile_id: 'k',
        day: '2026-10-20',
        xp: 100_001,
        minutes: -3,
        extra: 'x',
        topics: {
          math: { a: 10, r: 7, l: 6, x: 1 },
          science: { a: 3, r: 4 },
          words: { a: 2.5, r: 1 },
          history: { a: 4, r: 4, l: 11 },
          nature: { a: 10_001, r: 1 },
          cooking: { a: 1, r: 1 },
          space: 'lots',
          music: { a: 0, r: 0, l: 3 },
        },
      }),
    ).toEqual({ day: '2026-10-20', xp: 0, minutes: 0, topics: { math: { a: 10, r: 7, l: 6 }, history: { a: 4, r: 4 }, music: { a: 0, r: 0, l: 3 } } });
    expect(playDayFromRow({ day: '2026-10-20', xp: 40, minutes: 1440, topics: [1, 2] })).toEqual({ day: '2026-10-20', xp: 40, minutes: 1440, topics: {} });
    for (const row of [null, { day: 'today' }, { day: 20261020 }, { xp: 4 }]) expect(playDayFromRow(row)).toBeNull();
  });

  it('a topic starts where the profile says first, then where the save noted it (#174)', () => {
    const save = { ...defaultSave(), topicStarts: { math: { level: 4, age: 9 }, words: { level: 2, age: 7 } } };
    const stats = { ...statsFromRow(newKidRow('k')), skillStarts: { math: { level: 3, age: 8 } } };
    expect(topicStartsOf({ stats, save })).toEqual({ math: { level: 3, age: 8 }, words: { level: 2, age: 7 } });
    expect(topicStartsOf({ stats: statsFromRow(newKidRow('k')), save })).toEqual(save.topicStarts);
    expect(topicStartsOf({ stats, save: null })).toEqual({ math: { level: 3, age: 8 } });
    expect(topicStartsOf({ stats: null, save: null })).toEqual({});
  });
});

describe('has this kid played?', () => {
  it('a brand-new kid has not; any XP, day, level or saved progress means they have', () => {
    const fresh = statsFromRow(newKidRow('k'));
    expect(hasPlayed({ stats: null, save: null })).toBe(false);
    expect(hasPlayed({ stats: fresh, save: null })).toBe(false);
    expect(hasPlayed({ stats: fresh, save: defaultSave() })).toBe(false);
    expect(hasPlayed({ stats: { ...fresh, lastPlayedOn: TODAY }, save: null })).toBe(true);
    expect(hasPlayed({ stats: { ...fresh, skillLevels: { math: 2 } }, save: null })).toBe(true);
    expect(hasPlayed({ stats: fresh, save: trainingSave() })).toBe(true);
  });
});

describe('level and XP', () => {
  it('how far to the next level, from the saved level', () => {
    // Level 12 takes 100 + 25 × 11 = 375 XP; 80 in.
    expect(levelSummary({ xp: 2340, level: 12, levelXp: 80 })).toEqual({
      level: 12,
      into: 80,
      needed: 375,
      toNext: 295,
      percent: 21,
      totalXp: 2340,
    });
  });

  it('a profile from before levels were saved, and none at all', () => {
    expect(levelSummary({ xp: 250 })).toMatchObject({ level: 3, into: 50, needed: 150 });
    expect(levelSummary(null)).toMatchObject({ level: 1, into: 0, totalXp: 0 });
  });
});

describe('streak, last played and the last week', () => {
  const stats = { currentStreak: 3, longestStreak: 7, lastPlayedOn: '2026-10-20' };

  it('a streak counts while they played today or yesterday', () => {
    expect(streakSummary(stats, TODAY)).toEqual({ current: 3, best: 7, lastPlayed: 'Yesterday', lastPlayedAgo: null, clockAhead: false });
    expect(streakSummary({ ...stats, lastPlayedOn: TODAY }, TODAY)).toMatchObject({ current: 3, lastPlayed: 'Today' });
  });

  it('a missed day breaks it — never the stale saved number — and the best is kept', () => {
    expect(streakSummary({ ...stats, lastPlayedOn: '2026-10-19' }, TODAY)).toEqual({ current: 0, best: 7, lastPlayed: 'Monday', lastPlayedAgo: null, clockAhead: false });
    expect(streakSummary(null, TODAY)).toEqual({ current: 0, best: 0, lastPlayed: null, lastPlayedAgo: null, clockAhead: false });
  });

  it('a week or more since they played says how long, not just a date (review round 1)', () => {
    expect(streakSummary({ ...stats, lastPlayedOn: '2026-10-14' }, TODAY)).toMatchObject({ lastPlayed: '14 October', lastPlayedAgo: '7 days ago' });
    expect(streakSummary({ ...stats, lastPlayedOn: '2026-10-15' }, TODAY)).toMatchObject({ lastPlayed: 'Thursday', lastPlayedAgo: null });
  });

  it("the kid's device a time zone ahead: their today reads Today, the streak holds, the week marks today (review round 1)", () => {
    const ahead = { ...stats, lastPlayedOn: '2026-10-22' };
    expect(streakSummary(ahead, TODAY)).toEqual({ current: 3, best: 7, lastPlayed: 'Today', lastPlayedAgo: null, clockAhead: false });
    expect(dayWords('2026-10-22', TODAY)).toBe('Today');
    const week = recentDays(TODAY, ['2026-10-22'], '2026-10-22');
    expect(week.at(-1)).toMatchObject({ today: true, played: true });
    expect(week.filter((d) => d.played)).toHaveLength(1);
  });

  it('a date more than a day ahead is a clock set wrong: not "Today", no live streak, no day in the week (review round 2)', () => {
    // The server caps play days at a day ahead (0025); only the profile's own last day can do this.
    for (const last of ['2026-10-23', '2099-12-31']) {
      expect(streakSummary({ currentStreak: 999, longestStreak: 7, lastPlayedOn: last }, TODAY)).toEqual({
        current: 0,
        best: 7,
        lastPlayed: null,
        lastPlayedAgo: null,
        clockAhead: true,
      });
      const week = recentDays(TODAY, [last], last, 999);
      expect(week.some((d) => d.played)).toBe(false);
    }
    expect(dayWords('2026-10-23', TODAY)).toBe('23 October');
    expect(dayWords('2099-12-31', TODAY)).toBe('31 December 2099');
  });

  it('days in plain words', () => {
    expect(dayWords('2026-10-21', TODAY)).toBe('Today');
    expect(dayWords('2026-10-20', TODAY)).toBe('Yesterday');
    expect(dayWords('2026-10-16', TODAY)).toBe('Friday');
    expect(dayWords('2026-10-14', TODAY)).toBe('14 October');
    expect(dayWords('2025-12-30', TODAY)).toBe('30 December 2025');
  });

  it('seven days, oldest first: played only where the database noted it or the last day played', () => {
    const week = recentDays(TODAY, ['2026-10-18', '2026-10-15', '2026-10-01'], '2026-10-20');
    expect(week.map((d) => d.iso)).toEqual(['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']);
    expect(week.map((d) => d.played)).toEqual([true, false, false, true, false, true, false]);
    expect(week.map((d) => d.short)).toEqual(['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed']);
    expect(week[6]).toMatchObject({ today: true, long: 'Wednesday 21 October' });
    expect(week.filter((d) => d.today)).toHaveLength(1);
    // Nothing noted and nothing played: no day is invented.
    expect(recentDays(TODAY, [], null).some((d) => d.played)).toBe(false);
  });

  it('a live streak shows the days it proves, played like any other — never a stale one (review rounds 2–3)', () => {
    // Only today noted (the first week after 0025, or a day whose note didn't send), a 6-day streak.
    const week = recentDays(TODAY, [TODAY], TODAY, 6);
    expect(week.map((d) => d.played)).toEqual([false, true, true, true, true, true, true]);
    // One kind of played day (round 3): nothing on a day says how it's known.
    expect(Object.keys(week[1]).sort()).toEqual(['counted', 'iso', 'long', 'minutes', 'played', 'short', 'today', 'xp']);
    expect(week[1]).toMatchObject({ played: true, xp: null, minutes: null });
    // Ending yesterday, it still holds: those days, not today.
    expect(recentDays(TODAY, [], '2026-10-20', 3).map((d) => d.played)).toEqual([false, false, false, true, true, true, false]);
    // A streak that ended two days ago says nothing: the saved number waits for their next game to reset.
    expect(recentDays(TODAY, ['2026-10-19'], '2026-10-19', 5).filter((d) => d.played).map((d) => d.iso)).toEqual(['2026-10-19']);
    expect(recentDays(TODAY, ['2026-10-18', TODAY], TODAY, 4).find((d) => d.iso === '2026-10-18')).toMatchObject({ played: true });
  });
});

describe('each day\'s play: XP, minutes, counted from (#169, #170, #172)', () => {
  const rec = (day: string, xp: number, minutes: number, topics = {}) => ({ day, xp, minutes, topics });

  it('XP and minutes only from a day whose play was noted — a day noted by an older app, or only proven by the streak, says it was played, never 0', () => {
    const history = [rec('2026-10-15', 120, 25), rec('2026-10-17', 0, 0), rec('2026-10-19', 0, 3, { math: { a: 2, r: 1 } }), rec('2026-10-20', 0, 0, { music: { a: 0, r: 0, l: 3 } })];
    const week = recentDays(TODAY, ['2026-10-15', '2026-10-17', '2026-10-19', '2026-10-20'], TODAY, 2, { history });
    expect(week.map((d) => [d.played, d.xp, d.minutes])).toEqual([
      [true, 120, 25],
      [false, null, null],
      // Noted with nothing at all: an app from before 0026 (or the column defaults) — played, how much unknown.
      [true, null, null],
      [false, null, null],
      // Minutes and an answer but no XP: a real 0.
      [true, 0, 3],
      // Only a level noted: still a day the new app noted.
      [true, 0, 0],
      // The streak proves today; nothing noted for it.
      [true, null, null],
    ]);
    expect(week.every((d) => d.counted)).toBe(true);
    // No history (a database without 0026): nothing about XP or minutes.
    expect(recentDays(TODAY, ['2026-10-15'], null).every((d) => d.xp === null && d.minutes === null)).toBe(true);
  });

  it("a day ahead (the kid's device a time zone ahead): the last 7 days are the kid's 7, ending on it — never 8 of theirs (review round 2)", () => {
    const history = [rec('2026-10-15', 70, 9), rec(TODAY, 30, 10), rec('2026-10-22', 20, 5)];
    const week = recentDays(TODAY, [], null, 0, { history });
    expect(week.map((d) => d.iso)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
    // Their today is the 22nd; the grown-up's today (the 21st) is its own day; the 15th is 8 of their days back.
    expect(week.at(-1)).toMatchObject({ iso: '2026-10-22', today: true, played: true, xp: 20, minutes: 5, short: 'Thu' });
    expect(week.at(-2)).toMatchObject({ iso: TODAY, today: false, xp: 30, minutes: 10 });
    expect(week.reduce((n, d) => n + (d.xp ?? 0), 0)).toBe(50);
    expect(minutesText(week)).toBe('About 15 minutes of play in the last 7 days.');
    // The days noted, or their last day played, say so too; two days ahead is a clock set wrong and moves nothing.
    expect(windowEnd(TODAY, { playDays: ['2026-10-22'] })).toBe('2026-10-22');
    expect(windowEnd(TODAY, { lastPlayedOn: '2026-10-22' })).toBe('2026-10-22');
    expect(windowEnd(TODAY, { history: [rec('2026-10-23', 5, 1)], lastPlayedOn: TODAY })).toBe(TODAY);
    expect(windowEnd(TODAY)).toBe(TODAY);
    expect(recentDays(TODAY, ['2026-10-22'], '2026-10-22', 2).map((d) => [d.iso.slice(8), d.played, d.today]).slice(-3)).toEqual([
      ['20', false, false],
      ['21', true, false],
      ['22', true, true],
    ]);
  });

  it('before the first day ever noted, a day reads "not recorded" — said once, under the chart (#170)', () => {
    const week = recentDays(TODAY, ['2026-10-20'], '2026-10-20', 0, { countedSince: '2026-10-19', history: [] });
    expect(week.map((d) => d.counted)).toEqual([false, false, false, false, true, true, true]);
    expect(countedFromText(week)).toBe('Days played are recorded from Monday 19 October.');
    // The streak still proves its days, counted or not.
    const streak = recentDays(TODAY, [TODAY], TODAY, 4, { countedSince: TODAY });
    expect(streak.map((d) => [d.played, d.counted])).toEqual([[false, false], [false, false], [false, false], [true, false], [true, false], [true, false], [true, true]]);
    // From the first shown day, before it, or not known: no note.
    expect(countedFromText(recentDays(TODAY, [], null, 0, { countedSince: '2026-10-15' }))).toBeNull();
    expect(countedFromText(recentDays(TODAY, [], null, 0, { countedSince: '2026-09-01' }))).toBeNull();
    expect(countedFromText(recentDays(TODAY, [], null, 0, { countedSince: null }))).toBeNull();
    // A first day ahead (their device a time zone ahead) is their today, the last day shown.
    expect(countedFromText(recentDays(TODAY, [], null, 0, { countedSince: '2026-10-22', history: [rec('2026-10-22', 5, 1)] }))).toBe(
      'Days played are recorded from Thursday 22 October.',
    );
  });

  it('minutes as a grown-up says them: under a minute, a few, to the nearest 5, hours', () => {
    expect([0, 1, 4, 5, 7, 38, 57, 58, 60, 80, 122, 125].map((m) => minutesWords(m))).toEqual([
      'under a minute',
      'a few minutes',
      'a few minutes',
      'about 5 minutes',
      'about 5 minutes',
      'about 40 minutes',
      'about 55 minutes',
      'about 1 hour',
      'about 1 hour',
      'about 1 hour 20 minutes',
      'about 2 hours',
      'about 2 hours 5 minutes',
    ]);
    // A day's, to the minute (review round 2: three "about 5 min" days added up to "about 20 minutes").
    expect([0, 3, 7, 38, 61, 122].map((m) => minutesWords(m, 1))).toEqual([
      'under a minute',
      'a few minutes',
      'about 7 minutes',
      'about 38 minutes',
      'about 1 hour 1 minute',
      'about 2 hours 2 minutes',
    ]);
  });

  it("the ⏱️ line: the week's minutes from the days whose time was recorded — and when it wasn't, how many were first (#172)", () => {
    const day = (played: boolean, minutes: number | null) => ({ played, minutes }) as Parameters<typeof minutesText>[0][number];
    expect(minutesText([day(true, 25), day(true, 13), day(false, null)])).toBe('About 40 minutes of play in the last 7 days.');
    expect(minutesText([day(true, 3)])).toBe('A few minutes of play in the last 7 days.');
    // Some days played had no time recorded: never a part said first, as if it were the week's (review rounds 1–2).
    expect(minutesText([day(true, 50), day(true, 30), day(true, null)])).toBe('Time recorded on 2 of the 3 days played: about 1 hour 20 minutes.');
    expect(minutesText([day(true, 3), day(true, null), day(true, null), day(true, null), day(true, null)])).toBe(
      'Time recorded on 1 of the 5 days played: a few minutes.',
    );
    expect(minutesText([day(true, null)])).toBe("Time played wasn't recorded on that day.");
    expect(minutesText([day(true, null), day(true, null)])).toBe("Time played wasn't recorded on those 2 days.");
    expect(minutesText([day(false, null)])).toBeNull();
  });

  it('XP over 4 weeks: a row per week, oldest first, its dates and its XP in words — never a 0 that was not noted (#169)', () => {
    const history = [rec('2026-09-25', 40, 5), rec('2026-10-05', 0, 0), rec('2026-10-14', 300, 30), rec('2026-10-15', 0, 2, { math: { a: 1, r: 0 } }), rec('2026-10-20', 180, 20), rec('2026-10-21', 60, 10)];
    const days = recentDays(TODAY, [], TODAY, 1, { history, countedSince: '2026-09-25', days: 28 });
    expect(days).toHaveLength(28);
    expect(days[0].iso).toBe('2026-09-24');
    const weeks = xpWeeks(days);
    expect(weeks.map((w) => [w.label, w.total])).toEqual([
      // Thursday 24 September came before recording began; the 25th earned 40 — since Friday, not the whole week (review rounds 1–2).
      ['24–30 September', '40 XP since Friday'],
      // Played on the 5th, by an app that didn't record its XP.
      ['1–7 October', 'Played on 1 day · XP not recorded'],
      ['8–14 October', '300 XP'],
      // A real 0 on the 15th, with 240 later.
      ['15–21 October', '240 XP'],
    ]);
    expect(weeks.map((w) => [w.xp, w.amount, w.note, w.partial])).toEqual([
      [40, '40 XP since Friday', '', false],
      [null, null, 'Played on 1 day · XP not recorded', false],
      [300, '300 XP', '', false],
      [240, '240 XP', '', false],
    ]);
    expect(weeks.every((w) => w.days.length === 7)).toBe(true);
    expect(countedFromText(days)).toBe('Days played are recorded from Friday 25 September.');
    expect(bestXpDay(days)).toMatchObject({ iso: '2026-10-14', xp: 300 });
    // A week without play, and one wholly before recording began.
    const quiet = xpWeeks(recentDays(TODAY, [], null, 0, { history: [], countedSince: '2026-10-08', days: 28 }));
    expect(quiet.map((w) => w.total)).toEqual(['Not recorded', 'Not recorded', 'No play recorded', 'No play recorded']);
    expect(bestXpDay(recentDays(TODAY, [], null, 0, { history: [], days: 28 }))).toBeNull();
    // Big numbers one way.
    expect(xpWeeks(recentDays(TODAY, [], null, 0, { history: [rec(TODAY, 12_500, 60)], days: 28 })).at(-1)?.total).toBe('12,500 XP');
  });

  it('a week with played days whose XP wasn’t recorded is "At least …" — a floor, never its part as the whole (review rounds 1–2)', () => {
    // Played Thursday to today (a 7-day streak); only the 18th and the 21st recorded their play — the rest by 0025, or a note that didn't send.
    const history = [rec('2026-10-15', 0, 0), rec('2026-10-16', 0, 0), rec('2026-10-18', 15, 3), rec('2026-10-21', 10, 4)];
    const week = xpWeeks(recentDays(TODAY, [], TODAY, 7, { history, countedSince: '2026-10-01', days: 7 }));
    expect(week[0].total).toBe('At least 25 XP · XP not recorded on 5 days played');
    expect(week[0]).toMatchObject({ xp: 25, partial: true, amount: 'At least 25 XP', note: 'XP not recorded on 5 days played' });
    const one = xpWeeks(recentDays(TODAY, [], TODAY, 2, { history: [rec('2026-10-20', 0, 0), rec(TODAY, 40, 5)], countedSince: '2026-10-01', days: 7 }));
    expect(one[0].total).toBe('At least 40 XP · XP not recorded on 1 day played');
    // Recording began mid-week, with no play since — and with play since, some of it unrecorded.
    expect(xpWeeks(recentDays(TODAY, [], null, 0, { history: [], countedSince: '2026-10-19', days: 7 }))[0].total).toBe('No play recorded since Monday');
    const mid = xpWeeks(recentDays(TODAY, [], TODAY, 3, { history: [rec(TODAY, 30, 5)], countedSince: '2026-10-19', days: 7 }));
    expect(mid[0].total).toBe('At least 30 XP since Monday · XP not recorded on 2 days played');
    expect(xpWeeks(recentDays(TODAY, [], TODAY, 2, { history: [rec('2026-10-20', 0, 0)], countedSince: '2026-10-19', days: 7 }))[0].total).toBe(
      'Played on 2 days since Monday · XP not recorded',
    );
  });

  it('fewer than two days of XP recorded: the section in a line, what was and wasn’t (review round 1)', () => {
    const days = (history: ReturnType<typeof rec>[], last: string | null, streak = 0) => recentDays(TODAY, [], last, streak, { history, days: 14 });
    // A new kid's first day — no minutes: ⏱️ says them (review round 2).
    expect(xpBrief(days([rec(TODAY, 35, 6)], TODAY, 1), 'in the last 2 weeks')).toBe('35 XP on Wednesday 21 October (today).');
    // The first weeks after 0026: one day recorded, the others played by 0025.
    expect(xpBrief(days([rec('2026-10-12', 0, 0), rec('2026-10-14', 0, 0), rec('2026-10-19', 20, 0)], '2026-10-19'), 'in the last 2 weeks')).toBe(
      '20 XP on Monday 19 October · XP not recorded on 2 other days played.',
    );
    expect(xpBrief(days([rec('2026-10-20', 0, 0)], '2026-10-20'), 'in the last 2 weeks')).toBe('Played on 1 day in the last 2 weeks, XP not recorded.');
    // Idle: nothing at all.
    expect(xpBrief(days([], null), 'in the last 4 weeks')).toBe('No play recorded in the last 4 weeks.');
    expect(xpBrief(days([], null), 'in the last 7 days')).toBe('No play recorded in the last 7 days.');
    // Two days with XP: the chart says more.
    expect(xpBrief(days([rec('2026-10-19', 20, 2), rec(TODAY, 5, 1)], TODAY), 'in the last 2 weeks')).toBeNull();
  });

  it('week dates in plain words, across a month too', () => {
    expect(dayRange('2026-10-15', '2026-10-21')).toBe('15–21 October');
    expect(dayRange('2026-09-29', '2026-10-05')).toBe('29 September – 5 October');
    expect(dayRange('2025-12-29', '2026-01-04')).toBe('29 December – 4 January');
  });
});

describe('accuracy and change per topic (#173)', () => {
  const rec = (day: string, topics: Record<string, { a: number; r: number; l?: number }>) => ({ day, xp: 10, minutes: 5, topics });

  it("the last 7 days' answers, and the level at the end of the latest day noted 8–14 days back", () => {
    const history = [
      rec('2026-10-07', { math: { a: 4, r: 4, l: 9 } }), // 14 days back: too old
      rec('2026-10-08', { math: { a: 4, r: 2, l: 4 }, science: { a: 2, r: 2, l: 6 } }), // 13 back
      rec('2026-10-14', { math: { a: 3, r: 3, l: 5 }, words: { a: 2, r: 1 } }), // 7 back: the week before
      rec('2026-10-15', { math: { a: 6, r: 5, l: 6 } }), // 6 back: this week
      rec('2026-10-21', { math: { a: 4, r: 2 }, space: { a: 0, r: 0, l: 3 } }),
      rec('2026-10-23', { math: { a: 9, r: 0 } }), // two days ahead: a clock set wrong
    ];
    expect(topicWeeks(history, TODAY)).toEqual({
      math: { asked: 10, right: 7, levelLastWeek: 5 },
      science: { asked: 0, right: 0, levelLastWeek: 6 },
      words: { asked: 0, right: 0, levelLastWeek: null },
      space: { asked: 0, right: 0, levelLastWeek: null },
    });
    expect(topicWeeks(null, TODAY)).toEqual({});
  });

  it("a day ahead (the kid's device a time zone ahead): the kid's 7 days end on it, so the 7th day back is the week before — never 8 days added up (review round 2)", () => {
    const history = [
      rec('2026-10-15', { math: { a: 6, r: 5, l: 6 } }), // 7 of their days back from the 22nd
      rec('2026-10-21', { math: { a: 4, r: 2 } }),
      rec('2026-10-22', { math: { a: 1, r: 1 } }), // their today
    ];
    expect(topicWeeks(history, TODAY)).toEqual({ math: { asked: 5, right: 3, levelLastWeek: 6 } });
    // The page passes the end it worked out from everything it read (their last day played, say).
    expect(topicWeeks(history.slice(0, 2), TODAY, '2026-10-22')).toEqual({ math: { asked: 4, right: 2, levelLastWeek: 6 } });
  });

  it('each topic row: "Last 7 days: 7 of 10 right · Up 1 since last week" — only what the days hold', () => {
    const weeks = { math: { asked: 10, right: 7, levelLastWeek: 5 }, science: { asked: 0, right: 0, levelLastWeek: 8 }, words: { asked: 3, right: 3, levelLastWeek: 6 }, music: { asked: 2, right: 1, levelLastWeek: 3 } };
    const levels = topicLevels({ math: 6, science: 7, words: 6 }, 9, {}, weeks);
    const by = Object.fromEntries(levels.map((t) => [t.id, t]));
    expect(by.math).toMatchObject({ answers: { asked: 10, right: 7 }, sinceLastWeek: 1 });
    expect(topicWeekText(by.math)).toBe('Last 7 days: 7 of 10 right · Up 1 since last week');
    expect(topicWeekParts(by.math)).toEqual(['Last 7 days: 7 of 10 right', 'Up 1 since last week']);
    // Nothing answered this week: no change line — "Same as last week" read like steady practice (review round 2).
    expect(by.science).toMatchObject({ answers: null, sinceLastWeek: null });
    expect(topicWeekText(by.science)).toBeNull();
    expect(topicWeekText(by.words)).toBe('Last 7 days: 3 of 3 right · Same as last week');
    // Not moved yet (no level saved): its answers, never a change.
    expect(by.music).toMatchObject({ measured: false, answers: { asked: 2, right: 1 }, sinceLastWeek: null });
    // Nothing noted: nothing said.
    expect(by.history).toMatchObject({ answers: null, sinceLastWeek: null });
    expect(topicWeekText(by.history)).toBeNull();
    // The level now is clamped like the row shows it.
    expect(topicLevels({ math: 14 }, 9, {}, { math: { asked: 1, right: 1, levelLastWeek: 8 } })[0].sinceLastWeek).toBe(2);
  });

  it('what the answers cover, said once above the topics when some days played had none recorded (review round 2)', () => {
    const day = (played: boolean, xp: number | null) => ({ played, xp }) as Parameters<typeof answersNote>[0][number];
    const week = [day(true, 10), day(true, 0), day(true, null), day(false, null), day(true, 5), day(true, 20)];
    expect(answersNote(week, true)).toBe("Answers below are from 4 of the 5 days played in the last 7 — the other day's answers weren't recorded.");
    expect(answersNote([day(true, 10), day(true, null), day(true, null)], true)).toBe(
      "Answers below are from 1 of the 3 days played in the last 7 — the other 2 days' answers weren't recorded.",
    );
    expect(answersNote([day(true, null), day(true, null)], false)).toBe("Answers weren't recorded on the 2 days played in the last 7.");
    expect(answersNote([day(true, null)], false)).toBe("Answers weren't recorded on the day played in the last 7.");
    // Every day played recorded, no day played, or nothing it would explain: nothing to say.
    expect(answersNote([day(true, 10), day(false, null)], true)).toBeNull();
    expect(answersNote([day(false, null)], true)).toBeNull();
    expect(answersNote(week, false)).toBeNull();
  });

  it('a topic under half right with enough answers joins what to practise, grouped by why, each named once', () => {
    const weeks = { math: { asked: 6, right: 2, levelLastWeek: null }, science: { asked: 4, right: 0, levelLastWeek: null }, words: { asked: 10, right: 5, levelLastWeek: null }, creativity: { asked: 8, right: 3, levelLastWeek: null } };
    const starts = { creativity: { level: 4, age: 9 } };
    const levels = topicLevels({ math: 5, creativity: 3 }, 9, starts, weeks);
    const g = glance(null, levels, []);
    // Science: too few answers; Words: half right is not under half.
    expect(g.lowRight).toEqual([
      { label: 'Math', asked: 6, right: 2 },
      { label: 'Creativity', asked: 8, right: 3 },
    ]);
    expect(ENOUGH_ANSWERS).toBe(5);
    expect(practiseText(g)).toBe(
      'To practise together: Creativity (below their start, under half right) and Math (under half right).',
    );
    const t = (label: string) => ({ label }) as Parameters<typeof practiseText>[0]['belowStart'][number];
    expect(
      practiseText({
        belowStart: [t('Engineering'), t('Creativity')],
        missedByTopic: [{ label: 'Math', count: 4 }, { label: 'Creativity', count: 3 }, { label: 'Space', count: 3 }],
        lowRight: [{ label: 'Space', asked: 5, right: 1 }, { label: 'Creativity', asked: 7, right: 2 }, { label: 'Music', asked: 9, right: 4 }],
      }),
    ).toBe(
      // The topics first, the most reasons first, two with their reasons (review round 1: 65 words, 12 lines at 320 px) and the
      // rest named, so each can be found below (round 2: "and 3 more topics" couldn't be).
      'To practise together: Creativity (below their start, under half right, 3 to try again) and Space (under half right, 3 to try again). Also: Engineering, Music and Math.',
    );
  });
});

describe('question level by topic', () => {
  it('the bands a grown-up reads, at their edges', () => {
    expect([1, 3, 4, 6, 7, 8, 9, 10].map(levelBand)).toEqual(['easy', 'easy', 'right', 'right', 'stretch', 'stretch', 'top', 'top']);
  });

  it('every topic, in the game order — measured levels against their noted start, junk clamped, the rest at the start for their age now', () => {
    const levels = topicLevels(
      { math: 6, science: 8, history: 12, nature: 0.4, space: Number.NaN },
      9,
      { math: { level: 3, age: 8 }, science: { level: 4, age: 9 }, history: { level: 4, age: 9 }, nature: { level: 2, age: 7 }, music: { level: 1, age: 6 } },
    );
    expect(levels.map((t) => t.id)).toEqual(ALL_TOPIC_INFO.map((t) => t.id));
    expect(levels).toHaveLength(10);
    const by = Object.fromEntries(levels.map((t) => [t.id, t]));
    expect(by.math).toMatchObject({ label: 'Math', level: 6, measured: true, start: { level: 3, age: 8 }, meaning: 'Up 3 from level 3, where they started at age 8' });
    expect(by.science).toMatchObject({ level: 8, meaning: 'Up 4 from level 4, where they started at age 9 — a stretch for their age' });
    expect(by.history).toMatchObject({ level: 10, meaning: 'Up 6 from level 4, where they started at age 9 — for the strongest at their age' });
    expect(by.nature).toMatchObject({ level: 1, meaning: 'Below level 2, where they started at age 7 — a good one to practise together' });
    // Not moved yet: at the start for a 9-year-old (4), no start of its own and no words (the page groups them).
    expect(by.music).toMatchObject({ label: 'Music', level: 4, measured: false, start: null, meaning: null });
    expect(by.space).toMatchObject({ level: 4, measured: false, start: null });
  });

  it('a birthday moves nothing: a topic held (or climbed) since they were younger never reads "below" (review round 2)', () => {
    // Born November 2017: Math noted at 8 (start 3) and held there.
    const starts = { math: { level: 3, age: 8 } };
    expect(topicLevels({ math: 3 }, 8, starts)[0].meaning).toBe('At level 3, where they started at age 8');
    expect(topicLevels({ math: 3 }, 9, starts)[0].meaning).toBe('At level 3, where they started at age 8');
    // Ada, 9, started every topic at 6 (level 1) and climbed to 2–3: up, never below.
    const ada = topicLevels({ math: 3, words: 2 }, 9, { math: { level: 1, age: 6 }, words: { level: 1, age: 6 } });
    // Both started at the same place: said once above them (round 3), the rows shorter.
    expect(sharedStart(ada)).toEqual({ level: 1, age: 6 });
    expect(ada.filter((t) => t.measured).map((t) => t.meaning)).toEqual(['Up 2 since they started', 'Up 1 since they started']);
    expect(glance(null, ada, []).belowStart).toEqual([]);
  });

  it('no noted start (saved before the game noted them, or a teen from before #156): no above / below claim, only the top bands', () => {
    // A 15-year-old seeded at 10 under the old rule, never moved: "level 10 of 10", what its questions are — not "4 above".
    const teen = topicLevels({ math: 10, science: 7, words: 5, history: 2 }, 15);
    const by = Object.fromEntries(teen.map((t) => [t.id, t]));
    expect(by.math).toMatchObject({ level: 10, start: null, meaning: 'For the strongest at their age' });
    expect(by.science.meaning).toBe('A stretch for their age');
    expect(by.words.meaning).toBeNull();
    expect(by.history.meaning).toBeNull();
    expect(glance(null, teen, [])).toMatchObject({ climbed: [], belowStart: [] });
    for (let level = 1; level <= 10; level++) expect(topicMeaning(level, null) ?? '').not.toMatch(/above|below|start/i);
  });

  it('young players start low on purpose: a 6- or 7-year-old reads against the start the game noted for them (review round 1)', () => {
    const bo = topicLevels({ math: 1 }, 6, { math: { level: 1, age: 6 } });
    expect(bo[0]).toMatchObject({ id: 'math', level: 1, meaning: 'At level 1, where they started at age 6' });
    expect(bo.find((t) => t.id === 'science')).toMatchObject({ level: 1, measured: false });
    const kit = topicLevels({ math: 3, science: 1 }, 7, { math: { level: 2, age: 7 }, science: { level: 2, age: 8 } });
    expect(kit.find((t) => t.id === 'math')?.meaning).toBe('Up 1 from level 2, where they started at age 7');
    expect(kit.find((t) => t.id === 'science')?.meaning).toBe('Below level 2, where they started at age 8 — a good one to practise together');
    const kitSame = topicLevels({ math: 3, science: 2 }, 7, { math: { level: 2, age: 7 }, science: { level: 2, age: 7 } });
    expect(kitSame.find((t) => t.id === 'science')?.meaning).toBe('At the level they started on');
    for (const [age, level] of [[6, 1], [6, 3], [7, 2], [8, 3], [8, 5]] as const) {
      expect(topicMeaning(level, { level: ageToStartLevel(age), age })).not.toMatch(/easy|below/i);
    }
    expect(topicMeaning(2, { level: ageToStartLevel(8), age: 8 })).toMatch(/^Below level 3/);
  });

  it('nothing claims a level went down (the data keeps no history)', () => {
    for (let start = 1; start <= 6; start++) {
      for (let level = 1; level <= 10; level++) expect(topicMeaning(level, { level: start, age: start + 5 }) ?? '').not.toMatch(/down|dropped|fell|harder/i);
    }
  });
});

describe('the start every topic shares, said once (review round 3)', () => {
  it('two or more noted topics, all from the same level at the same age; else none', () => {
    const same = { math: { level: 1, age: 6 }, words: { level: 1, age: 6 }, nature: { level: 1, age: 6 } };
    const rows = topicLevels({ math: 3, words: 1, nature: 0 }, 9, same);
    expect(sharedStart(rows)).toEqual({ level: 1, age: 6 });
    expect(rows.filter((t) => t.measured).map((t) => t.meaning)).toEqual(['Up 2 since they started', 'At the level they started on', 'At the level they started on']);
    expect(topicMeaning(9, { level: 4, age: 9 }, true)).toBe('Up 5 since they started — for the strongest at their age');
    expect(topicMeaning(2, { level: 4, age: 9 }, true)).toBe('Below where they started — a good one to practise together');
    // One noted topic, or starts that differ (a level or an age), or none: each row says its own.
    expect(sharedStart(topicLevels({ math: 3 }, 9, { math: { level: 1, age: 6 } }))).toBeNull();
    expect(sharedStart(topicLevels({ math: 3, words: 2 }, 9, { math: { level: 1, age: 6 }, words: { level: 2, age: 7 } }))).toBeNull();
    expect(sharedStart(topicLevels({ math: 3, words: 2 }, 9, { math: { level: 1, age: 6 }, words: { level: 1, age: 5 } }))).toBeNull();
    // A topic without a noted start doesn't count either way.
    expect(sharedStart(topicLevels({ math: 3, words: 2, history: 5 }, 9, { math: { level: 1, age: 6 }, words: { level: 1, age: 6 } }))).toEqual({ level: 1, age: 6 });
  });
});

describe('at a glance (review rounds 1–3)', () => {
  it('names lists the way a grown-up reads them', () => {
    expect(nameList([])).toBe('');
    expect(nameList(['Math'])).toBe('Math');
    expect(nameList(['Math', 'Science'])).toBe('Math and Science');
    expect(nameList(['Math', 'Science', 'Space'])).toBe('Math, Science and 1 more');
    expect(nameList(['Math', 'Science', 'Space'], 3)).toBe('Math, Science and Space');
    expect(nameList(['A', 'B', 'C', 'D', 'E'], Infinity)).toBe('A, B, C, D and E');
  });

  it('days played, the most progress, what to practise together and the questions waiting — all from what is stored', () => {
    const week = recentDays(TODAY, ['2026-10-18', '2026-10-15'], '2026-10-20');
    const starts = { math: { level: 4, age: 9 }, science: { level: 4, age: 9 }, engineering: { level: 4, age: 9 }, creativity: { level: 4, age: 9 }, nature: { level: 4, age: 9 } };
    const levels = topicLevels({ math: 6, science: 9, engineering: 3, creativity: 2, nature: 9, space: 1 }, 9, starts);
    const library = [...EIGHT_MISSED, EIGHT_MISSED[0], EIGHT_MISSED[0]].map((e, i) => ({ ...e, question: { ...e.question, id: `q${i}` } }));
    const missed = missedQuestions({ ...defaultSave(), library });
    const g = glance(week, levels, missed);
    expect(g.playedDays).toBe(3);
    // Space (1) has no noted start, so nothing is "most": every climb is said, none crowned (round 3).
    expect(g.ranked).toBe(false);
    expect(g.climbed.map((t) => t.label)).toEqual(['Math', 'Science', 'Nature & Animals']);
    expect(climbedText(g.climbed, g.ranked)).toBe(
      'Up since they started: Math (level 4 → 6), Science (level 4 → 9) and Nature & Animals (level 4 → 9).',
    );
    // …and it's in neither list.
    expect(g.belowStart.map((t) => t.label)).toEqual(['Engineering', 'Creativity']);
    // Three Math questions waiting (several); one of each other topic isn't.
    expect(g.missedByTopic).toEqual([{ label: 'Math', count: SEVERAL_MISSED }]);
    expect(g.missedCount).toBe(10);
    // Every measured topic with a start: then one can be said to have climbed most.
    const all = glance(week, topicLevels({ math: 6, science: 9, engineering: 3, creativity: 2, nature: 9 }, 9, starts), missed);
    expect(all.ranked).toBe(true);
    expect(all.climbed.map((t) => t.label)).toEqual(['Science', 'Nature & Animals']);
    expect(climbedText(all.climbed, all.ranked)).toBe('Most progress: Science and Nature & Animals — up 5 levels each since they started.');
    expect(climbedText(all.climbed.slice(0, 1), true)).toBe('Most progress: Science — up from level 4 to 9 since they started.');
  });

  it("launch week (Lia 9): one topic tried since the update is never crowned over years of Math it can't be compared with (review round 3)", () => {
    const lia = topicLevels(
      { math: 7, science: 8, history: 6, words: 5, creativity: 2, engineering: 3, geography: 5, music: 3 },
      9,
      { geography: { level: 4, age: 9 }, music: { level: 4, age: 9 } },
    );
    const g = glance(null, lia, []);
    expect(g.ranked).toBe(false);
    expect(climbedText(g.climbed, g.ranked)).toBe('Up since they started: Maps & Places (level 4 → 5).');
    expect(climbedText(g.climbed, g.ranked)).not.toMatch(/Most/);
    // One measured topic alone isn't "most" either.
    const one = glance(null, topicLevels({ math: 6 }, 9, { math: { level: 4, age: 9 } }), []);
    expect(one.ranked).toBe(false);
    expect(climbedText(one.climbed, one.ranked)).toBe('Up since they started: Math (level 4 → 6).');
  });

  it('what to practise: each topic once with its reasons, the most reasons first, two with reasons and the rest named (review rounds 2–3, #89 rounds 1–2)', () => {
    const t = (label: string) => ({ label }) as Parameters<typeof practiseText>[0]['belowStart'][number];
    expect(
      practiseText({
        belowStart: [t('Engineering'), t('Creativity'), t('Music'), t('Space')],
        missedByTopic: [{ label: 'Math', count: 4 }, { label: 'Science', count: 3 }],
      }),
    ).toBe('To practise together: Engineering (below their start) and Creativity (below their start). Also: Music, Space, Math and Science.');
    expect(practiseText({ belowStart: [], missedByTopic: [{ label: 'Math', count: 3 }] })).toBe('To practise together: Math (3 to try again).');
    // Kit's Creativity, below its start with 3 questions waiting, is named once with both reasons (round 3).
    expect(practiseText({ belowStart: [t('Creativity')], missedByTopic: [{ label: 'Creativity', count: 3 }] })).toBe(
      'To practise together: Creativity (below their start, 3 to try again).',
    );
    expect(
      practiseText({ belowStart: [t('Engineering'), t('Creativity')], missedByTopic: [{ label: 'Math', count: 4 }, { label: 'Creativity', count: 3 }] }),
    ).toBe('To practise together: Creativity (below their start, 3 to try again) and Engineering (below their start). Also: Math.');
    expect(practiseText({ belowStart: [t('Engineering')], missedByTopic: [{ label: 'Math', count: 4 }] })).toBe(
      'To practise together: Engineering (below their start) and Math (4 to try again).',
    );
    expect(practiseText({ belowStart: [], missedByTopic: [] })).toBeNull();
  });

  it('a topic in 💡 for under half right is not crowned in 🌟 as well — and no other topic takes its crown (review round 1)', () => {
    const starts = { math: { level: 5, age: 8 }, science: { level: 4, age: 8 }, words: { level: 4, age: 8 } };
    const weeks = { science: { asked: 8, right: 3, levelLastWeek: null } };
    // Ranked: Science climbed most (+1) but is under half right; Words climbed less — not "most".
    const g = glance(null, topicLevels({ math: 4, science: 5, words: 4 }, 8, starts, weeks), []);
    expect(g.ranked).toBe(true);
    expect(g.lowRight.map((t) => t.label)).toEqual(['Science']);
    expect(g.climbed).toEqual([]);
    expect(climbedText(g.climbed, g.ranked)).toBeNull();
    // Shared at the top: the other stays crowned.
    const two = glance(null, topicLevels({ math: 5, science: 5, words: 5 }, 8, starts, weeks), []);
    expect(two.climbed.map((t) => t.label)).toEqual(['Words & Stories']);
    expect(climbedText(two.climbed, two.ranked)).toBe('Most progress: Words & Stories — up from level 4 to 5 since they started.');
    // Not ranked (Math's start wasn't noted): the others that climbed are still said.
    const unranked = glance(null, topicLevels({ science: 5, words: 6, math: 3 }, 8, { science: starts.science, words: starts.words }, weeks), []);
    expect(unranked.ranked).toBe(false);
    expect(unranked.climbed.map((t) => t.label)).toEqual(['Words & Stories']);
  });

  it('nothing invented: no week without the table, no climb without a noted start, nothing from what was never saved', () => {
    const g = glance(null, topicLevels({ math: 4 }, 9, { math: { level: 4, age: 9 } }), []);
    expect(g).toEqual({ playedDays: null, climbed: [], ranked: false, belowStart: [], missedByTopic: [], missedCount: 0, lowRight: [] });
    expect(glance(null, null, null)).toEqual({ playedDays: null, climbed: [], ranked: false, belowStart: [], missedByTopic: [], missedCount: 0, lowRight: [] });
    expect(climbedText([], true)).toBeNull();
    expect(climbedText([], false)).toBeNull();
  });

  it('the days a streak proves count as played', () => {
    const g = glance(recentDays(TODAY, [TODAY], TODAY, 6), null, null);
    expect(g).toMatchObject({ playedDays: 6 });
  });
});

describe('the story, no spoilers', () => {
  it('in the Training Grounds: practice rounds, nothing about the world', () => {
    expect(storySummary(trainingSave())).toMatchObject({ stage: 'training', practiceRounds: 1, roundsToOpen: ROUNDS_TO_UNLOCK, goal: null });
  });

  it('mid-Act-II: acts by number only, Act I crystals by the names the opening story gave them, the next one unnamed (review round 1)', () => {
    const save = midActTwoSave();
    const s = storySummary(save);
    expect(s).toMatchObject({ stage: 'world', act: 2, actLabel: 'Act II', restored: 4, left: 1, spire: 'cleared' });
    expect(s.crystals.map((c) => c.crystal)).toEqual(['Crystal of Numbers', 'Crystal of Nature', 'Crystal of Gears', 'Crystal of Wonder', null]);
    expect(s.crystals.at(-1)).toMatchObject({ restored: false, topicLabel: null });
    // Never a crystal the game hasn't named yet, a later act's, or the finale.
    expect(JSON.stringify(s)).not.toMatch(/Memory|Voices|Starfall Sea|The Name|Time & History/);
    expect(s.goal).toBe(nextObjective(save.flags).title);
    // The unknown id is left out, never shown raw.
    expect(s.trophies.map((t) => t.name)).toEqual(['Verdant Key', 'Gearwright Key', 'Prism Key', 'Compass Badge', 'Leaf Badge']);
  });

  it("a crystal is named once their own 🚩 names it, or it's restored", () => {
    // Holding the Memoria Key: their guide says "Free the Crystal of Memory".
    const flags = {
      ...midActTwoSave().flags,
      [BOAT_MENDED]: true,
      [visitedFlag('silver-shallows')]: true,
      [visitedFlag('remembrance-hill')]: true,
      [keyFlag(keyForBoss('ringkeeper')!.id)]: true,
    };
    expect(nextObjective(flags).title).toBe('Free the Crystal of Memory');
    const s = storySummary({ ...midActTwoSave(), flags });
    expect(s.crystals.at(-1)).toMatchObject({ crystal: 'Crystal of Memory', topicLabel: 'Time & History', restored: false });
    const after = storySummary({ ...midActTwoSave(), flags: { ...midActTwoSave().flags, 'crystal-history-restored': true } });
    expect(after.crystals.at(-1)).toMatchObject({ crystal: 'Crystal of Memory', restored: true });
    expect(after.left).toBe(0);
  });

  it('Act I before the opening story: no crystal named yet; part-way the Spire is not mentioned; Act III and IV by their flags; the end', () => {
    // Before the opening story names the four, only the one their 🚩 names ("Free the Crystal of Numbers").
    const fresh = storySummary({ ...defaultSave(), worldUnlocked: true });
    expect(fresh.crystals.map((c) => c.crystal)).toEqual(['Crystal of Numbers', null, null, null]);
    const save = { ...defaultSave(), worldUnlocked: true, flags: { 'intro-seen': true, 'crystal-math-restored': true } };
    expect(storySummary(save)).toMatchObject({ act: 1, restored: 1, left: 3, spire: 'hidden', actLabel: 'Act I' });
    expect(storySummary(save).crystals).toHaveLength(4);
    expect(storyAct({ 'act2-seen': true, 'act3-seen': true })).toBe(3);
    expect(storyAct({ 'act4-seen': true })).toBe(4);
    const act4 = storySummary({ ...midActTwoSave(), flags: { ...midActTwoSave().flags, 'act3-seen': true, 'act4-seen': true, 'crystal-history-restored': true, 'crystal-words-restored': true } });
    expect(act4).toMatchObject({ act: 4, actLabel: 'Act IV', restored: 6, left: 0 });
    const done = storySummary({ ...midActTwoSave(), flags: { ...midActTwoSave().flags, 'act3-seen': true, 'act4-seen': true, 'umbra-named': true } });
    expect(done).toMatchObject({ stage: 'finished', goal: null, act: 4 });
    expect(done.crystals).toHaveLength(6);
  });
});

describe('missed questions (the Library queue)', () => {
  it('newest first, in words: the question, the right answer, what they picked, why, the topic', () => {
    const missed = missedQuestions(midActTwoSave());
    expect(missed).toHaveLength(8);
    expect(missed[0]).toMatchObject({
      topicLabel: 'Words & Stories',
      question: 'Which word means the same as "happy"?',
      rightAnswer: 'Joyful',
      theirAnswer: 'Tired',
      timedOut: false,
    });
    expect(missed.at(-1)).toMatchObject({ topicLabel: 'Math', rightAnswer: '56', theirAnswer: '54', explanation: '7 × 8 = 56: seven eights make fifty-six.' });
    const bridge = missed.find((m) => m.question.includes('bridge'));
    expect(bridge).toMatchObject({ timedOut: true, theirAnswer: null, rightAnswer: 'Triangle' });
    expect(missed.find((m) => m.question.includes('paint'))?.explanation).toBeNull();
    // No raw ids anywhere a grown-up reads.
    for (const m of missed) expect([m.topicLabel, m.question, m.rightAnswer, m.theirAnswer, m.explanation].join(' ')).not.toMatch(/q-/);
  });

  it('an entry it can’t read is left out; an unknown topic still reads in words', () => {
    const library = [
      EIGHT_MISSED[0],
      { question: { ...EIGHT_MISSED[1].question, correctIndex: 9 }, picked: 0 },
      { question: { ...EIGHT_MISSED[1].question, options: ['only one'] }, picked: 0 },
      { question: { ...EIGHT_MISSED[1].question, text: '   ' }, picked: 0 },
      { question: null, picked: 0 },
      { question: { ...EIGHT_MISSED[1].question, topic: 'cooking' }, picked: 2 },
    ] as never;
    const missed = missedQuestions({ ...defaultSave(), library });
    expect(missed).toHaveLength(2);
    // Picked the right answer (a stale index): no "they picked" line.
    expect(missed[0]).toMatchObject({ topicLabel: 'A question', theirAnswer: null });
  });
});

describe('touch typing', () => {
  it('not started, part-way, and every lesson with the badge', () => {
    expect(typingSummary(defaultSave())).toMatchObject({ cleared: 0, total: 13, next: 'F and J, the bumpy keys', leavesBest: null });
    expect(typingSummary(midActTwoSave())).toMatchObject({ cleared: 4, next: 'E and I: reach up!', badge: false, leavesBest: 10 });
    const ids = ['home-fj', 'home-dk', 'home-sl', 'home-a', 'top-ei', 'top-ru', 'top-to', 'home-gh', 'top-corners', 'bottom-vnmb', 'bottom-cxz', 'capitals', 'sentences'];
    const flags = Object.fromEntries([...ids.map((id) => [`typing:${id}`, true]), ['page:fact:math:0', true], ['leaves:25', true], ['leaves:10', true]]);
    expect(typingSummary({ ...defaultSave(), flags, badges: ['badge:scribe'] })).toEqual({
      cleared: 13,
      total: 13,
      next: null,
      badge: true,
      pagesCopied: 1,
      leavesBest: 25,
    });
  });
});
