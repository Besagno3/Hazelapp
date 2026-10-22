import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Profile } from '../types';

// The profile write and the play-day note (#29): a chain that always succeeds.
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => {
  const ok = { data: null, error: null };
  const chain: Record<string, unknown> = {};
  for (const m of ['update', 'eq', 'select', 'upsert', 'maybeSingle']) chain[m] = () => chain;
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve(ok).then(res);
  return { supabase: { rpc, from: () => chain } };
});

const { dayPlayed, useProfileStore } = await import('./profileStore');
const { todayIso, isoOffset } = await import('../lib/streak');
const { addDayMinute, flushPlayDays, forgetPlayDays, notePlayDay, pendingPlayDays, playDayRecords, SEND_EVERY_MS } = await import('../lib/playDays');

const kid = (lastPlayedOn: string | null): Profile => ({
  id: 'kid-1',
  birthYear: 2017,
  birthMonth: 3,
  skillLevels: {},
  xp: 0,
  level: 1,
  levelXp: 0,
  powerUps: {},
  currentStreak: 2,
  longestStreak: 2,
  lastPlayedOn,
});

beforeEach(() => {
  localStorage.clear();
  forgetPlayDays('kid-1'); // the wait between sends is per session; each test starts afresh
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 1, error: null });
});

const day = (over: Record<string, unknown> = {}) => ({ day: todayIso(), xp: 0, minutes: 0, topics: {}, ...over });

describe('a new day played is noted for 📈 Progress (#29)', () => {
  it('the first round of a day notes it', async () => {
    useProfileStore.setState({ profile: kid(isoOffset(todayIso(), -1)) });
    await useProfileStore.getState().recordActivity();
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('note_play_history', { p_kid: 'kid-1', p_days: [day()] }));
    expect(useProfileStore.getState().profile?.currentStreak).toBe(3);
  });

  it('any XP earned counts the day — a typing lesson, the Library, a shrine — once, with the streak (review round 1)', async () => {
    useProfileStore.setState({ profile: kid(isoOffset(todayIso(), -1)) });
    await useProfileStore.getState().addXp(30);
    // The day goes up with its XP (#169).
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('note_play_history', { p_kid: 'kid-1', p_days: [day({ xp: 30 })] }));
    const p = useProfileStore.getState().profile;
    expect(p).toMatchObject({ xp: 30, lastPlayedOn: todayIso(), currentStreak: 3 });
    // More XP that day, or a round's end after it: the day isn't noted again —
    // its XP grows on the device and goes within a couple of minutes, not at once.
    await useProfileStore.getState().addXp(10);
    await useProfileStore.getState().recordActivity();
    await new Promise((r) => setTimeout(r, 0));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(playDayRecords('kid-1')).toEqual([day({ xp: 40 })]);
    expect(useProfileStore.getState().profile?.currentStreak).toBe(3);
  });

  it('no XP (a starter question, nothing earned) is not a day played on its own', async () => {
    useProfileStore.setState({ profile: kid(isoOffset(todayIso(), -1)) });
    await useProfileStore.getState().addXp(0);
    expect(rpc).not.toHaveBeenCalled();
    expect(useProfileStore.getState().profile?.lastPlayedOn).toBe(isoOffset(todayIso(), -1));
  });

  it('later rounds that day note nothing more — but a day still waiting on the device goes up', async () => {
    useProfileStore.setState({ profile: kid(todayIso()) });
    await useProfileStore.getState().recordActivity();
    expect(rpc).not.toHaveBeenCalled();
    localStorage.setItem('hazel-play-days-kid-1', JSON.stringify([isoOffset(todayIso(), -2)]));
    await useProfileStore.getState().recordActivity();
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(pendingPlayDays('kid-1')).toEqual([]));
  });

  it("today already played on another device: this device's XP, minutes and answers for it are sent too — on the usual wait (review round 1)", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // The row says they played today (the tablet, this morning); this browser has nothing of today yet.
      useProfileStore.setState({ profile: { ...kid(todayIso()), skillLevels: { math: 4 } }, unread: null });
      await useProfileStore.getState().addXp(120);
      await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('note_play_history', { p_kid: 'kid-1', p_days: [day({ xp: 120 })] }));
      // More play: it grows on the device and goes again after the usual wait — not one call per answer.
      await addDayMinute('kid-1', todayIso());
      useProfileStore.getState().noteAnswer({ id: 'bank-q-1', topic: 'math', level: 4 }, true);
      await useProfileStore.getState().recordActivity();
      expect(rpc).toHaveBeenCalledTimes(1);
      vi.setSystemTime(Date.now() + SEND_EVERY_MS + 1);
      await useProfileStore.getState().recordActivity();
      await vi.waitFor(() =>
        expect(rpc).toHaveBeenLastCalledWith('note_play_history', {
          p_kid: 'kid-1',
          p_days: [day({ xp: 120, minutes: 1, topics: { math: { a: 1, r: 1, l: 4 } } })],
        }),
      );
      expect(rpc).toHaveBeenCalledTimes(2);
      expect(useProfileStore.getState().profile?.currentStreak).toBe(2); // the streak never moved
    } finally {
      vi.useRealTimers();
    }
  });

  it("a profile load that says today was played sends this device's waiting play for today at once (review round 1)", async () => {
    // Only walked the world here today (minutes, no XP); the row read says another device played today.
    await addDayMinute('kid-1', todayIso());
    expect(pendingPlayDays('kid-1')).toEqual([]);
    const row = { id: 'kid-1', birth_year: 2017, birth_month: 3, skill_levels: {}, xp: 0, level: 1, level_xp: 0, power_ups: {}, current_streak: 1, longest_streak: 1, last_played_on: todayIso() };
    const { supabase } = await import('../lib/supabase');
    const chain = supabase.from('profiles') as unknown as Record<string, unknown>;
    const then = chain.then;
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: row, error: null }).then(res);
    try {
      await useProfileStore.getState().loadProfile('kid-1');
    } finally {
      chain.then = then;
    }
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('note_play_history', { p_kid: 'kid-1', p_days: [day({ minutes: 1 })] }));
  });

});

