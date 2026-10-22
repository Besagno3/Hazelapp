import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { todayIso } from '../lib/streak';

// The kid's row, at the wire: each read answers with the next queued result
// (and records the columns it asked for); each write is kept, and answers
// with the next queued write result (ok when none is queued).
type Answer = { data: unknown; error: unknown };
const reads = vi.hoisted(() => [] as Answer[]);
const asked = vi.hoisted(() => [] as string[]);
const writes = vi.hoisted(() => [] as { kind: 'update' | 'upsert'; row: Record<string, unknown> }[]);
const writeAnswers = vi.hoisted(() => [] as Answer[]);
vi.mock('../lib/supabase', () => {
  const from = () => {
    let answer: Answer = { data: null, error: null };
    const chain: Record<string, unknown> = {};
    chain.select = (cols: string) => {
      asked.push(cols);
      return chain;
    };
    chain.eq = () => chain;
    chain.abortSignal = () => chain;
    chain.maybeSingle = () => {
      answer = reads.shift() ?? { data: null, error: { message: 'no answer queued' } };
      return chain;
    };
    const write = (kind: 'update' | 'upsert') => (row: Record<string, unknown>) => {
      writes.push({ kind, row });
      answer = writeAnswers.shift() ?? { data: null, error: null };
      return chain;
    };
    chain.update = write('update');
    chain.upsert = write('upsert');
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(answer).then(res);
    return chain;
  };
  return { supabase: { rpc: vi.fn(async () => ({ data: 1, error: null })), from } };
});

// Whether the database has `skill_starts` is remembered for a while (module state): a fresh module each test.
/** A start noted today (#183: with the day it was noted). */
const today = (level: number, age: number) => ({ level, age, on: todayIso() });
let store: typeof import('./profileStore');
let saves: typeof import('./saveStore');
let defaultSave: typeof import('../lib/save').defaultSave;
beforeEach(async () => {
  localStorage.clear();
  reads.length = 0;
  asked.length = 0;
  writes.length = 0;
  writeAnswers.length = 0;
  vi.resetModules();
  store = await import('./profileStore');
  saves = await import('./saveStore');
  ({ defaultSave } = await import('../lib/save'));
  saves.useSaveStore.setState({ userId: 'kid-1', save: { ...defaultSave(), revision: 10 }, status: 'ready' });
});
// A failed read leaves a timer that would read again later: put the game away so it can't reach the next test's queue.
afterEach(() => {
  store.useProfileStore.getState().clearProfile();
  vi.useRealTimers();
});

const YEAR = new Date().getFullYear();
/** Ada, 9 (a topic not saved yet stands at level 4), Math at 6 since long ago. */
const ROW = {
  id: 'kid-1',
  birth_year: YEAR - 9,
  birth_month: 1,
  skill_levels: { math: 6 },
  xp: 500,
  level: 5,
  level_xp: 0,
  power_ups: {},
  current_streak: 0,
  longest_streak: 0,
  last_played_on: null,
};
const birth = { birthYear: YEAR - 9, birthMonth: 1 };
const NO_COLUMN_READ = { data: null, error: { code: '42703', message: 'column profiles.skill_starts does not exist' } };
const NO_COLUMN_WRITE = { data: null, error: { code: 'PGRST204', message: "Could not find the 'skill_starts' column of 'profiles' in the schema cache" } };
const profile = () => store.useProfileStore.getState().profile!;
const save = () => saves.useSaveStore.getState().save!;
const updates = () => writes.filter((w) => w.kind === 'update').map((w) => w.row);

