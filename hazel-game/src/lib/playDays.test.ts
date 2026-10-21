import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ supabase: { rpc } }));

// The back-off is per session (module state), so every test gets a fresh module.
let mod: typeof import('./playDays');
beforeEach(async () => {
  localStorage.clear();
  rpc.mockReset();
  vi.restoreAllMocks();
  vi.resetModules();
  mod = await import('./playDays');
});
afterEach(() => {
  vi.useRealTimers();
});

const offline = () => new TypeError('Failed to fetch');

describe('noting the days a kid played (#29, migration 0025)', () => {
  it('a day is sent to note_play_days and leaves the device once the database has it', async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    await mod.notePlayDay('kid-1', '2026-10-21');
    expect(rpc).toHaveBeenCalledWith('note_play_days', { p_kid: 'kid-1', p_days: ['2026-10-21'] });
    expect(mod.pendingPlayDays('kid-1')).toEqual([]);
    expect(localStorage.getItem(mod.playDaysKey('kid-1'))).toBeNull();
  });

  it('offline: the day stays on the device and goes with the next one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockRejectedValueOnce(offline());
    await mod.notePlayDay('kid-1', '2026-10-20');
    expect(mod.pendingPlayDays('kid-1')).toEqual(['2026-10-20']);
    expect(warn.mock.calls[0].join(' ')).toContain('Failed to fetch');
    rpc.mockResolvedValue({ data: 2, error: null });
    await mod.notePlayDay('kid-1', '2026-10-21');
    expect(rpc).toHaveBeenLastCalledWith('note_play_days', { p_kid: 'kid-1', p_days: ['2026-10-20', '2026-10-21'] });
    expect(mod.pendingPlayDays('kid-1')).toEqual([]);
  });

  it('before migration 0025 (no such function): kept, said once, and nothing more is sent this session (review round 1)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.note_play_days' } });
    await mod.notePlayDay('kid-1', '2026-10-20');
    // Every round's end, a new day, a profile load, another kid: no more 404s.
    for (let i = 0; i < 5; i++) await mod.flushPlayDays('kid-1');
    await mod.flushPlayDays('kid-1', { now: true });
    await mod.notePlayDay('kid-1', '2026-10-21');
    await mod.notePlayDay('kid-2', '2026-10-21');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mod.pendingPlayDays('kid-1')).toEqual(['2026-10-20', '2026-10-21']);
    expect(mod.pendingPlayDays('kid-2')).toEqual(['2026-10-21']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('offline, a round’s end waits RETRY_OFFLINE_MS before trying again, and coming back online tries at once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T10:00:00'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockRejectedValue(offline());
    await mod.notePlayDay('kid-1', '2026-10-21');
    expect(rpc).toHaveBeenCalledTimes(1);
    // Round after round, battle after battle: nothing sent, nothing said.
    for (let i = 0; i < 10; i++) await mod.flushPlayDays('kid-1');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(Date.now() + mod.RETRY_OFFLINE_MS + 1));
    await mod.flushPlayDays('kid-1');
    expect(rpc).toHaveBeenCalledTimes(2);
    // Back online: sent straight away, back-off or not.
    rpc.mockResolvedValue({ data: 1, error: null });
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(mod.pendingPlayDays('kid-1')).toEqual([]));
  });

  it('any other refusal (a sign-in that ran out, the server down): tried again on the next new day or profile load, never every round', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } });
    await mod.notePlayDay('kid-1', '2026-10-20');
    for (let i = 0; i < 10; i++) await mod.flushPlayDays('kid-1');
    expect(rpc).toHaveBeenCalledTimes(1);
    // Coming back online doesn't help a refusal.
    window.dispatchEvent(new Event('online'));
    await mod.flushPlayDays('kid-1');
    expect(rpc).toHaveBeenCalledTimes(1);
    // A profile load (or the next new day) tries again.
    rpc.mockResolvedValue({ data: 1, error: null });
    await mod.flushPlayDays('kid-1', { now: true });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(mod.pendingPlayDays('kid-1')).toEqual([]);
  });

  it('storage that can’t be written: the day is still sent, from memory (review round 1)', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockRejectedValueOnce(offline());
    await mod.notePlayDay('kid-1', '2026-10-20');
    expect(rpc).toHaveBeenCalledWith('note_play_days', { p_kid: 'kid-1', p_days: ['2026-10-20'] });
    // Kept in memory for the session, and goes with the next day.
    expect(mod.pendingPlayDays('kid-1')).toEqual(['2026-10-20']);
    rpc.mockResolvedValue({ data: 2, error: null });
    await mod.notePlayDay('kid-1', '2026-10-21');
    expect(rpc).toHaveBeenLastCalledWith('note_play_days', { p_kid: 'kid-1', p_days: ['2026-10-20', '2026-10-21'] });
    expect(mod.pendingPlayDays('kid-1')).toEqual([]);
  });

  it('a kid no longer this family’s: their days are dropped, never retried for ever', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not your player' } });
    await mod.notePlayDay('kid-gone', '2026-10-21');
    expect(mod.pendingPlayDays('kid-gone')).toEqual([]);
  });

  it('each day once, oldest first, at most a week and a day kept; a junk day is ignored', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '503', message: 'down' } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let d = 10; d <= 21; d++) await mod.notePlayDay('kid-1', `2026-10-${d}`);
    await mod.notePlayDay('kid-1', '2026-10-21');
    await mod.notePlayDay('kid-1', 'yesterday');
    expect(mod.pendingPlayDays('kid-1')).toHaveLength(mod.PENDING_MAX);
    expect(mod.pendingPlayDays('kid-1')[0]).toBe('2026-10-14');
    expect(mod.pendingPlayDays('kid-1').at(-1)).toBe('2026-10-21');
  });

  it('one send at a time per kid; a day noted mid-send waits for the next', async () => {
    let finish: (v: unknown) => void = () => {};
    rpc.mockImplementationOnce(() => new Promise((r) => (finish = r))).mockResolvedValue({ data: 1, error: null });
    const first = mod.notePlayDay('kid-1', '2026-10-20');
    const second = mod.notePlayDay('kid-1', '2026-10-21');
    expect(rpc).toHaveBeenCalledTimes(1);
    finish({ data: 1, error: null });
    await Promise.all([first, second]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toEqual({ p_kid: 'kid-1', p_days: ['2026-10-21'] });
    expect(mod.pendingPlayDays('kid-1')).toEqual([]);
  });

  it('nothing waiting: no call; never throws, even with no network module; forgetting clears', async () => {
    await mod.flushPlayDays('kid-1');
    expect(rpc).not.toHaveBeenCalled();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockImplementation(() => {
      throw new TypeError('supabase.rpc is not a function');
    });
    await expect(mod.notePlayDay('kid-1', '2026-10-21')).resolves.toBeUndefined();
    expect(mod.pendingPlayDays('kid-1')).toEqual(['2026-10-21']);
    mod.forgetPlayDays('kid-1');
    expect(mod.pendingPlayDays('kid-1')).toEqual([]);
    localStorage.setItem(mod.playDaysKey('kid-2'), '{not json');
    expect(mod.pendingPlayDays('kid-2')).toEqual([]);
  });
});
