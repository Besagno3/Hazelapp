import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Profile } from '../types';

// The kid's row: each read answers with the next queued result; every write is kept. A read called off
// (`abortSignal`) answers as postgrest-js does when its fetch is aborted: a failed read, whether or not the server
// ever answered (#184).
type Answer = { data: unknown; error: unknown };
const reads = vi.hoisted(() => [] as (Answer | Promise<Answer>)[]);
const writes = vi.hoisted(() => [] as { kind: 'update' | 'upsert'; row: Record<string, unknown> }[]);
const ABORTED = vi.hoisted(() => ({ data: null, error: { message: 'AbortError: signal is aborted without reason', code: '' } }));
vi.mock('../lib/supabase', () => {
  const from = () => {
    let answer: Answer | Promise<Answer> = { data: null, error: null };
    let calledOff: Promise<Answer> = new Promise(() => {});
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.abortSignal = (signal: AbortSignal) => {
      calledOff = new Promise((r) => signal.addEventListener('abort', () => r(ABORTED)));
      return chain;
    };
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
    chain.then = (res: (v: unknown) => unknown) => Promise.race([Promise.resolve(answer), calledOff]).then(res);
    return chain;
  };
  return { supabase: { rpc: vi.fn(async () => ({ data: 1, error: null })), from } };
});