describe("each topic's start on the profile, profiles.skill_starts (#174)", () => {
  it('read with the profile: junk dropped, the first one noted kept', async () => {
    reads.push({ data: { ...ROW, skill_starts: { math: { level: 2, age: 7 }, music: { level: 11, age: 9 }, constructor: { level: 1, age: 5 } } }, error: null });
    await store.useProfileStore.getState().loadProfile('kid-1', birth);
    expect(asked[0]).toContain('skill_starts');
    expect(profile().skillStarts).toEqual({ math: { level: 2, age: 7 } });
  });

  it("the first save of a topic notes its start on the profile and in the save, and writes it with the level", async () => {
    reads.push({ data: { ...ROW, skill_starts: {} }, error: null });
    await store.useProfileStore.getState().loadProfile('kid-1', birth);
    await store.useProfileStore.getState().setSkillLevel('science', 5);
    expect(profile().skillStarts).toEqual({ science: today(4, 9) });
    expect(save().topicStarts).toEqual({ science: today(4, 9) });
    expect(updates().at(-1)).toMatchObject({ skill_levels: { math: 6, science: 5 }, skill_starts: { science: today(4, 9) } });
    // Later saves of it write the level alone; the start never moves.
    await store.useProfileStore.getState().setSkillLevel('science', 6);
    expect(updates().at(-1)).not.toHaveProperty('skill_starts');
    expect(profile().skillStarts).toEqual({ science: today(4, 9) });
  });

  it('a start the save already holds (another device, an older app) is the one noted on the profile', async () => {
    saves.useSaveStore.setState({ save: { ...defaultSave(), revision: 10, topicStarts: { words: { level: 2, age: 7 } } } });
    reads.push({ data: { ...ROW, skill_starts: { words: { level: 2, age: 7 } } }, error: null });
    await store.useProfileStore.getState().loadProfile('kid-1', birth);
    // The row has it, the profile has it: Words' first save keeps it, not "level 4 at 9".
    const before = writes.length;
    await store.useProfileStore.getState().setSkillLevel('words', 3);
    expect(profile().skillStarts).toEqual({ words: { level: 2, age: 7 } });
    expect(save().topicStarts).toEqual({ words: { level: 2, age: 7 } });
    expect(writes.slice(before)).toHaveLength(1);
  });

  it('a database without the column (0026 not applied): the read is asked again without it, and the column left out for a while — then asked for again, and on every load (review round 2)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    reads.push(NO_COLUMN_READ, { data: ROW, error: null });
    await store.useProfileStore.getState().loadProfile('kid-1', birth);
    expect(asked).toHaveLength(2);
    expect(asked[0]).toContain('skill_starts');
    expect(asked[1]).not.toContain('skill_starts');
    expect(profile()).toMatchObject({ xp: 500, skillLevels: { math: 6 } });
    expect(profile().skillStarts).toBeUndefined();
    expect(store.useProfileStore.getState().remoteError).toBeNull();
    // Starts still go into the save; no write names the column.
    await store.useProfileStore.getState().setSkillLevel('science', 5);
    expect(save().topicStarts).toEqual({ science: today(4, 9) });
    expect(updates().every((row) => !('skill_starts' in row))).toBe(true);
    // After a while (the migration applied while the tab stayed open), a write names it again.
    vi.setSystemTime(Date.now() + store.STARTS_RECHECK_MS + 1);
    await store.useProfileStore.getState().setSkillLevel('history', 5);
    expect(updates().at(-1)).toMatchObject({ skill_starts: { history: today(4, 9) } });
    // A profile load asks for it again at once, whenever the last miss was (review round 2: it was never asked again in that tab).
    reads.push(NO_COLUMN_READ, { data: ROW, error: null });
    await store.useProfileStore.getState().loadProfile('kid-1', birth);
    expect(asked).toHaveLength(4);
    expect(asked[2]).toContain('skill_starts');
    expect(asked[3]).not.toContain('skill_starts');
    reads.push({ data: { ...ROW, skill_starts: {} }, error: null });
    await store.useProfileStore.getState().loadProfile('kid-1', birth);
    expect(asked[4]).toContain('skill_starts');
  });

  it("a write the database refuses for the column is sent again without it, and later writes leave it out", async () => {
    reads.push({ data: { ...ROW, skill_starts: {} }, error: null }); // the read went through (a stale schema, say)
    await store.useProfileStore.getState().loadProfile('kid-1', birth);
    writeAnswers.push(NO_COLUMN_WRITE);
    await store.useProfileStore.getState().setSkillLevel('science', 5);
    expect(updates()).toHaveLength(2);
    expect(updates()[0]).toHaveProperty('skill_starts');
    expect(updates()[1]).toMatchObject({ skill_levels: { math: 6, science: 5 } });
    expect(updates()[1]).not.toHaveProperty('skill_starts');
    expect(store.useProfileStore.getState().remoteError).toBeNull();
    await store.useProfileStore.getState().setSkillLevel('history', 5);
    expect(updates()).toHaveLength(3);
    expect(updates()[2]).not.toHaveProperty('skill_starts');
    expect(save().topicStarts).toEqual({ science: today(4, 9), history: today(4, 9) });
  });

  it("on load, starts in the save the profile lacks are carried onto it — one write", async () => {
    saves.useSaveStore.setState({ save: { ...defaultSave(), revision: 10, topicStarts: { math: { level: 1, age: 6 }, science: { level: 3, age: 8 } } } });
    reads.push({ data: { ...ROW, skill_starts: { science: { level: 2, age: 7 } } }, error: null });
    await store.useProfileStore.getState().loadProfile('kid-1', birth);
    // The row's own start stays (the first); Math's comes from the save.
    expect(profile().skillStarts).toEqual({ math: { level: 1, age: 6 }, science: { level: 2, age: 7 } });
    await vi.waitFor(() => expect(updates()).toHaveLength(1));
    expect(updates()[0]).toEqual({ skill_starts: { math: { level: 1, age: 6 }, science: { level: 2, age: 7 } }, updated_at: expect.any(String) });
  });

  it('the save still on its way when the profile loads: carried once it comes', async () => {
    saves.useSaveStore.setState({ userId: 'kid-1', save: null, status: 'loading' });
    reads.push({ data: { ...ROW, skill_starts: {} }, error: null });
    await store.useProfileStore.getState().loadProfile('kid-1', birth);
    expect(writes).toEqual([]);
    saves.useSaveStore.setState({ save: { ...defaultSave(), revision: 10, topicStarts: { math: { level: 1, age: 6 } } }, status: 'ready' });
    expect(profile().skillStarts).toEqual({ math: { level: 1, age: 6 } });
    await vi.waitFor(() => expect(updates()).toHaveLength(1));
    expect(updates()[0]).toMatchObject({ skill_starts: { math: { level: 1, age: 6 } } });
    // Once only.
    saves.useSaveStore.getState().update((s) => ({ ...s, coins: s.coins + 1 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(updates()).toHaveLength(1);
  });

  it('nothing to carry, another kid’s save, a database without the column, a row not read: no write', async () => {
    saves.useSaveStore.setState({ save: { ...defaultSave(), revision: 10, topicStarts: { math: { level: 1, age: 6 } } } });
    reads.push({ data: { ...ROW, skill_starts: { math: { level: 1, age: 6 } } }, error: null });
    await store.useProfileStore.getState().loadProfile('kid-1', birth);
    saves.useSaveStore.setState({ userId: 'kid-2' });
    reads.push({ data: { ...ROW, skill_starts: {} }, error: null });
    await store.useProfileStore.getState().loadProfile('kid-1', birth);
    saves.useSaveStore.setState({ userId: 'kid-1' });
    reads.push(NO_COLUMN_READ, { data: ROW, error: null });
    await store.useProfileStore.getState().loadProfile('kid-1', birth);
    reads.push({ data: null, error: { message: 'Failed to fetch' } });
    await store.useProfileStore.getState().loadProfile('kid-1', birth);
    await new Promise((r) => setTimeout(r, 0));
    expect(writes).toEqual([]);
  });
});