/** Load kid-1's profile from a row the database answers with. */
async function loadWith(row: Record<string, unknown>) {
  const { supabase } = await import('../lib/supabase');
  const chain = supabase.from('profiles') as unknown as Record<string, unknown>;
  const then = chain.then;
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: row, error: null }).then(res);
  try {
    await useProfileStore.getState().loadProfile('kid-1');
  } finally {
    chain.then = then;
  }
}
const rowFor = (last: string | null, streak = 1) => ({
  id: 'kid-1', birth_year: 2017, birth_month: 3, skill_levels: { math: 4 }, xp: 500, level: 3, level_xp: 0,
  power_ups: {}, current_streak: streak, longest_streak: streak, last_played_on: last,
});

describe('play on a day the profile already counts as played goes up whenever it is noted (review round 2)', () => {
  it('after a load that says today was played: wrong answers noted afterwards go — at once, and on a hidden tab after the wait', async () => {
    await loadWith(rowFor(todayIso())); // the tablet played this morning; nothing kept here yet
    rpc.mockClear();
    // On the laptop: two gate questions answered wrong (no XP, no round, no recordActivity).
    useProfileStore.getState().noteAnswer({ id: 'bank-q-1', topic: 'math', level: 4 }, false);
    await vi.waitFor(() =>
      expect(rpc).toHaveBeenLastCalledWith('note_play_history', { p_kid: 'kid-1', p_days: [day({ topics: { math: { a: 1, r: 0, l: 4 } } })] }),
    );
    useProfileStore.getState().noteAnswer({ id: 'bank-q-2', topic: 'math', level: 4 }, false);
    expect(rpc).toHaveBeenCalledTimes(1); // the usual wait
    await flushPlayDays('kid-1', { hidden: true }); // the tab is hidden
    expect(rpc).toHaveBeenLastCalledWith('note_play_history', { p_kid: 'kid-1', p_days: [day({ topics: { math: { a: 2, r: 0, l: 4 } } })] });
  });

  it("the next day: a load that says yesterday was played sends this device's kept record of yesterday", async () => {
    const y = isoOffset(todayIso(), -1);
    await addDayMinute('kid-1', y);
    await addDayMinute('kid-1', y);
    expect(pendingPlayDays('kid-1')).toEqual([]);
    await loadWith(rowFor(y));
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('note_play_history', { p_kid: 'kid-1', p_days: [day({ day: y, minutes: 2 })] }));
  });

  it('a past day inside the live streak is proved too; a day before the streak, or after the last day played, is not (#177)', async () => {
    const t = todayIso();
    for (const d of [isoOffset(t, -3), isoOffset(t, -2), t]) await addDayMinute('kid-1', d);
    // Last played yesterday on another device, a streak of 2: yesterday and the day before.
    await loadWith(rowFor(isoOffset(t, -1), 2));
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('note_play_history', { p_kid: 'kid-1', p_days: [day({ day: isoOffset(t, -2), minutes: 1 })] }));
    // The day before the streak, and today (nobody has played today yet — only walked here), stay unsent.
    expect(playDayRecords('kid-1').map((r) => r.day)).toEqual([isoOffset(t, -3), t]);
    expect(pendingPlayDays('kid-1')).toEqual([]);
  });

  it('dayPlayed: what the profile in play proves, for that kid only', () => {
    const t = todayIso();
    useProfileStore.setState({ profile: { ...kid(isoOffset(t, -1)), currentStreak: 3 } });
    expect([0, -1, -2, -3, -4].map((n) => dayPlayed('kid-1', isoOffset(t, n)))).toEqual([false, true, true, true, false]);
    expect(dayPlayed('kid-2', isoOffset(t, -1))).toBe(false);
    // A streak gone cold proves only its last day.
    useProfileStore.setState({ profile: { ...kid(isoOffset(t, -5)), currentStreak: 3 } });
    expect([-5, -6].map((n) => dayPlayed('kid-1', isoOffset(t, n)))).toEqual([true, false]);
    useProfileStore.setState({ profile: null });
    expect(dayPlayed('kid-1', t)).toBe(false);
  });

  it("a profile load asks for note_play_history again, though a send found it missing a moment ago (review round 2)", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockImplementation(async (fn: string) =>
      fn === 'note_play_history' ? { data: null, error: { code: 'PGRST202', message: 'no note_play_history' } } : { data: 1, error: null },
    );
    await notePlayDay('kid-1', isoOffset(todayIso(), -1)); // the day alone went to note_play_days; it waits for 0026
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['note_play_history', 'note_play_days']);
    // 0026 applied meanwhile; Switch player loads the kid again.
    rpc.mockReset();
    rpc.mockResolvedValue({ data: 1, error: null });
    await loadWith(rowFor(isoOffset(todayIso(), -1)));
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('note_play_history', expect.objectContaining({ p_kid: 'kid-1' })));
    vi.restoreAllMocks();
  });
});
