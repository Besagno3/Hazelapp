import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ supabase: { rpc } }));

const { PENDING_MAX, flushPlayDays, forgetPlayDays, notePlayDay, pendingPlayDays, playDaysKey } = await import('./playDays');

beforeEach(() => {
  localStorage.clear();
  rpc.mockReset();
  vi.restoreAllMocks();
});

describe('noting the days a kid played (#29, migration 0025)', () => {
  it('a day is sent to note_play_days and leaves the device once the database has it', async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    await notePlayDay('kid-1', '2026-10-21');
    expect(rpc).toHaveBeenCalledWith('note_play_days', { p_kid: 'kid-1', p_days: ['2026-10-21'] });
    expect(pendingPlayDays('kid-1')).toEqual([]);
    expect(localStorage.getItem(playDaysKey('kid-1'))).toBeNull();
  });

  it('offline: the day stays on the device and goes with the next one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await notePlayDay('kid-1', '2026-10-20');
    expect(pendingPlayDays('kid-1')).toEqual(['2026-10-20']);
    expect(warn.mock.calls[0].join(' ')).toContain('Failed to fetch');
    rpc.mockResolvedValue({ data: 2, error: null });
    await notePlayDay('kid-1', '2026-10-21');
    expect(rpc).toHaveBeenLastCalledWith('note_play_days', { p_kid: 'kid-1', p_days: ['2026-10-20', '2026-10-21'] });
    expect(pendingPlayDays('kid-1')).toEqual([]);
  });

  it('before migration 0025 (no such function): kept, and said once a session', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.note_play_days' } });
    await notePlayDay('kid-1', '2026-10-20');
    await notePlayDay('kid-1', '2026-10-21');
    expect(pendingPlayDays('kid-1')).toEqual(['2026-10-20', '2026-10-21']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a kid no longer this family’s: their days are dropped, never retried for ever', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not your player' } });
    await notePlayDay('kid-gone', '2026-10-21');
    expect(pendingPlayDays('kid-gone')).toEqual([]);
  });

  it('each day once, oldest first, at most a week and a day kept; a junk day is ignored', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '503', message: 'down' } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let d = 10; d <= 21; d++) await notePlayDay('kid-1', `2026-10-${d}`);
    await notePlayDay('kid-1', '2026-10-21');
    await notePlayDay('kid-1', 'yesterday');
    expect(pendingPlayDays('kid-1')).toHaveLength(PENDING_MAX);
    expect(pendingPlayDays('kid-1')[0]).toBe('2026-10-14');
    expect(pendingPlayDays('kid-1').at(-1)).toBe('2026-10-21');
  });

  it('one send at a time per kid; a day noted mid-send waits for the next', async () => {
    let finish: (v: unknown) => void = () => {};
    rpc.mockImplementationOnce(() => new Promise((r) => (finish = r))).mockResolvedValue({ data: 1, error: null });
    const first = notePlayDay('kid-1', '2026-10-20');
    const second = notePlayDay('kid-1', '2026-10-21');
    expect(rpc).toHaveBeenCalledTimes(1);
    finish({ data: 1, error: null });
    await Promise.all([first, second]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toEqual({ p_kid: 'kid-1', p_days: ['2026-10-21'] });
    expect(pendingPlayDays('kid-1')).toEqual([]);
  });

  it('nothing waiting: no call; never throws, even with no network module; forgetting clears', async () => {
    await flushPlayDays('kid-1');
    expect(rpc).not.toHaveBeenCalled();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockImplementation(() => {
      throw new TypeError('supabase.rpc is not a function');
    });
    await expect(notePlayDay('kid-1', '2026-10-21')).resolves.toBeUndefined();
    expect(pendingPlayDays('kid-1')).toEqual(['2026-10-21']);
    forgetPlayDays('kid-1');
    expect(pendingPlayDays('kid-1')).toEqual([]);
    localStorage.setItem(playDaysKey('kid-2'), '{not json');
    expect(pendingPlayDays('kid-2')).toEqual([]);
  });
});
