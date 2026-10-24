import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Profile } from '../types';

// The kid's `profiles` row, stood in for as the database keeps it (#190): a
// read answers with the row as it is now; an update filtered on its XP
// (`.eq('xp', n)`) changes nothing when the row's XP isn't n — and says so
// with no rows back — as postgrest does. Another device can write between
// this device's read and its update (`elsewhere`), and an update can fail.
type Row = Record<string, unknown> & { xp: number | null };
const db = vi.hoisted(() => ({
  row: null as Row | null,
  /** XP another device adds to the row just before this device's next update reaches it. */
  elsewhere: 0,
  /** Every update fails before it reaches the row. */
  fail: false,
  /** The next update never answers (and never reaches the row). */
  hang: false,
  /** The next XP update waits for this before it reaches the row. */
  hold: null as Promise<void> | null,
  reads: 0,
  /** The XP each update that reached the row left on it. */
  xpWrites: [] as number[],
}));
vi.mock('../lib/supabase', () => {
  const from = (table: string) => {
    let op: 'select' | 'update' | 'upsert' = 'select';
    let values: Record<string, unknown> = {};
    let returning = false;
    const filters: [string, unknown][] = [];
    const chain: Record<string, unknown> = {};
    chain.select = () => {
      if (op !== 'select') returning = true;
      return chain;
    };
    chain.update = (v: Record<string, unknown>) => ((op = 'update'), (values = v), chain);
    chain.upsert = (v: Record<string, unknown>) => ((op = 'upsert'), (values = v), chain);
    chain.eq = (col: string, val: unknown) => (filters.push([col, val]), chain);
    chain.is = (col: string, val: unknown) => (filters.push([col, val]), chain);
    chain.abortSignal = () => chain;
    chain.maybeSingle = () => chain;
    const run = async () => {
      if (table !== 'profiles') return { data: [], error: null };
      if (op === 'select') {
        db.reads += 1;
        return { data: db.row, error: null };
      }
      if (op === 'upsert') {
        if (!db.row) db.row = values as Row;
        return { data: null, error: null };
      }
      if (db.fail) return { data: null, error: { message: 'Failed to fetch' } };
      if (db.hang) {
        db.hang = false;
        return new Promise<never>(() => {});
      }
      if (db.hold && 'xp' in values) {
        const held = db.hold;
        db.hold = null;
        await held;
      }
      if (db.row && db.elsewhere && 'xp' in values) {
        db.row = { ...db.row, xp: (db.row.xp ?? 0) + db.elsewhere, level_xp: (db.row.level_xp as number) + db.elsewhere };
        db.elsewhere = 0;
      }
      const matches = !!db.row && filters.every(([col, val]) => col === 'id' || db.row![col] === val);
      if (matches) {
        db.row = { ...db.row!, ...values };
        if ('xp' in values) db.xpWrites.push(values.xp as number);
      }
      return { data: returning ? (matches ? [{ id: 'kid-1' }] : []) : null, error: null };
    };
    chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej);
    return chain;
  };
  return { supabase: { rpc: vi.fn(async () => ({ data: null, error: null })), from } };
});

const { useProfileStore } = await import('./profileStore');
const { WRITE_TIMEOUT_MS } = await import('../lib/kidXp');
const { todayIso, isoOffset } = await import('../lib/streak');
const { profileKey } = await import('../lib/profile');

const YEAR = new Date().getFullYear();
const TODAY = todayIso();
const ROW = {
  id: 'kid-1',
  birth_year: YEAR - 10,
  birth_month: 1,
  skill_levels: { math: 7 },
  xp: 5000,
  level: 12,
  level_xp: 40,
  power_ups: {},
  current_streak: 10,
  longest_streak: 10,
  last_played_on: isoOffset(TODAY, -1),
};
/** This device's copy, 100 XP ahead of the row (writes that failed before a reload). */
const AHEAD: Profile = {
  id: 'kid-1',
  birthYear: YEAR - 10,
  birthMonth: 1,
  skillLevels: { math: 7 },
  xp: 5100,
  level: 12,
  levelXp: 140,
  powerUps: {},
  currentStreak: 10,
  longestStreak: 10,
  lastPlayedOn: isoOffset(TODAY, -1),
};
const birth = { birthYear: YEAR - 10, birthMonth: 1 };
const load = () => useProfileStore.getState().loadProfile('kid-1', birth);
const addXp = (n: number) => useProfileStore.getState().addXp(n);

