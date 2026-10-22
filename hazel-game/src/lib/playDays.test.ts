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
  // Today is the 21st (the device's own calendar): the 14th is the oldest day the database still takes.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T10:00:00'));
  mod = await import('./playDays');
});
afterEach(() => {
  vi.useRealTimers();
});

const TODAY = '2026-10-21';
const offline = () => new TypeError('Failed to fetch');
const ok = { data: 1, error: null };
const noHistory = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.note_play_history' } };
const noDays = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.note_play_days' } };
const blank = (day: string) => ({ day, xp: 0, minutes: 0, topics: {} });
const later = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
/** What a call to note_play_history sent. */
const sentDays = (call = rpc.mock.calls.length - 1) => (rpc.mock.calls[call][1] as { p_days: unknown[] }).p_days;

describe('noting the days a kid played (#29, migration 0025)', () => {
  it('a past day is sent to note_play_history as a record and leaves the device once the database has it', async () => {
    rpc.mockResolvedValue(ok);
    await mod.notePlayDay('kid-1', '2026-10-20');
    expect(rpc).toHaveBeenCalledWith('note_play_history', { p_kid: 'kid-1', p_days: [blank('2026-10-20')] });
    expect(mod.pendingPlayDays('kid-1')).toEqual([]);
    expect(localStorage.getItem(mod.playDaysKey('kid-1'))).toBeNull();
  });

  it('offline: the day stays on the device and goes with the next one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockRejectedValueOnce(offline());
    await mod.notePlayDay('kid-1', '2026-10-20');
    expect(mod.pendingPlayDays('kid-1')).toEqual(['2026-10-20']);
    expect(warn.mock.calls[0].join(' ')).toContain('Failed to fetch');
    rpc.mockResolvedValue(ok);
    await mod.notePlayDay('kid-1', TODAY);
    expect(rpc).toHaveBeenLastCalledWith('note_play_history', { p_kid: 'kid-1', p_days: [blank('2026-10-20'), blank(TODAY)] });
    expect(mod.pendingPlayDays('kid-1')).toEqual([]);
  });

  it('before migration 0025 (neither function): kept, said once each, and nothing more is sent for a while (review round 1)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockImplementation(async (fn: string) => (fn === 'note_play_history' ? noHistory : noDays));
    await mod.notePlayDay('kid-1', '2026-10-20');
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['note_play_history', 'note_play_days']);
    // Every round's end, a new day, a profile load, another kid: no more 404s.
    for (let i = 0; i < 5; i++) await mod.flushPlayDays('kid-1');
    await mod.flushPlayDays('kid-1', { now: true });
    await mod.notePlayDay('kid-1', TODAY);
    await mod.notePlayDay('kid-2', TODAY);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(mod.pendingPlayDays('kid-1')).toEqual(['2026-10-20', TODAY]);
    expect(mod.pendingPlayDays('kid-2')).toEqual([TODAY]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('offline, a round’s end waits RETRY_OFFLINE_MS before trying again, and coming back online tries at once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockRejectedValue(offline());
    await mod.notePlayDay('kid-1', TODAY);
    expect(rpc).toHaveBeenCalledTimes(1);
    // Round after round, battle after battle: nothing sent, nothing said.
    for (let i = 0; i < 10; i++) await mod.flushPlayDays('kid-1');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    later(mod.RETRY_OFFLINE_MS + 1);
    await mod.flushPlayDays('kid-1');
    expect(rpc).toHaveBeenCalledTimes(2);
    // Back online: sent straight away, back-off or not.
    rpc.mockResolvedValue(ok);
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
    rpc.mockResolvedValue(ok);
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
    expect(rpc).toHaveBeenCalledWith('note_play_history', { p_kid: 'kid-1', p_days: [blank('2026-10-20')] });
    // Kept in memory for the session, and goes with the next day.
    expect(mod.pendingPlayDays('kid-1')).toEqual(['2026-10-20']);
    rpc.mockResolvedValue(ok);
    await mod.notePlayDay('kid-1', TODAY);
    expect(sentDays()).toEqual([blank('2026-10-20'), blank(TODAY)]);
    expect(mod.pendingPlayDays('kid-1')).toEqual([]);
  });

  it('a kid no longer this family’s: their days are dropped, never retried for ever', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not your player' } });
    await mod.notePlayDay('kid-gone', TODAY);
    expect(mod.pendingPlayDays('kid-gone')).toEqual([]);
    expect(mod.playDayRecords('kid-gone')).toEqual([]);
  });

  it('each day once, oldest first, a week back at most (what the database takes); a junk day is ignored', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '503', message: 'down' } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let d = 10; d <= 21; d++) await mod.notePlayDay('kid-1', `2026-10-${d}`);
    await mod.notePlayDay('kid-1', TODAY);
    await mod.notePlayDay('kid-1', 'yesterday');
    expect(mod.pendingPlayDays('kid-1')).toHaveLength(mod.PENDING_MAX);
    expect(mod.pendingPlayDays('kid-1')[0]).toBe('2026-10-14');
    expect(mod.pendingPlayDays('kid-1').at(-1)).toBe(TODAY);
  });

  it('kept for sending: from DAYS_BACK before today to DAYS_AHEAD after, the window 0026 takes (#182)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '503', message: 'down' } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { isoOffset } = await import('./streak');
    const [back, ahead] = [mod.DAYS_BACK, mod.DAYS_AHEAD];
    for (const n of [-(back + 1), -back, ahead, ahead + 1]) await mod.notePlayDay('kid-1', isoOffset(TODAY, n));
    expect(mod.pendingPlayDays('kid-1')).toEqual([isoOffset(TODAY, -back), isoOffset(TODAY, ahead)]);
  });

  it('one send at a time per kid; a day noted mid-send waits for the next', async () => {
    let finish: (v: unknown) => void = () => {};
    rpc.mockImplementationOnce(() => new Promise((r) => (finish = r))).mockResolvedValue(ok);
    const first = mod.notePlayDay('kid-1', '2026-10-20');
    const second = mod.notePlayDay('kid-1', TODAY);
    expect(rpc).toHaveBeenCalledTimes(1);
    finish(ok);
    await Promise.all([first, second]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toEqual({ p_kid: 'kid-1', p_days: [blank(TODAY)] });
    expect(mod.pendingPlayDays('kid-1')).toEqual([]);
  });

  it('nothing waiting: no call; never throws, even with no network module; forgetting clears', async () => {
    await mod.flushPlayDays('kid-1');
    expect(rpc).not.toHaveBeenCalled();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockImplementation(() => {
      throw new TypeError('supabase.rpc is not a function');
    });
    await expect(mod.notePlayDay('kid-1', TODAY)).resolves.toBeUndefined();
    expect(mod.pendingPlayDays('kid-1')).toEqual([TODAY]);
    mod.forgetPlayDays('kid-1');
    expect(mod.pendingPlayDays('kid-1')).toEqual([]);
    localStorage.setItem(mod.playDaysKey('kid-2'), '{not json');
    expect(mod.pendingPlayDays('kid-2')).toEqual([]);
  });
});