const { useProfileStore, READ_TIMEOUT_MS, RETRY_READ_MS, RETRY_READ_MAX_MS } = await import('./profileStore');
const { useSaveStore } = await import('./saveStore');
const { defaultSave } = await import('../lib/save');
const { todayIso, isoOffset } = await import('../lib/streak');
const { profileKey, readUnreadSteps, writeUnreadSteps } = await import('../lib/profile');
const { playDayRecords } = await import('../lib/playDays');

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

  it('a level worked out from a made-up start goes onto the real row as a step, never as a value; power-ups from it stay dropped (#176)', async () => {
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    await useProfileStore.getState().setSkillLevel('science', 8); // from the age start (5): up 3, not "level 8"
    await useProfileStore.getState().addPowerUp('attack');
    later();
    reads.push({ data: { ...ROW, skill_levels: { math: 7, science: 3 } }, error: null });
    await useProfileStore.getState().addXp(5);
    await vi.waitFor(() => expect(useProfileStore.getState().unread).toBeNull());
    // Her real science (3) moved up the 3 she climbed — never the made-up 8; Math untouched.
    expect(useProfileStore.getState().profile).toMatchObject({ skillLevels: { math: 7, science: 6 }, powerUps: { attack: 3 } });
    await vi.waitFor(() => expect(updates()).toHaveLength(1));
    expect(updates()[0]).toMatchObject({ skill_levels: { math: 7, science: 6 }, power_ups: { attack: 3 } });
    // A topic the row had: no start noted for it (it started long ago).
    expect(useSaveStore.getState().save?.topicStarts).toEqual({});
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

describe('a row that wasn\'t read is asked for again, and the levels played meanwhile carry over as steps (#176)', () => {
  const timers = () => vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });

  it('read again on a timer — a kid who only walks the world gets the real profile too', async () => {
    timers();
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    reads.push(FAILED, { data: ROW, error: null });
    await vi.advanceTimersByTimeAsync(RETRY_READ_MS - 1);
    expect(reads).toHaveLength(2); // not yet
    await vi.advanceTimersByTimeAsync(1);
    expect(reads).toHaveLength(1); // asked, failed again: still unread, and asked again later — twice as long later
    expect(useProfileStore.getState().unread).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2 * RETRY_READ_MS);
    expect(reads).toEqual([]);
    expect(useProfileStore.getState().unread).toBeNull();
    expect(useProfileStore.getState().profile).toMatchObject({ xp: 5000, skillLevels: { math: 7, science: 6 } });
    expect(updates()).toHaveLength(1);
  });

  it('each read that fails waits twice as long for the next, up to 5 minutes; a read, or the next kid, starts again at 15 s (review round 1)', async () => {
    timers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    for (let i = 0; i < 7; i++) reads.push(FAILED);
    // Left to answer, a moment before each read is due and as it comes.
    const left: number[] = [];
    for (const sec of [15, 30, 60, 120, 240, 300, 300]) {
      await vi.advanceTimersByTimeAsync(sec * 1000 - 1);
      left.push(reads.length);
      await vi.advanceTimersByTimeAsync(1);
      left.push(reads.length);
    }
    expect(left).toEqual([7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0]);
    expect(RETRY_READ_MAX_MS).toBe(5 * 60_000);
    // A change meanwhile waits as long as the timer does: no read every 15 s from play either.
    reads.length = 0;
    reads.push(FAILED);
    vi.setSystemTime(Date.now() + 2 * RETRY_READ_MS);
    await useProfileStore.getState().addXp(5);
    expect(reads).toHaveLength(1);
    // Another kid starts again at 15 s.
    reads.length = 0;
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-2', birth);
    reads.push(FAILED);
    await vi.advanceTimersByTimeAsync(RETRY_READ_MS);
    expect(reads).toEqual([]);
  });

  it("a read still out for the last kid never stops the next kid's timer (review round 1)", async () => {
    timers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    reads.push(new Promise<Answer>(() => {})); // kid-1's timer read hangs (a fetch with no answer)
    await vi.advanceTimersByTimeAsync(RETRY_READ_MS);
    expect(reads).toEqual([]);
    useProfileStore.getState().clearProfile();
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-2', birth);
    reads.push(FAILED, { data: { ...ROW, id: 'kid-2' }, error: null });
    await vi.advanceTimersByTimeAsync(RETRY_READ_MS + 2 * RETRY_READ_MS);
    expect(reads).toEqual([]);
    expect(useProfileStore.getState().unread).toBeNull();
    expect(useProfileStore.getState().profile).toMatchObject({ id: 'kid-2', xp: 5000 });
  });

  it('read again the moment the device is back online', async () => {
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    reads.push({ data: ROW, error: null });
    window.dispatchEvent(new Event('online')); // well within RETRY_READ_MS
    await vi.waitFor(() => expect(useProfileStore.getState().unread).toBeNull());
    expect(useProfileStore.getState().profile).toMatchObject({ xp: 5000 });
  });

  it('once read, or once the game is put away, nothing asks again — not the timer, not coming online', async () => {
    timers();
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    useProfileStore.getState().clearProfile();
    reads.push({ data: ROW, error: null });
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(3 * RETRY_READ_MS);
    expect(reads).toHaveLength(1);
    // Read on load: no timer, no listener.
    reads.length = 0;
    reads.push({ data: ROW, error: null });
    await useProfileStore.getState().loadProfile('kid-1', birth);
    reads.push({ data: ROW, error: null });
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(3 * RETRY_READ_MS);
    expect(reads).toHaveLength(1);
  });

  it('each topic moves from the real level by its net step — down as well as up, within 1–10', async () => {
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth); // age 10: every topic starts at 5 here
    await useProfileStore.getState().setSkillLevel('math', 3); // down 2
    await useProfileStore.getState().setSkillLevel('science', 7);
    await useProfileStore.getState().setSkillLevel('science', 8); // up 3 in all
    await useProfileStore.getState().setSkillLevel('words', 4); // down 1
    later();
    reads.push({ data: { ...ROW, skill_levels: { math: 2, science: 5, words: 6 } }, error: null });
    await useProfileStore.getState().addXp(5);
    await vi.waitFor(() => expect(useProfileStore.getState().unread).toBeNull());
    // Math 2 − 2 stops at 1; science 5 + 3 = 8; words 6 − 1 = 5.
    expect(useProfileStore.getState().profile?.skillLevels).toEqual({ math: 1, science: 8, words: 5 });
    await vi.waitFor(() => expect(updates()).toHaveLength(1));
    expect(updates()[0]).toMatchObject({ skill_levels: { math: 1, science: 8, words: 5 } });
  });

  it('a step never runs past the top level', async () => {
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    await useProfileStore.getState().setSkillLevel('science', 8); // up 3 from the made-up 5
    later();
    reads.push({ data: { ...ROW, skill_levels: { science: 9 } }, error: null });
    await useProfileStore.getState().retryRead();
    expect(useProfileStore.getState().profile?.skillLevels).toEqual({ science: 10 });
  });

  it("a kid picked while the last one's row is still unread: the old kid's timer reads nothing", async () => {
    timers();
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    let answer: (v: Answer) => void = () => {};
    reads.push(new Promise<Answer>((r) => (answer = r)));
    const loading = useProfileStore.getState().loadProfile('kid-2', birth);
    reads.push({ data: ROW, error: null }); // only kid-1's retry could take this
    // Past the time kid-1's timer was due (kid-2's read was called off at 10 s meanwhile, #184; its own retry isn't due yet).
    await vi.advanceTimersByTimeAsync(RETRY_READ_MS + 1);
    expect(reads).toHaveLength(1);
    answer({ data: { ...ROW, id: 'kid-2' }, error: null });
    await loading;
    expect(useProfileStore.getState().profile?.id).toBe('kid-2');
  });

  it('a topic first played meanwhile that the row has no level for keeps its level, and its start is noted then', async () => {
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    await useProfileStore.getState().setSkillLevel('history', 6); // played from 5, the start for 10
    await useProfileStore.getState().setSkillLevel('math', 6);
    expect(useSaveStore.getState().save?.topicStarts).toEqual({}); // not while unread
    later();
    reads.push({ data: ROW, error: null }); // math 7, science 6 — no history
    await useProfileStore.getState().addXp(5);
    await vi.waitFor(() => expect(useProfileStore.getState().unread).toBeNull());
    const p = useProfileStore.getState().profile!;
    expect(p.skillLevels).toEqual({ math: 8, science: 6, history: 6 });
    // History's made-up start was its real start; Math's (years ago) isn't noted.
    expect(p.skillStarts).toEqual({ history: { level: 5, age: 10 } });
    expect(useSaveStore.getState().save?.topicStarts).toEqual({ history: { level: 5, age: 10 } });
    await vi.waitFor(() => expect(updates()).toHaveLength(1));
    expect(updates()[0]).toMatchObject({ skill_levels: { math: 8, science: 6, history: 6 }, skill_starts: { history: { level: 5, age: 10 } } });
  });

  it("today's XP and answers are noted while unread; the level only once the row is read (#169, #173)", async () => {
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    await useProfileStore.getState().addXp(30); // real XP, whatever the profile
    useProfileStore.getState().noteAnswer({ id: 'bank-q', topic: 'math', level: 5 }, true);
    await useProfileStore.getState().setSkillLevel('math', 6); // up 1 from the made-up 5
    expect(playDayRecords('kid-1')).toEqual([{ day: TODAY, xp: 30, minutes: 0, topics: { math: { a: 1, r: 1 } } }]);
    later();
    reads.push({ data: ROW, error: null });
    await useProfileStore.getState().retryRead();
    expect(useProfileStore.getState().profile?.skillLevels.math).toBe(8);
    // Math's level today is the real one, 7 + 1.
    expect(playDayRecords('kid-1')[0].topics).toEqual({ math: { a: 1, r: 1, l: 8 } });
    useProfileStore.getState().noteAnswer({ id: 'bank-q2', topic: 'science', level: 6 }, false);
    expect(playDayRecords('kid-1')[0].topics.science).toEqual({ a: 1, r: 0, l: 6 });
  });
});

