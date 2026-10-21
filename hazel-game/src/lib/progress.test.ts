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
  BAND_WORDS,
  PROGRESS_COLUMNS,
  STARTING_WORDS,
  dayWords,
  fetchFamilyProgress,
  hasPlayed,
  levelBand,
  levelSummary,
  missedQuestions,
  recentDays,
  statsFromRow,
  storyAct,
  storySummary,
  streakSummary,
  topicLevels,
  typingSummary,
} = await import('./progress');
const { ALL_TOPIC_INFO } = await import('../content/topics');
const { nextObjective } = await import('./wayfinding');
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
    expect(streakSummary(stats, TODAY)).toEqual({ current: 3, best: 7, lastPlayed: 'Yesterday' });
    expect(streakSummary({ ...stats, lastPlayedOn: TODAY }, TODAY)).toMatchObject({ current: 3, lastPlayed: 'Today' });
  });

  it('a missed day breaks it — never the stale saved number — and the best is kept', () => {
    expect(streakSummary({ ...stats, lastPlayedOn: '2026-10-19' }, TODAY)).toEqual({ current: 0, best: 7, lastPlayed: 'Monday' });
    expect(streakSummary(null, TODAY)).toEqual({ current: 0, best: 0, lastPlayed: null });
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
});

describe('question level by topic', () => {
  it('the bands a grown-up reads, at their edges', () => {
    expect([1, 3, 4, 6, 7, 8, 9, 10].map(levelBand)).toEqual(['easy', 'easy', 'right', 'right', 'stretch', 'stretch', 'top', 'top']);
  });

  it('every topic, in the game order — measured levels, starting levels for the rest, junk clamped', () => {
    const levels = topicLevels({ math: 6, science: 8, history: 12, nature: 0.4, space: Number.NaN }, 9);
    expect(levels.map((t) => t.id)).toEqual(ALL_TOPIC_INFO.map((t) => t.id));
    expect(levels).toHaveLength(10);
    const by = Object.fromEntries(levels.map((t) => [t.id, t]));
    expect(by.math).toMatchObject({ label: 'Math', level: 6, measured: true, meaning: BAND_WORDS.right });
    expect(by.science).toMatchObject({ level: 8, meaning: 'A stretch for their age' });
    expect(by.history).toMatchObject({ level: 10, meaning: 'For the strongest at their age' });
    expect(by.nature).toMatchObject({ level: 1, meaning: 'Easy questions for their age' });
    // A 9-year-old starts a topic at 4 (age − 5).
    expect(by.music).toMatchObject({ label: 'Music', level: 4, measured: false, meaning: STARTING_WORDS });
    expect(by.space).toMatchObject({ level: 4, measured: false });
  });
});

describe('the story, no spoilers', () => {
  it('in the Training Grounds: practice rounds, nothing about the world', () => {
    expect(storySummary(trainingSave())).toMatchObject({ stage: 'training', practiceRounds: 1, roundsToOpen: 3, goal: null });
  });

  it('mid-Act-II: Act I and II crystals only, the Spire won, their own next goal, trophies by name', () => {
    const save = midActTwoSave();
    const s = storySummary(save);
    expect(s).toMatchObject({ stage: 'world', act: 2, actTitle: 'Act II · The Crystal of Memory', restored: 4, spire: 'cleared' });
    expect(s.crystals.map((c) => c.crystal)).toEqual([
      'Crystal of Numbers',
      'Crystal of Nature',
      'Crystal of Gears',
      'Crystal of Wonder',
      'Crystal of Memory',
    ]);
    expect(s.crystals.at(-1)).toMatchObject({ restored: false, topicLabel: 'Time & History' });
    // A later act's crystal is never named.
    expect(JSON.stringify(s)).not.toMatch(/Voices|Starfall Sea|The Name/);
    expect(s.goal).toBe(nextObjective(save.flags).title);
    // The unknown id is left out, never shown raw.
    expect(s.trophies.map((t) => t.name)).toEqual(['Verdant Key', 'Gearwright Key', 'Prism Key', 'Compass Badge', 'Leaf Badge']);
  });

  it('Act I part-way: the Spire is not mentioned yet; Act III and IV by their flags; the end', () => {
    const save = { ...defaultSave(), worldUnlocked: true, flags: { 'crystal-math-restored': true } };
    expect(storySummary(save)).toMatchObject({ act: 1, restored: 1, spire: 'hidden', actTitle: 'Act I · The Four Crystals' });
    expect(storySummary(save).crystals).toHaveLength(4);
    expect(storyAct({ 'act2-seen': true, 'act3-seen': true })).toBe(3);
    expect(storyAct({ 'act4-seen': true })).toBe(4);
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