beforeEach(() => {
  localStorage.clear();
  db.row = { ...ROW };
  db.elsewhere = 0;
  db.fail = false;
  db.hang = false;
  db.hold = null;
  db.reads = 0;
  db.xpWrites = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  useProfileStore.getState().clearProfile();
});
afterEach(() => vi.useRealTimers());

describe("the kid's XP goes on top of the row, never over it (#190)", () => {
  it('added on top of the row as it was read: 5000 + 30, with no read but the load\'s', async () => {
    await load();
    await addXp(30);
    expect(db.xpWrites).toEqual([5030]);
    expect(db.row).toMatchObject({ xp: 5030, level: 12, level_xp: 70 });
    expect(db.reads).toBe(1);
  });

  it("XP given on another device meanwhile (a sibling's game) is read and added to, not written over", async () => {
    await load();
    db.elsewhere = 50; // Ada's device gives Mia 50 after Mia's game read her row
    await addXp(30);
    expect(db.row).toMatchObject({ xp: 5080, level: 12, level_xp: 120 });
    expect(useProfileStore.getState().remoteError).toBeNull();
  });

  it('two at once go one after the other, each onto the row the one before left', async () => {
    await load();
    await Promise.all([addXp(30), addXp(10)]);
    expect(db.xpWrites).toEqual([5030, 5040]);
    expect(db.reads).toBe(1);
  });

  it("XP that couldn't be written goes with the next write", async () => {
    await load();
    db.fail = true;
    await addXp(30);
    expect(useProfileStore.getState().remoteError).toBeTruthy();
    expect(db.row?.xp).toBe(5000);
    db.fail = false;
    await addXp(10);
    expect(db.row?.xp).toBe(5040);
  });

  it("after a reload, the copy that's ahead is taken up once — not again with the next write", async () => {
    await load();
    db.fail = true;
    await addXp(30); // this device's copy: 5030; the row: 5000
    db.fail = false;
    await load(); // "the higher wins": 5030 written up
    await addXp(10);
    expect(db.row?.xp).toBe(5040);
  });

  it("the load's own write lands first, and the next XP goes on top of it", async () => {
    localStorage.setItem(profileKey('kid-1'), JSON.stringify(AHEAD));
    await load(); // this device's copy is ahead: 5100 written up
    await addXp(10);
    expect(db.xpWrites).toEqual([5100, 5110]);
    expect(db.reads).toBe(1);
  });

  it('a reload while a write is still out: the write lands first, and nothing counts twice', async () => {
    await load();
    let release: () => void = () => {};
    db.hold = new Promise<void>((r) => (release = r));
    const out = addXp(30); // this device's copy: 5030 at once; the write still out
    setTimeout(release, 50); // …and it lands a moment after the reload starts
    await Promise.all([out, load()]);
    expect(db.row?.xp).toBe(5030);
    await addXp(10);
    expect(db.row?.xp).toBe(5040);
  });

  it("the load's own write hangs: the XP waits no longer than a write of its own would, then reads the row first", async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    localStorage.setItem(profileKey('kid-1'), JSON.stringify(AHEAD));
    db.hang = true; // the push of this device's copy (5100) never answers
    await load();
    let done = false;
    void addXp(10).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(done).toBe(true));
    // Not known after the hang: read first (5000, the push never reached it), then added on top.
    expect(db.reads).toBe(2);
    expect(db.row?.xp).toBe(5010);
  });
});
