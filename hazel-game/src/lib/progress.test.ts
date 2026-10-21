import { describe, it, expect, vi, beforeEach } from 'vitest';

// The database, as the page reads it: one canned answer per table.
const answers = vi.hoisted(() => ({} as Record<string, { data: unknown; error: unknown }>));
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
        then: (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) =>
          Promise.resolve(answers[table] ?? { data: [], error: null }).then(ok, bad),
      };
      return chain;
    },
  },
}));

const {
  PROGRESS_COLUMNS,
  SEVERAL_MISSED,
  climbedText,
  dayWords,
  fetchFamilyProgress,
  glance,
  hasPlayed,
  levelBand,
  levelSummary,
  missedQuestions,
  nameList,
  practiseText,
  recentDays,
  sharedStart,
  statsFromRow,
  storyAct,
  storySummary,
  streakSummary,
  topicLevels,
  topicMeaning,
  typingSummary,
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
});

describe('reading a family (#29)', () => {
  it('reads every kid in three queries — only progress columns, never a birth date or a PIN', async () => {
    answers.profiles = { data: [midActTwoRow('k1', TODAY), newKidRow('k2')], error: null };
    answers.saves = { data: [{ profile_id: 'k1', data: midActTwoSave() }], error: null };
    answers.play_days = { data: [{ profile_id: 'k1', day: '2026-10-20' }, { profile_id: 'k1', day: '2026-10-18' }], error: null };
    const got = await fetchFamilyProgress(['k1', 'k2', 'k3'], TODAY);
    expect(calls.map((c) => c.table)).toEqual(['profiles', 'saves', 'play_days']);
    expect(calls[0].select).toBe(PROGRESS_COLUMNS);
    expect(PROGRESS_COLUMNS).not.toMatch(/birth|pin|name/);
    expect(calls[0].filters).toEqual([['in', 'id', ['k1', 'k2', 'k3']]]);
    // The last week only.
    expect(calls[2].filters).toContainEqual(['gte', 'day', '2026-10-15']);
    expect(got.k1.stats?.xp).toBe(2340);
    expect(got.k1.save?.worldUnlocked).toBe(true);
    expect(got.k1.playDays).toEqual(['2026-10-20', '2026-10-18']);
    expect(got.k2).toEqual({ stats: expect.objectContaining({ xp: 0 }), save: null, playDays: [] });
    // A kid the database didn't return (none of this family's) is just empty.
    expect(got.k3).toEqual({ stats: null, save: null, playDays: [] });
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

  it('a failed play-days read (no migration 0025) leaves the week out and logs the real error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    answers.profiles = { data: [midActTwoRow('k1', TODAY)], error: null };
    answers.play_days = { data: null, error: { message: 'relation "public.play_days" does not exist', code: '42P01' } };
    const got = await fetchFamilyProgress(['k1'], TODAY);
    expect(got.k1.playDays).toBeNull();
    expect(got.k1.stats).not.toBeNull();
    expect(warn.mock.calls[0].join(' ')).toContain('42P01');
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
    expect(Object.keys(week[1]).sort()).toEqual(['iso', 'long', 'played', 'short', 'today']);
    // Ending yesterday, it still holds: those days, not today.
    expect(recentDays(TODAY, [], '2026-10-20', 3).map((d) => d.played)).toEqual([false, false, false, true, true, true, false]);
    // A streak that ended two days ago says nothing: the saved number waits for their next game to reset.
    expect(recentDays(TODAY, ['2026-10-19'], '2026-10-19', 5).filter((d) => d.played).map((d) => d.iso)).toEqual(['2026-10-19']);
    expect(recentDays(TODAY, ['2026-10-18', TODAY], TODAY, 4).find((d) => d.iso === '2026-10-18')).toMatchObject({ played: true });
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

  it('what to practise, grouped by why, every topic named — once (review rounds 2–3)', () => {
    const t = (label: string) => ({ label }) as Parameters<typeof practiseText>[0]['belowStart'][number];
    expect(
      practiseText({
        belowStart: [t('Engineering'), t('Creativity'), t('Music'), t('Space')],
        missedByTopic: [{ label: 'Math', count: 4 }, { label: 'Science', count: 3 }],
      }),
    ).toBe('To practise together — below where they started: Engineering, Creativity, Music and Space · questions waiting at the Library: Math (4) and Science (3).');
    expect(practiseText({ belowStart: [], missedByTopic: [{ label: 'Math', count: 3 }] })).toBe('To practise together — questions waiting at the Library: Math (3).');
    // Kit's Creativity, below its start with 3 questions waiting, is named once with both reasons (round 3).
    expect(practiseText({ belowStart: [t('Creativity')], missedByTopic: [{ label: 'Creativity', count: 3 }] })).toBe(
      'To practise together — below where they started, with questions waiting: Creativity (3).',
    );
    expect(
      practiseText({ belowStart: [t('Engineering'), t('Creativity')], missedByTopic: [{ label: 'Math', count: 4 }, { label: 'Creativity', count: 3 }] }),
    ).toBe('To practise together — below where they started, with questions waiting: Creativity (3) · below where they started: Engineering · questions waiting at the Library: Math (4).');
    expect(practiseText({ belowStart: [], missedByTopic: [] })).toBeNull();
  });

  it('nothing invented: no week without the table, no climb without a noted start, nothing from what was never saved', () => {
    const g = glance(null, topicLevels({ math: 4 }, 9, { math: { level: 4, age: 9 } }), []);
    expect(g).toEqual({ playedDays: null, climbed: [], ranked: false, belowStart: [], missedByTopic: [], missedCount: 0 });
    expect(glance(null, null, null)).toEqual({ playedDays: null, climbed: [], ranked: false, belowStart: [], missedByTopic: [], missedCount: 0 });
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
