import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Profile } from '../types';

// The kid's row: each read answers with the next queued result; every write is kept.
type Answer = { data: unknown; error: unknown };
const reads = vi.hoisted(() => [] as (Answer | Promise<Answer>)[]);
const writes = vi.hoisted(() => [] as { kind: 'update' | 'upsert'; row: Record<string, unknown> }[]);
vi.mock('../lib/supabase', () => {
  const from = () => {
    let answer: Answer | Promise<Answer> = { data: null, error: null };
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = () => {
      answer = reads.shift() ?? { data: null, error: { message: 'no answer queued' } };
      return chain;
    };
    chain.update = (row: Record<string, unknown>) => {
      writes.push({ kind: 'update', row });
      return chain;
    };
    chain.upsert = (row: Record<string, unknown>) => {
      writes.push({ kind: 'upsert', row });
      return chain;
    };
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(answer).then(res);
    return chain;
  };
  return { supabase: { rpc: vi.fn(async () => ({ data: 1, error: null })), from } };
});

const { useProfileStore, RETRY_READ_MS } = await import('./profileStore');
const { useSaveStore } = await import('./saveStore');
const { defaultSave } = await import('../lib/save');
const { todayIso, isoOffset } = await import('../lib/streak');
const { profileKey } = await import('../lib/profile');

const YEAR = new Date().getFullYear();
const TODAY = todayIso();
const FAILED: Answer = { data: null, error: { message: 'Failed to fetch' } };

/** The kid's real row on the server: level 12, Math 7 (started years ago), a 10-day streak up to yesterday. */
const ROW = {
  id: 'kid-1',
  birth_year: YEAR - 10,
  birth_month: 1,
  skill_levels: { math: 7, science: 6 },
  xp: 5000,
  level: 12,
  level_xp: 40,
  power_ups: { attack: 3 },
  current_streak: 10,
  longest_streak: 10,
  last_played_on: isoOffset(TODAY, -1),
};

const cached = (over: Partial<Profile> = {}): Profile => ({
  id: 'kid-1',
  birthYear: YEAR - 10,
  birthMonth: 1,
  skillLevels: { math: 7, science: 6 },
  xp: 5000,
  level: 12,
  levelXp: 40,
  powerUps: { attack: 3 },
  currentStreak: 10,
  longestStreak: 10,
  lastPlayedOn: isoOffset(TODAY, -1),
  ...over,
});

const birth = { birthYear: YEAR - 10, birthMonth: 1 };
const updates = () => writes.filter((w) => w.kind === 'update').map((w) => w.row);
const later = () => vi.setSystemTime(Date.now() + RETRY_READ_MS + 1);

beforeEach(() => {
  localStorage.clear();
  reads.length = 0;
  writes.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  useProfileStore.getState().clearProfile();
  useSaveStore.setState({ userId: 'kid-1', save: { ...defaultSave(), revision: 10 }, status: 'ready' });
});
afterEach(() => vi.useRealTimers());