describe('the play on each day: XP, minutes, answers (#169, #172, #173; migration 0026)', () => {
  it('a device from before this build: its waiting days (bare dates, under the old key) are read as days played with nothing else, and sent', async () => {
    localStorage.setItem(mod.oldPlayDaysKey('kid-1'), JSON.stringify(['2026-10-19', 'junk', '2026-10-20']));
    expect(mod.playDayRecords('kid-1')).toEqual([blank('2026-10-19'), blank('2026-10-20')]);
    rpc.mockResolvedValue(ok);
    await mod.flushPlayDays('kid-1', { now: true });
    expect(sentDays()).toEqual([blank('2026-10-19'), blank('2026-10-20')]);
    expect(localStorage.getItem(mod.playDaysKey('kid-1'))).toBeNull();
    expect(localStorage.getItem(mod.oldPlayDaysKey('kid-1'))).toBeNull();
  });

  it('the records have their own key: a tab still on an older build never writes over them, and the days it notes are folded in (review round 1, #178)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(mod.playDaysKey('kid-1')).not.toBe(mod.oldPlayDaysKey('kid-1'));
    // Yesterday's play, kept here unsent (offline).
    rpc.mockRejectedValue(offline());
    void mod.addDayXp('kid-1', '2026-10-20', 300);
    void mod.addDayMinute('kid-1', '2026-10-20');
    await mod.notePlayDay('kid-1', '2026-10-20');
    // The old tab reads its key (nothing there), notes today as it always did, then sends it and clears its key.
    expect(localStorage.getItem(mod.oldPlayDaysKey('kid-1'))).toBeNull();
    localStorage.setItem(mod.oldPlayDaysKey('kid-1'), JSON.stringify([TODAY]));
    expect(mod.playDayRecords('kid-1')).toEqual([{ day: '2026-10-20', xp: 300, minutes: 1, topics: {} }, blank(TODAY)]);
    expect(mod.pendingPlayDays('kid-1')).toEqual(['2026-10-20', TODAY]);
    localStorage.removeItem(mod.oldPlayDaysKey('kid-1'));
    expect(mod.playDayRecords('kid-1')).toEqual([{ day: '2026-10-20', xp: 300, minutes: 1, topics: {} }]);
    // An old tab's day for a day kept here only marks it played; the next write takes it in and clears the old key.
    void mod.addDayXp('kid-1', TODAY, 15);
    localStorage.setItem(mod.oldPlayDaysKey('kid-1'), JSON.stringify([TODAY]));
    expect(mod.pendingPlayDays('kid-1')).toEqual(['2026-10-20', TODAY]);
    void mod.addDayMinute('kid-1', TODAY);
    expect(localStorage.getItem(mod.oldPlayDaysKey('kid-1'))).toBeNull();
    expect(mod.playDayRecords('kid-1').at(-1)).toEqual({ day: TODAY, xp: 15, minutes: 1, topics: {} });
    rpc.mockResolvedValue(ok);
    await mod.flushPlayDays('kid-1', { now: true });
    expect(sentDays()).toEqual([
      { day: '2026-10-20', xp: 300, minutes: 1, topics: {} },
      { day: TODAY, xp: 15, minutes: 1, topics: {} },
    ]);
    // Forgetting a kid clears both.
    localStorage.setItem(mod.oldPlayDaysKey('kid-1'), JSON.stringify([TODAY]));
    mod.forgetPlayDays('kid-1');
    expect(localStorage.getItem(mod.oldPlayDaysKey('kid-1'))).toBeNull();
    expect(localStorage.getItem(mod.playDaysKey('kid-1'))).toBeNull();
  });

  it('days already played elsewhere (markPlayDays): the records kept here become ones to send; nothing is made for a day with no play here (review rounds 1–2)', () => {
    void mod.addDayMinute('kid-1', '2026-10-19');
    void mod.addDayMinute('kid-1', '2026-10-20');
    void mod.addDayMinute('kid-1', TODAY);
    expect(mod.pendingPlayDays('kid-1')).toEqual([]);
    // The profile proves yesterday and today (a streak of 2 ending today); the 19th stays as it was.
    mod.markPlayDays('kid-1', (d) => d >= '2026-10-20');
    expect(mod.pendingPlayDays('kid-1')).toEqual(['2026-10-20', TODAY]);
    mod.markPlayDays('kid-2', () => true);
    expect(mod.playDayRecords('kid-2')).toEqual([]);
    // It sends nothing itself.
    expect(rpc).not.toHaveBeenCalled();
  });

  it('play noted for a day the profile already counts (`played`) marks it played as it is noted — minutes, answers, XP, a level (review round 2)', async () => {
    rpc.mockResolvedValue(ok);
    // The first send after a while goes at once; the next waits SEND_EVERY_MS, as for any played day.
    await mod.addDayMinute('kid-1', TODAY, { played: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(sentDays()).toEqual([{ day: TODAY, xp: 0, minutes: 1, topics: {} }]);
    await mod.noteDayAnswer('kid-1', TODAY, 'math', false, 4, { played: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    later(mod.SEND_EVERY_MS + 1);
    await mod.noteDayAnswer('kid-1', TODAY, 'math', false, 4, { played: true });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(sentDays()).toEqual([{ day: TODAY, xp: 0, minutes: 1, topics: { math: { a: 2, r: 0, l: 4 } } }]);
    // Each kind marks it: a day that wasn't counted yet becomes one to send.
    for (const [day, note] of [
      ['2026-10-17', () => mod.addDayXp('kid-1', '2026-10-17', 5, { played: true })],
      ['2026-10-18', () => mod.noteDayLevel('kid-1', '2026-10-18', 'math', 5, { played: true })],
    ] as const) {
      void note();
      expect(mod.pendingPlayDays('kid-1')).toContain(day);
    }
    // Without it, a day nobody counted stays unsent (#177).
    void mod.addDayMinute('kid-1', '2026-10-19');
    void mod.addDayMinute('kid-1', '2026-10-19', { played: false });
    expect(mod.pendingPlayDays('kid-1')).not.toContain('2026-10-19');
  });

  it('a record dated more than a day ahead (a device clock set ahead, then fixed) leaves at the next write — it never holds a place for good (review round 2)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A week played with the clock in 2099, offline: eight days kept to send.
    rpc.mockRejectedValue(offline());
    for (let i = 1; i <= mod.PENDING_MAX; i++) {
      vi.setSystemTime(new Date(`2099-01-0${i}T12:00:00`));
      await mod.addDayXp('kid-1', `2099-01-0${i}`, 10);
      await mod.notePlayDay('kid-1', `2099-01-0${i}`);
    }
    expect(mod.playDayRecords('kid-1')).toHaveLength(mod.PENDING_MAX);
    // The clock is right again: the real day's play is kept (it used to be the one dropped, the oldest of nine)
    // and sent; the far-future records are gone.
    vi.setSystemTime(new Date('2026-10-21T12:00:00'));
    await mod.addDayXp('kid-1', TODAY, 120);
    rpc.mockResolvedValue(ok);
    await mod.notePlayDay('kid-1', TODAY);
    expect(sentDays()).toEqual([{ day: TODAY, xp: 120, minutes: 0, topics: {} }]);
    expect(mod.playDayRecords('kid-1').map((r) => r.day)).toEqual([TODAY]);
    // A day one ahead (the clock moved back a little, or a time zone west) stays: it may still be the kid's today.
    void mod.addDayMinute('kid-1', '2026-10-22');
    expect(mod.playDayRecords('kid-1').map((r) => r.day)).toEqual([TODAY, '2026-10-22']);
  });

  it('XP, minutes and answers add up in the day’s record; the tally keeps right ≤ asked and the level last noted', async () => {
    void mod.addDayXp('kid-1', TODAY, 30);
    void mod.addDayXp('kid-1', TODAY, 12.4);
    void mod.addDayXp('kid-1', TODAY, 0);
    void mod.addDayXp('kid-1', TODAY, Number.NaN);
    void mod.addDayMinute('kid-1', TODAY);
    void mod.addDayMinute('kid-1', TODAY);
    void mod.noteDayAnswer('kid-1', TODAY, 'math', true, 4);
    void mod.noteDayAnswer('kid-1', TODAY, 'math', false); // a level unknown keeps the one noted
    void mod.noteDayAnswer('kid-1', TODAY, 'math', true, 11); // not a level: kept as 4
    void mod.noteDayLevel('kid-1', TODAY, 'science', 6); // a level with no answer that day
    void mod.noteDayAnswer('kid-1', TODAY, 'Not A Topic', true, 3);
    void mod.noteDayAnswer('kid-1', 'today', 'math', true, 3);
    expect(mod.playDayRecords('kid-1')).toEqual([
      { day: TODAY, xp: 42, minutes: 2, topics: { math: { a: 3, r: 2, l: 4 }, science: { a: 0, r: 0, l: 6 } } },
    ]);
    // None of it is a day played on its own: nothing is sent until the day counts.
    expect(mod.pendingPlayDays('kid-1')).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('the database’s limits hold on the device too: 1,440 minutes and 16 topics a day', async () => {
    localStorage.setItem(
      mod.playDaysKey('kid-1'),
      JSON.stringify([{ day: TODAY, xp: 5, minutes: 1440, topics: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`t${'abcdefghijklmnop'[i]}`, { a: 1, r: 1 }])) }]),
    );
    void mod.addDayMinute('kid-1', TODAY);
    void mod.noteDayAnswer('kid-1', TODAY, 'math', true, 3);
    const [rec] = mod.playDayRecords('kid-1');
    expect(rec.minutes).toBe(1440);
    expect(Object.keys(rec.topics)).toHaveLength(16);
    expect(rec.topics.math).toBeUndefined();
  });

  it('junk kept on the device is cleaned as it’s read: bad numbers, more right than asked, odd topic names', () => {
    localStorage.setItem(
      mod.playDaysKey('kid-1'),
      JSON.stringify([
        { day: TODAY, xp: -5, minutes: 'ten', topics: { math: { a: 2, r: 9, l: 0 }, 'Big Bad': { a: 1, r: 1 }, music: 'x' }, played: 'yes' },
        { day: 'soon', xp: 1 },
        null,
      ]),
    );
    expect(mod.playDayRecords('kid-1')).toEqual([{ day: TODAY, xp: 0, minutes: 0, topics: { math: { a: 2, r: 2 } } }]);
    expect(mod.pendingPlayDays('kid-1')).toEqual([]); // "yes" isn't played
  });

  it('today’s record stays on the device after a send and goes again whole once it grows; a past day leaves', async () => {
    rpc.mockResolvedValue(ok);
    void mod.addDayXp('kid-1', '2026-10-20', 15);
    await mod.notePlayDay('kid-1', '2026-10-20');
    void mod.addDayXp('kid-1', TODAY, 30);
    await mod.notePlayDay('kid-1', TODAY);
    expect(sentDays()).toEqual([{ day: TODAY, xp: 30, minutes: 0, topics: {} }]);
    // Sent: yesterday gone, today kept (nothing new to send).
    expect(mod.playDayRecords('kid-1')).toEqual([{ day: TODAY, xp: 30, minutes: 0, topics: {} }]);
    expect(mod.pendingPlayDays('kid-1')).toEqual([]);
    await mod.flushPlayDays('kid-1', { now: true });
    expect(rpc).toHaveBeenCalledTimes(2); // nothing changed, nothing sent
    // It grows: the server keeps the larger total, so the whole day goes again.
    void mod.addDayXp('kid-1', TODAY, 20);
    void mod.noteDayAnswer('kid-1', TODAY, 'math', true, 5);
    await mod.flushPlayDays('kid-1', { now: true });
    expect(sentDays()).toEqual([{ day: TODAY, xp: 50, minutes: 0, topics: { math: { a: 1, r: 1, l: 5 } } }]);
    // The next morning it's a past day the database has: it leaves.
    later(24 * 3600_000);
    await mod.notePlayDay('kid-1', '2026-10-22');
    expect(mod.playDayRecords('kid-1').map((r) => r.day)).toEqual(['2026-10-22']);
  });

  it('not one call per answer: after a send, what grows waits SEND_EVERY_MS — a new day goes at once', async () => {
    rpc.mockResolvedValue(ok);
    await mod.notePlayDay('kid-1', TODAY);
    for (let i = 0; i < 20; i++) await mod.noteDayAnswer('kid-1', TODAY, 'math', i % 2 === 0, 4);
    await mod.addDayXp('kid-1', TODAY, 100);
    await mod.addDayMinute('kid-1', TODAY);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mod.pendingPlayDays('kid-1')).toEqual([TODAY]);
    later(mod.SEND_EVERY_MS + 1);
    await mod.addDayMinute('kid-1', TODAY);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(sentDays()).toEqual([{ day: TODAY, xp: 100, minutes: 2, topics: { math: { a: 20, r: 10, l: 4 } } }]);
    // The next morning's first play is a new day: sent at once, with what was still waiting.
    void mod.addDayXp('kid-1', TODAY, 5);
    later(15 * 3600_000);
    await mod.notePlayDay('kid-1', '2026-10-22');
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it('the tab going out of view sends at once (watchPlayDays) — but not just after a failed send', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockResolvedValue(ok);
    const stop = mod.watchPlayDays(() => 'kid-1');
    await mod.notePlayDay('kid-1', TODAY);
    void mod.addDayXp('kid-1', TODAY, 10);
    expect(rpc).toHaveBeenCalledTimes(1);
    const hide = (state: 'hidden' | 'visible') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    hide('hidden');
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(sentDays()).toEqual([{ day: TODAY, xp: 10, minutes: 0, topics: {} }]);
    // A refusal: hiding the tab doesn't try again (the next day or profile load does).
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } });
    hide('visible');
    void mod.addDayXp('kid-1', TODAY, 5);
    await mod.flushPlayDays('kid-1', { now: true });
    expect(rpc).toHaveBeenCalledTimes(3);
    void mod.addDayXp('kid-1', TODAY, 5);
    hide('hidden');
    await new Promise((r) => setTimeout(r, 0));
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalled();
    stop();
    hide('visible');
  });

  it('before migration 0026: the days alone go to note_play_days as before; the rest waits on the device for a session that has it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockImplementation(async (fn: string) => (fn === 'note_play_history' ? noHistory : ok));
    void mod.addDayXp('kid-1', '2026-10-20', 40);
    void mod.noteDayAnswer('kid-1', '2026-10-20', 'math', true, 3);
    await mod.notePlayDay('kid-1', '2026-10-20');
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['note_play_history', 'note_play_days']);
    expect(rpc).toHaveBeenLastCalledWith('note_play_days', { p_kid: 'kid-1', p_days: ['2026-10-20'] });
    expect(warn.mock.calls[0].join(' ')).toContain('0026');
    // The day is in; its XP and answers stay to send.
    expect(mod.pendingPlayDays('kid-1')).toEqual(['2026-10-20']);
    expect(mod.playDayRecords('kid-1')[0]).toMatchObject({ xp: 40, topics: { math: { a: 1, r: 1, l: 3 } } });
    // This session: only new days go, and only as days (no more asking for the missing function).
    void mod.addDayXp('kid-1', TODAY, 10);
    await mod.notePlayDay('kid-1', TODAY);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['note_play_history', 'note_play_days', 'note_play_days']);
    expect(rpc).toHaveBeenLastCalledWith('note_play_days', { p_kid: 'kid-1', p_days: [TODAY] });
    await mod.flushPlayDays('kid-1', { now: true });
    expect(rpc).toHaveBeenCalledTimes(3);
    // A later session, 0026 applied: everything still within the week goes, whole.
    vi.resetModules();
    mod = await import('./playDays');
    rpc.mockReset();
    rpc.mockResolvedValue(ok);
    await mod.flushPlayDays('kid-1', { now: true });
    expect(sentDays()).toEqual([
      { day: '2026-10-20', xp: 40, minutes: 0, topics: { math: { a: 1, r: 1, l: 3 } } },
      { day: TODAY, xp: 10, minutes: 0, topics: {} },
    ]);
    expect(mod.playDayRecords('kid-1').map((r) => r.day)).toEqual([TODAY]);
  });

  it('a missing function is asked for again after MISSING_RECHECK_MS, and at once after recheckPlayFunctions (a profile load) — never for the tab’s whole life (review round 2)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 0026 not there yet: the day alone goes; the rest waits.
    rpc.mockImplementation(async (fn: string) => (fn === 'note_play_history' ? noHistory : ok));
    void mod.addDayXp('kid-1', '2026-10-20', 40);
    await mod.notePlayDay('kid-1', '2026-10-20');
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['note_play_history', 'note_play_days']);
    // 0026 is applied (the tab stayed open across the deploy). Within the while: still the days alone.
    rpc.mockReset();
    rpc.mockResolvedValue(ok);
    later(mod.MISSING_RECHECK_MS - 1000);
    void mod.addDayXp('kid-1', TODAY, 10);
    await mod.notePlayDay('kid-1', TODAY);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['note_play_days']);
    // After it: note_play_history again, and the play waiting on the device goes whole.
    later(1001 + mod.SEND_EVERY_MS);
    await mod.flushPlayDays('kid-1', { now: true });
    expect(rpc).toHaveBeenLastCalledWith('note_play_history', {
      p_kid: 'kid-1',
      p_days: [
        { day: '2026-10-20', xp: 40, minutes: 0, topics: {} },
        { day: TODAY, xp: 10, minutes: 0, topics: {} },
      ],
    });
    // Neither function (0025 not there): nothing for a while — then asked again, or at once after a profile load.
    mod.forgetPlayDays('kid-1');
    rpc.mockReset();
    rpc.mockImplementation(async (fn: string) => (fn === 'note_play_history' ? noHistory : noDays));
    await mod.notePlayDay('kid-1', TODAY);
    expect(rpc).toHaveBeenCalledTimes(2);
    await mod.flushPlayDays('kid-1', { now: true });
    expect(rpc).toHaveBeenCalledTimes(2);
    rpc.mockReset();
    rpc.mockResolvedValue(ok);
    mod.recheckPlayFunctions();
    await mod.flushPlayDays('kid-1', { now: true });
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['note_play_history']);
    expect(mod.pendingPlayDays('kid-1')).toEqual([]);
  });

  it('minutes and answers on a day nothing counted as played wait on the device, and go with the day once it is played', async () => {
    rpc.mockResolvedValue(ok);
    for (let i = 0; i < 3; i++) await mod.addDayMinute('kid-1', TODAY);
    await mod.noteDayAnswer('kid-1', TODAY, 'nature', false, 2);
    expect(rpc).not.toHaveBeenCalled();
    await mod.notePlayDay('kid-1', TODAY);
    expect(sentDays()).toEqual([{ day: TODAY, xp: 0, minutes: 3, topics: { nature: { a: 1, r: 0, l: 2 } } }]);
  });

  it('a record that grows while its send is on the way is sent again (the database got the smaller one)', async () => {
    let finish: (v: unknown) => void = () => {};
    rpc.mockImplementationOnce(() => new Promise((r) => (finish = r))).mockResolvedValue(ok);
    void mod.addDayXp('kid-1', '2026-10-20', 10);
    const sending = mod.notePlayDay('kid-1', '2026-10-20');
    // A late answer for that day (a round that ran past midnight) lands mid-send.
    void mod.noteDayAnswer('kid-1', '2026-10-20', 'words', true, 5);
    finish(ok);
    await sending;
    expect(mod.pendingPlayDays('kid-1')).toEqual(['2026-10-20']);
    await mod.flushPlayDays('kid-1', { now: true });
    expect(sentDays()).toEqual([{ day: '2026-10-20', xp: 10, minutes: 0, topics: { words: { a: 1, r: 1, l: 5 } } }]);
    expect(mod.playDayRecords('kid-1')).toEqual([]);
  });
});
