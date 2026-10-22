import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Two tabs of one kid on one device (#180 review): each tab is its own copy of the store (a fresh module), sharing
// this device's storage and the server's row. Each read answers with the next queued result; every write is kept.
type Answer = { data: unknown; error: unknown };
const reads = vi.hoisted(() => [] as (Answer | Promise<Answer>)[]);
const writes = vi.hoisted(() => [] as { kind: string; row: Record<string, unknown> }[]);
vi.mock('../lib/supabase', () => {
  const from = () => {
    let answer: Answer | Promise<Answer> = { data: null, error: null };
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.abortSignal = () => chain;
    chain.maybeSingle = () => {
      answer = reads.shift() ?? { data: null, error: { message: 'no answer queued' } };
      return chain;
    };
    chain.update = (row: Record<string, unknown>) => {
      writes.push({ kind: 'update', row });
      answer = { data: null, error: null };
      return chain;
    };
    chain.upsert = (row: Record<string, unknown>) => {
      writes.push({ kind: 'upsert', row });
      answer = { data: null, error: null };
      return chain;
    };
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(answer).then(res);
    return chain;
  };
  return { supabase: { rpc: vi.fn(async () => ({ data: 1, error: null })), from } };
});

const YEAR = new Date().getFullYear();
const FAILED: Answer = { data: null, error: { message: 'Failed to fetch' } };
const birth = { birthYear: YEAR - 10, birthMonth: 1 };
const row = (math: number, science = 6) => ({
  data: {
    id: 'kid-1', birth_year: YEAR - 10, birth_month: 1, skill_levels: { math, science }, xp: 5000, level: 12, level_xp: 40,
    power_ups: {}, current_streak: 0, longest_streak: 0, last_played_on: null,
  },
  error: null,
});
const copy = { id: 'kid-1', birthYear: YEAR - 10, birthMonth: 1, skillLevels: { math: 7, science: 6 }, xp: 5000, level: 12, levelXp: 40, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null };
/** The math level each whole-row write sent, in order. */
const mathWritten = () => writes.map((w) => (w.row.skill_levels as { math: number } | undefined)?.math);

/** A tab of the kid, opened now: loaded from what this device keeps, its row read failing. */
async function tab(read: Answer = FAILED) {
  vi.resetModules();
  const { useProfileStore } = await import('./profileStore');
  const { useSaveStore } = await import('./saveStore');
  const { defaultSave } = await import('../lib/save');
  useSaveStore.setState({ userId: 'kid-1', save: { ...defaultSave(), revision: 10 }, status: 'ready' });
  reads.push(read);
  await useProfileStore.getState().loadProfile('kid-1', birth);
  return useProfileStore;
}
type Tab = Awaited<ReturnType<typeof tab>>;
const math = (t: Tab) => t.getState().profile?.skillLevels.math;
const readNow = async (t: Tab, answer: Answer) => {
  reads.push(answer);
  await t.getState().retryRead({ now: true });
  await vi.waitFor(() => expect(t.getState().unread).toBeNull());
};

beforeEach(async () => {
  localStorage.clear();
  reads.length = 0;
  writes.length = 0;
  const { profileKey } = await import('../lib/profile');
  localStorage.setItem(profileKey('kid-1'), JSON.stringify(copy));
});

describe('two tabs of one kid put each step on once — without the Web Locks API (#180 review)', () => {
  it("an up-step kept beside the copy: the tab that reads the row first puts it on, the other finds it gone", async () => {
    const A = await tab();
    await A.getState().setSkillLevel('math', 8); // +1, kept beside the copy
    const B = await tab(); // loads while it's unread: it holds the step too
    expect(B.getState().unread?.steps).toEqual({ math: 1 });
    await readNow(A, row(7));
    expect(math(A)).toBe(8);
    await readNow(B, row(8)); // the row A wrote
    expect(math(B)).toBe(8); // not 9
    expect(mathWritten()).toEqual([8, 8]);
  });

  it('a step down: the other tab keeps it, though its own copy stood higher', async () => {
    const A = await tab();
    await A.getState().setSkillLevel('math', 6); // −1
    const B = await tab();
    await readNow(A, row(7));
    await readNow(B, row(6));
    expect([math(A), math(B)]).toEqual([6, 6]);
    expect(mathWritten()).toEqual([6, 6]);
  });

  it('both read the row at once (back online in both): the second never writes back the level from before the first one\'s write', async () => {
    for (const [to, want] of [
      [8, 8],
      [6, 6],
    ] as const) {
      localStorage.removeItem('hazel-profile-steps-kid-1');
      writes.length = 0;
      const A = await tab();
      await A.getState().setSkillLevel('math', to);
      const B = await tab();
      reads.push(row(7), row(7)); // both read before either wrote
      await Promise.all([A.getState().retryRead({ now: true }), B.getState().retryRead({ now: true })]);
      await vi.waitFor(() => expect(B.getState().unread).toBeNull());
      expect([math(A), math(B)]).toEqual([want, want]);
      expect(mathWritten()).toEqual([want, want]);
      const { profileKey } = await import('../lib/profile');
      localStorage.setItem(profileKey('kid-1'), JSON.stringify(copy));
    }
  });

  it("each tab's steps add up beside the copy, and one take-up puts them all on", async () => {
    const A = await tab();
    const B = await tab();
    await A.getState().setSkillLevel('math', 8); // +1 in A
    await B.getState().setSkillLevel('science', 8); // +2 in B
    const { readUnreadSteps } = await import('../lib/profile');
    expect(readUnreadSteps('kid-1')?.steps).toEqual({ math: 1, science: 2 });
    await readNow(B, row(7, 6));
    expect(B.getState().profile?.skillLevels).toEqual({ math: 8, science: 8 });
    expect(readUnreadSteps('kid-1')).toBeNull();
    await readNow(A, row(8, 8));
    expect(A.getState().profile?.skillLevels).toEqual({ math: 8, science: 8 });
    expect(writes.map((w) => w.row.skill_levels)).toEqual([{ math: 8, science: 8 }, { math: 8, science: 8 }]);
  });

  it("XP earned in both tabs goes on once, all of it", async () => {
    const A = await tab();
    const B = await tab();
    await A.getState().addXp(20);
    await B.getState().addXp(10);
    await readNow(A, row(7));
    expect(A.getState().profile?.xp).toBe(5030);
    await readNow(B, { data: { ...row(7).data, xp: 5030 }, error: null }); // the row A wrote
    expect(B.getState().profile?.xp).toBe(5030); // not 5040
    expect(writes.map((w) => w.row.xp)).toEqual([5030, 5030]);
  });

  it("a tab whose load reads the row takes the other tab's kept steps — and that tab, read later, keeps them", async () => {
    const A = await tab();
    await A.getState().setSkillLevel('math', 6); // −1
    const B = await tab(row(7)); // its read goes through: it takes A's step
    expect(math(B)).toBe(6);
    await readNow(A, row(6));
    expect(math(A)).toBe(6); // not "the higher" 7 from A's own copy
    expect(mathWritten()).toEqual([6, 6]);
  });
});

describe('…and with the Web Locks API (#180 review)', () => {
  type Grant = (lock: unknown) => unknown;
  let requests: string[] = [];
  /** A browser's lock manager: one holder per name at a time, the rest queued in order. */
  const install = (refuse = false) => {
    const tails = new Map<string, Promise<unknown>>();
    requests = [];
    const locks = {
      request: (name: string, grant: Grant) => {
        requests.push(name);
        if (refuse) return Promise.reject(new DOMException('The request is not allowed', 'SecurityError'));
        const run = (tails.get(name) ?? Promise.resolve()).then(() => grant({ name, mode: 'exclusive' }));
        tails.set(name, run.catch(() => {}));
        return run;
      },
    };
    Object.defineProperty(navigator, 'locks', { configurable: true, value: locks });
  };
  afterEach(() => {
    delete (navigator as { locks?: unknown }).locks;
  });

  it("the take-up holds the kid's lock: two tabs reading at once take the steps one after the other, and the step goes on once", async () => {
    install();
    const A = await tab();
    await A.getState().setSkillLevel('math', 8);
    const B = await tab();
    reads.push(row(7), row(7));
    await Promise.all([A.getState().retryRead({ now: true }), B.getState().retryRead({ now: true })]);
    await vi.waitFor(() => expect(B.getState().unread).toBeNull());
    expect(requests).toEqual(['hazel-profile-steps-kid-1', 'hazel-profile-steps-kid-1']);
    expect([math(A), math(B)]).toEqual([8, 8]);
    expect(mathWritten()).toEqual([8, 8]);
  });

  it('a lock the browser refuses (an insecure page): the take-up still runs, once', async () => {
    install(true);
    const A = await tab();
    await A.getState().setSkillLevel('math', 6);
    await readNow(A, row(7));
    expect(requests).toHaveLength(1);
    expect(math(A)).toBe(6);
    expect(mathWritten()).toEqual([6]);
  });
});