describe('a read that never answers is called off (#184)', () => {
  const timers = () => vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  const hang = () => new Promise<Answer>(() => {}); // a captive portal, a half-open connection: no answer, ever

  it('a retry that hangs ends after 10 s as a failed read, and the next one runs on its back-off', async () => {
    timers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    reads.push(hang());
    await vi.advanceTimersByTimeAsync(RETRY_READ_MS);
    expect(reads).toEqual([]); // asked — and no answer comes
    reads.push({ data: ROW, error: null });
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1);
    expect(useProfileStore.getState().remoteError).toBe('Failed to fetch'); // still out
    await vi.advanceTimersByTimeAsync(1);
    // Called off: a failed read like any other — still unread, nothing written.
    expect(useProfileStore.getState().remoteError).toMatch(/^AbortError/);
    expect(useProfileStore.getState().unread).not.toBeNull();
    expect(READ_TIMEOUT_MS).toBe(10_000);
    // The next read twice the first wait later, as after any failed read — and it's taken up.
    await vi.advanceTimersByTimeAsync(2 * RETRY_READ_MS - 1);
    expect(reads).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(useProfileStore.getState().unread).toBeNull());
    expect(useProfileStore.getState().profile).toMatchObject({ xp: 5000, skillLevels: { math: 7, science: 6 } });
    expect(updates()).toHaveLength(1);
  });

  it('a first read that hangs ends too: play starts on the copy, unread, and the row is asked for again', async () => {
    timers();
    localStorage.setItem(profileKey('kid-1'), JSON.stringify(cached()));
    reads.push(hang());
    const loading = useProfileStore.getState().loadProfile('kid-1', birth);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
    await loading;
    expect(useProfileStore.getState()).toMatchObject({ loading: false, profile: { xp: 5000 }, unread: { xp: 0 } });
    reads.push({ data: ROW, error: null });
    await vi.advanceTimersByTimeAsync(RETRY_READ_MS);
    expect(useProfileStore.getState().unread).toBeNull();
  });

  it('a read that answers in time leaves no timer behind', async () => {
    timers();
    reads.push({ data: ROW, error: null });
    await useProfileStore.getState().loadProfile('kid-1', birth);
    await vi.advanceTimersByTimeAsync(0); // jsdom's storage event, from writing the copy
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('levels played unread survive a reload on a device with its own copy (#180)', () => {
  /** A reload: the game put away, and the kid loaded again from what this device keeps. */
  const reload = async (answer: Answer) => {
    useProfileStore.getState().clearProfile();
    reads.push(answer);
    await useProfileStore.getState().loadProfile('kid-1', birth);
  };

  it('a step down (and one up) played unread go on from the row once it\'s read after the reload — never lost to "the higher wins"', async () => {
    localStorage.setItem(profileKey('kid-1'), JSON.stringify(cached()));
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    await useProfileStore.getState().setSkillLevel('math', 6); // down 1 from the copy's 7
    await useProfileStore.getState().setSkillLevel('science', 8); // up 2 from 6
    // Kept beside the copy, which holds the levels played to.
    expect(readUnreadSteps('kid-1')).toEqual({ steps: { math: -1, science: 2 }, starts: {} });
    expect(JSON.parse(localStorage.getItem(profileKey('kid-1'))!).skillLevels).toEqual({ math: 6, science: 8 });
    await reload({ data: ROW, error: null }); // the row: math 7, science 6
    // Math 7 − 1 (the copy alone, merged by the higher, made it 7 again); science 6 + 2, not counted twice.
    expect(useProfileStore.getState().profile?.skillLevels).toEqual({ math: 6, science: 8 });
    expect(useProfileStore.getState().unread).toBeNull();
    await vi.waitFor(() => expect(updates()).toHaveLength(1));
    expect(updates()[0]).toMatchObject({ skill_levels: { math: 6, science: 8 }, xp: 5000 });
    // Read: the steps are done, and a later load doesn't take them again.
    expect(readUnreadSteps('kid-1')).toBeNull();
    await reload({ data: { ...ROW, skill_levels: { math: 6, science: 8 } }, error: null });
    expect(useProfileStore.getState().profile?.skillLevels).toEqual({ math: 6, science: 8 });
  });

  it('a row moved on another device meanwhile: each step goes on from its level, kept within 1–10', async () => {
    localStorage.setItem(profileKey('kid-1'), JSON.stringify(cached({ skillLevels: { math: 2, science: 6 } })));
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    await useProfileStore.getState().setSkillLevel('math', 1); // down 1
    await useProfileStore.getState().setSkillLevel('science', 7); // up 1
    await reload({ data: { ...ROW, skill_levels: { math: 1, science: 10 } }, error: null });
    expect(useProfileStore.getState().profile?.skillLevels).toEqual({ math: 1, science: 10 });
  });

  it('a reload whose read fails again keeps playing at the levels played to, and the steps still go on once read', async () => {
    localStorage.setItem(profileKey('kid-1'), JSON.stringify(cached()));
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    await useProfileStore.getState().setSkillLevel('math', 6);
    await reload(FAILED);
    expect(useProfileStore.getState().profile?.skillLevels).toEqual({ math: 6, science: 6 });
    expect(useProfileStore.getState().unread).toMatchObject({ steps: { math: -1 }, base: { skillLevels: { math: 7, science: 6 } } });
    await useProfileStore.getState().setSkillLevel('math', 5); // another step down after the reload
    expect(readUnreadSteps('kid-1')?.steps).toEqual({ math: -2 });
    later();
    reads.push({ data: ROW, error: null });
    await useProfileStore.getState().retryRead();
    expect(useProfileStore.getState().profile?.skillLevels).toEqual({ math: 5, science: 6 });
    expect(readUnreadSteps('kid-1')).toBeNull();
  });

  it('a topic first played unread keeps its level and start across the reload when the row has none — and steps from the row\'s when it has', async () => {
    localStorage.setItem(profileKey('kid-1'), JSON.stringify(cached()));
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    await useProfileStore.getState().setSkillLevel('history', 6); // from 5, the start for 10
    await useProfileStore.getState().setSkillLevel('words', 4); // from 5: down 1
    expect(readUnreadSteps('kid-1')).toEqual({ steps: { history: 1, words: -1 }, starts: { history: { level: 5, age: 10 }, words: { level: 5, age: 10 } } });
    await reload({ data: { ...ROW, skill_levels: { math: 7, science: 6, words: 3 } }, error: null });
    const p = useProfileStore.getState().profile!;
    // History: the row has none — the level played to, and its start noted. Words: the row's 3, down 1.
    expect(p.skillLevels).toEqual({ math: 7, science: 6, history: 6, words: 2 });
    expect(p.skillStarts).toEqual({ history: { level: 5, age: 10 } });
    expect(useSaveStore.getState().save?.topicStarts).toEqual({ history: { level: 5, age: 10 } });
  });

  it('nothing is kept without a copy of its own (a made-up start), nor once the row is read', async () => {
    reads.push(FAILED);
    await useProfileStore.getState().loadProfile('kid-1', birth);
    await useProfileStore.getState().setSkillLevel('math', 4);
    expect(readUnreadSteps('kid-1')).toBeNull();
    // Steps left without their copy (it was cleared) mean nothing: a read clears them.
    writeUnreadSteps('kid-1', { steps: { math: -1 }, starts: {} });
    reads.length = 0;
    reads.push({ data: ROW, error: null });
    await useProfileStore.getState().loadProfile('kid-1', birth);
    expect(useProfileStore.getState().profile?.skillLevels).toEqual({ math: 7, science: 6 });
    expect(readUnreadSteps('kid-1')).toBeNull();
    await useProfileStore.getState().setSkillLevel('math', 6);
    expect(readUnreadSteps('kid-1')).toBeNull();
  });
});