describe("a profile that wasn't read writes nothing derived from it (#29 review round 3)", () => {
  it('read failed on a device with no copy: play goes on, but no start is noted and nothing is written over the real row', async () => {
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    expect(useProfileStore.getState().unread).toMatchObject({ base: null, xp: 0 });
    // The kid plays a Math round and earns XP: it shows in memory…
    await useProfileStore.getState().setSkillLevel('math', 6);
    await useProfileStore.getState().addXp(30);
    await useProfileStore.getState().addPowerUp('attack');
    expect(useProfileStore.getState().profile).toMatchObject({ xp: 30, skillLevels: { math: 6 }, lastPlayedOn: TODAY });
    // …but Math (really at 7, started years ago) gets no start "at age 10",
    expect(useSaveStore.getState().save?.topicStarts).toEqual({});
    expect(useSaveStore.getState().save?.revision).toBe(10);
    // the server row keeps its XP, levels, power-ups and streak,
    expect(writes).toEqual([]);
    // and the made-up profile never becomes this device's copy.
    expect(localStorage.getItem(profileKey('kid-1'))).toBeNull();
  });

  it("read failed with this device's copy: the copy keeps up with play, still nothing goes to the row and no start is noted", async () => {
    localStorage.setItem(profileKey('kid-1'), JSON.stringify(cached({ skillLevels: { science: 6 } })));
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    // Math isn't in this (stale) copy — it was first played on another device.
    await useProfileStore.getState().setSkillLevel('math', 5);
    await useProfileStore.getState().addXp(20);
    expect(useSaveStore.getState().save?.topicStarts).toEqual({});
    expect(writes).toEqual([]);
    expect(JSON.parse(localStorage.getItem(profileKey('kid-1'))!)).toMatchObject({ xp: 5020, skillLevels: { science: 6, math: 5 } });
  });

  it('the next change after a while reads the row again — the real levels and streak, plus what was earned since — and writes only then', async () => {
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    await useProfileStore.getState().setSkillLevel('math', 5); // a round from the made-up start
    await useProfileStore.getState().addXp(30);
    expect(reads).toEqual([]); // too soon to ask again
    later();
    reads.push({ data: ROW, error: null });
    await useProfileStore.getState().addXp(10);
    await vi.waitFor(() => expect(useProfileStore.getState().unread).toBeNull());
    const p = useProfileStore.getState().profile!;
    // The server's Math (7) — not the 5 worked out from nothing; 5000 + the 40 earned since; the 10-day streak goes on today.
    expect(p).toMatchObject({ xp: 5040, skillLevels: { math: 7, science: 6 }, powerUps: { attack: 3 }, currentStreak: 11, longestStreak: 11, lastPlayedOn: TODAY });
    await vi.waitFor(() => expect(updates()).toHaveLength(1));
    expect(updates()[0]).toMatchObject({ xp: 5040, skill_levels: { math: 7, science: 6 }, current_streak: 11, last_played_on: TODAY });
    expect(useProfileStore.getState().remoteError).toBeNull();
    // Read now: a topic new to the row notes its start, and writes go through.
    await useProfileStore.getState().setSkillLevel('history', 6);
    expect(useSaveStore.getState().save?.topicStarts).toEqual({ history: { level: 5, age: 10 } });
    expect(updates().at(-1)).toMatchObject({ skill_levels: { math: 7, science: 6, history: 6 } });
  });

  it('levels worked out from a made-up start never go over the real row — not even upwards', async () => {
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    await useProfileStore.getState().setSkillLevel('science', 8); // from the age start (5), not her real 6
    await useProfileStore.getState().addPowerUp('attack');
    later();
    reads.push({ data: { ...ROW, skill_levels: { math: 7, science: 3 } }, error: null });
    await useProfileStore.getState().addXp(5);
    await vi.waitFor(() => expect(useProfileStore.getState().unread).toBeNull());
    expect(useProfileStore.getState().profile).toMatchObject({ skillLevels: { math: 7, science: 3 }, powerUps: { attack: 3 } });
    await vi.waitFor(() => expect(updates()).toHaveLength(1));
    expect(updates()[0]).toMatchObject({ skill_levels: { math: 7, science: 3 }, power_ups: { attack: 3 } });
  });

  it("with this device's copy, levels moved since count once the row is read (the higher wins, as on any load)", async () => {
    localStorage.setItem(profileKey('kid-1'), JSON.stringify(cached()));
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    await useProfileStore.getState().setSkillLevel('math', 8);
    later();
    reads.push({ data: ROW, error: null });
    await useProfileStore.getState().addXp(25);
    await vi.waitFor(() => expect(useProfileStore.getState().unread).toBeNull());
    expect(useProfileStore.getState().profile).toMatchObject({ xp: 5025, skillLevels: { math: 8, science: 6 }, currentStreak: 11 });
  });

  it('asks again at most once a while, and a read that fails again keeps waiting', async () => {
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    later();
    reads.push(FAILED);
    await useProfileStore.getState().addXp(10);
    await useProfileStore.getState().addXp(10);
    await vi.waitFor(() => expect(useProfileStore.getState().remoteError).toBe('Failed to fetch'));
    expect(reads).toEqual([]); // one read for both
    expect(useProfileStore.getState().unread).toMatchObject({ xp: 20 });
    expect(writes).toEqual([]);
  });

  it("a read that answers after Switch player never lands on the next kid's profile", async () => {
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    later();
    let answer: (v: Answer) => void = () => {};
    reads.push(new Promise<Answer>((r) => (answer = r)));
    const pending = useProfileStore.getState().retryRead();
    // Switch player: the next kid's read fails too, so their profile is unread as well.
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-2', birth);
    answer({ data: ROW, error: null });
    await pending;
    expect(useProfileStore.getState().profile).toMatchObject({ id: 'kid-2', xp: 0, skillLevels: {} });
    expect(useProfileStore.getState().unread).not.toBeNull();
    expect(writes).toEqual([]);
  });

  it("a first read that answers after the game was put away doesn't bring the profile back", async () => {
    let answer: (v: Answer) => void = () => {};
    reads.push(new Promise<Answer>((r) => (answer = r)));
    const loading = useProfileStore.getState().loadProfile('kid-1', birth);
    useProfileStore.getState().clearProfile();
    answer({ data: ROW, error: null });
    await loading;
    expect(useProfileStore.getState().profile).toBeNull();
    expect(localStorage.getItem(profileKey('kid-1'))).toBeNull();
  });

  it('a read that answers after the kid was put away changes nothing', async () => {
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    later();
    let answer: (v: Answer) => void = () => {};
    reads.push(new Promise<Answer>((r) => (answer = r)));
    const pending = useProfileStore.getState().retryRead();
    useProfileStore.getState().clearProfile();
    answer({ data: ROW, error: null });
    await pending;
    expect(useProfileStore.getState().profile).toBeNull();
    expect(writes).toEqual([]);
  });
});

describe('XP earned as Player 2 on this device, owed until the kid loads here (lib/kidXp)', () => {
  it('the row read: the owed XP joins it, is written up, and is owed no more', async () => {
    localStorage.setItem('hazel-owed-xp-kid-1', '40');
    reads.push({ data: ROW, error: null });
    await useProfileStore.getState().loadProfile('kid-1', birth);
    expect(useProfileStore.getState().profile).toMatchObject({ xp: 5040, level: 12, levelXp: 80 });
    expect(updates().at(-1)).toMatchObject({ xp: 5040, level: 12, level_xp: 80 });
    expect(localStorage.getItem('hazel-owed-xp-kid-1')).toBeNull();
  });

  it("the read failed: it's held like any XP until the row is read", async () => {
    localStorage.setItem('hazel-owed-xp-kid-1', '40');
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    expect(useProfileStore.getState().unread).toMatchObject({ xp: 40 });
    expect(updates()).toEqual([]);
    expect(localStorage.getItem('hazel-owed-xp-kid-1')).toBeNull();
  });

  it('no row yet: the new row starts with it', async () => {
    localStorage.setItem('hazel-owed-xp-kid-1', '40');
    reads.push({ data: null, error: null });
    await useProfileStore.getState().loadProfile('kid-1', birth);
    expect(writes.find((w) => w.kind === 'upsert')?.row).toMatchObject({ xp: 40 });
  });
});
