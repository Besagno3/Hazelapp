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

const { useProfileStore } = await import('./profileStore');
const { todayIso, isoOffset } = await import('../lib/streak');
const { pendingPlayDays } = await import('../lib/playDays');

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
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 1, error: null });
});

describe('a new day played is noted for 📈 Progress (#29)', () => {
  it('the first round of a day notes it', async () => {
    useProfileStore.setState({ profile: kid(isoOffset(todayIso(), -1)) });
    await useProfileStore.getState().recordActivity();
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('note_play_days', { p_kid: 'kid-1', p_days: [todayIso()] }));
    expect(useProfileStore.getState().profile?.currentStreak).toBe(3);
  });

  it('any XP earned counts the day — a typing lesson, the Library, a shrine — once, with the streak (review round 1)', async () => {
    useProfileStore.setState({ profile: kid(isoOffset(todayIso(), -1)) });
    await useProfileStore.getState().addXp(30);
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('note_play_days', { p_kid: 'kid-1', p_days: [todayIso()] }));
    const p = useProfileStore.getState().profile;
    expect(p).toMatchObject({ xp: 30, lastPlayedOn: todayIso(), currentStreak: 3 });
    // More XP that day, or a round's end after it: the day isn't noted again.
    await useProfileStore.getState().addXp(10);
    await useProfileStore.getState().recordActivity();
    await new Promise((r) => setTimeout(r, 0));
    expect(rpc).toHaveBeenCalledTimes(1);
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
});
