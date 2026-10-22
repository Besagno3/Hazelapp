import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A stand-in for the day records (lib/playDays): each kid's minutes per day,
// and whether the day counts as played — as addDayMinute keeps them.
const { addDayMinute, keptDay, kept } = vi.hoisted(() => {
  const kept = new Map<string, { minutes: number; played: boolean }>();
  return {
    kept,
    addDayMinute: vi.fn(async (kidId: string, day: string, noting?: { played?: boolean }) => {
      const had = kept.get(`${kidId}|${day}`) ?? { minutes: 0, played: false };
      kept.set(`${kidId}|${day}`, { minutes: had.minutes + 1, played: had.played || !!noting?.played });
    }),
    keptDay: vi.fn((kidId: string, day: string) => kept.get(`${kidId}|${day}`) ?? null),
  };
});
vi.mock('./playDays', () => ({ addDayMinute, keptDay }));

const { claimMinute, minuteCounts, minuteStampKey, watchActiveMinutes, MINUTE_GAP_MS, MINUTE_MS, PLAY_DAY_MINUTES } = await import('./activeMinutes');

const setVisible = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('which minutes count as played (#172)', () => {
  const now = 1_000_000;
  it('the game on screen, the tab in view and input within the minute — all three', () => {
    expect(minuteCounts({ inGame: true, visible: true, lastInputAt: now - 30_000, now })).toBe(true);
    expect(minuteCounts({ inGame: false, visible: true, lastInputAt: now - 30_000, now })).toBe(false);
    expect(minuteCounts({ inGame: true, visible: false, lastInputAt: now - 30_000, now })).toBe(false);
    expect(minuteCounts({ inGame: true, visible: true, lastInputAt: now - MINUTE_MS, now })).toBe(true);
    expect(minuteCounts({ inGame: true, visible: true, lastInputAt: now - MINUTE_MS - 1, now })).toBe(false);
    expect(minuteCounts({ inGame: true, visible: true, lastInputAt: Number.NEGATIVE_INFINITY, now })).toBe(false);
  });
});

describe('watchActiveMinutes: a minute a minute while someone plays (#172)', () => {
  let kid: string | null;
  let inGame: boolean;
  let stop: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T16:00:00'));
    localStorage.clear();
    addDayMinute.mockClear();
    kept.clear();
    setVisible('visible');
    kid = 'kid-1';
    inGame = true;
    stop = watchActiveMinutes({ kid: () => kid, inGame: () => inGame });
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('a key, a click or a touch in the minute: one minute for the kid playing, on their day', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    vi.advanceTimersByTime(MINUTE_MS);
    expect(addDayMinute).toHaveBeenCalledTimes(1);
    expect(addDayMinute).toHaveBeenLastCalledWith('kid-1', '2026-10-21', { played: false });
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(MINUTE_MS);
    window.dispatchEvent(new Event('touchstart'));
    vi.advanceTimersByTime(MINUTE_MS);
    expect(addDayMinute).toHaveBeenCalledTimes(3);
  });

  it('a tab left open with nobody there counts nothing — nor does the minute after the last key', () => {
    vi.advanceTimersByTime(5 * MINUTE_MS);
    expect(addDayMinute).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    vi.advanceTimersByTime(MINUTE_MS);
    vi.advanceTimersByTime(MINUTE_MS);
    expect(addDayMinute).toHaveBeenCalledTimes(1);
  });

  it('only while the game is on screen and the tab in view; back in view, it waits for a new key', () => {
    inGame = false; // 👪 Grown-ups, "Who's playing?", sign-in
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    vi.advanceTimersByTime(MINUTE_MS);
    expect(addDayMinute).not.toHaveBeenCalled();
    inGame = true;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    setVisible('hidden');
    vi.advanceTimersByTime(MINUTE_MS); // hidden as the minute ends
    expect(addDayMinute).not.toHaveBeenCalled();
    // A key, then away and back within the minute: the key before leaving doesn't count.
    vi.advanceTimersByTime(MINUTE_MS / 2);
    setVisible('visible');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    setVisible('hidden');
    vi.advanceTimersByTime(10_000);
    setVisible('visible');
    vi.advanceTimersByTime(MINUTE_MS / 2 - 10_000);
    expect(addDayMinute).not.toHaveBeenCalled();
  });

  it('no kid playing: nothing; and the clean-up stops it all', () => {
    kid = null;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    vi.advanceTimersByTime(MINUTE_MS);
    expect(addDayMinute).not.toHaveBeenCalled();
    kid = 'kid-1';
    stop();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    vi.advanceTimersByTime(3 * MINUTE_MS);
    expect(addDayMinute).not.toHaveBeenCalled();
  });

  it("across Switch player, the outgoing kid's last part-minute and the incoming kid's PIN are nobody's minute (review round 2)", () => {
    // Kid A plays from 0 to 50 s, then switches.
    for (let t = 0; t < 50_000; t += 5_000) {
      window.dispatchEvent(new Event('pointerdown'));
      vi.advanceTimersByTime(5_000);
    }
    kid = null;
    inGame = false; // "Who's playing?"
    vi.advanceTimersByTime(3_000);
    window.dispatchEvent(new Event('pointerdown')); // B taps their tile and types their PIN
    vi.advanceTimersByTime(5_000);
    kid = 'kid-2';
    inGame = true; // B in the game at 58 s, no key yet
    vi.advanceTimersByTime(2_000); // the tick at 60 s
    expect(addDayMinute).not.toHaveBeenCalled();
    // B's own play counts from their first key on a game screen.
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(MINUTE_MS);
    expect(addDayMinute).toHaveBeenCalledTimes(1);
    expect(addDayMinute).toHaveBeenLastCalledWith('kid-2', '2026-10-21', { played: false });
  });

  it('input off the game screens (the PIN pad, the family screens, 👪) never counts, even for the same kid (review round 2)', () => {
    inGame = false;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    inGame = true; // back in the game within the minute, nothing touched there
    vi.advanceTimersByTime(MINUTE_MS);
    expect(addDayMinute).not.toHaveBeenCalled();
  });

  it("a day the profile already counts as played: the minute says so, so it goes up like the day's play (review round 2)", () => {
    stop();
    const played = vi.fn((id: string, day: string) => id === 'kid-1' && day === '2026-10-21');
    stop = watchActiveMinutes({ kid: () => kid, inGame: () => inGame, played });
    window.dispatchEvent(new Event('touchstart'));
    vi.advanceTimersByTime(MINUTE_MS);
    expect(played).toHaveBeenCalledWith('kid-1', '2026-10-21');
    expect(addDayMinute).toHaveBeenLastCalledWith('kid-1', '2026-10-21', { played: true });
  });

  it('two windows of the game, both in view and used in turn: one minute counted, not two (review round 1)', () => {
    vi.advanceTimersByTime(MINUTE_MS / 2);
    const stopOther = watchActiveMinutes({ kid: () => kid, inGame: () => inGame }); // a second window, its minute out of step
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })); // heard by both
      vi.advanceTimersByTime(MINUTE_MS / 2); // the first window's minute ends: counted
      vi.advanceTimersByTime(MINUTE_MS / 2); // the second's, 30 s later: the same minute
      expect(addDayMinute).toHaveBeenCalledTimes(1);
      expect(Number(localStorage.getItem(minuteStampKey('kid-1')))).toBe(Date.now() - MINUTE_MS / 2);
      // Play goes on in both: a minute a minute, still.
      for (let i = 0; i < 4; i++) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
        vi.advanceTimersByTime(MINUTE_MS / 2);
      }
      expect(addDayMinute).toHaveBeenCalledTimes(3);
    } finally {
      stopOther();
    }
  });
});

describe('five active minutes count the day as played (#177)', () => {
  let kid: string | null;
  let inGame: boolean;
  let stop: () => void;
  const countDay = vi.fn();
  /** `n` minutes with a key pressed in each, on a game screen. */
  const play = (n: number) => {
    for (let i = 0; i < n; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      vi.advanceTimersByTime(MINUTE_MS);
    }
  };
  const watch = (played?: (kidId: string, day: string) => boolean) =>
    (stop = watchActiveMinutes({ kid: () => kid, inGame: () => inGame, played, countDay }));
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T16:00:00'));
    localStorage.clear();
    kept.clear();
    addDayMinute.mockClear();
    countDay.mockReset();
    setVisible('visible');
    kid = 'kid-1';
    inGame = true;
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('four minutes count nothing; the fifth counts the day — once, however long the walk goes on', () => {
    expect(PLAY_DAY_MINUTES).toBe(5);
    watch();
    play(PLAY_DAY_MINUTES - 1);
    expect(countDay).not.toHaveBeenCalled();
    play(1);
    expect(countDay).toHaveBeenCalledTimes(1);
    expect(countDay).toHaveBeenCalledWith('kid-1', '2026-10-21');
    // Still not marked played here (the stand-in doesn't): this window never asks twice in a day.
    play(10);
    expect(countDay).toHaveBeenCalledTimes(1);
    // The next day's five minutes count that day.
    vi.setSystemTime(new Date('2026-10-22T09:00:00'));
    play(PLAY_DAY_MINUTES);
    expect(countDay).toHaveBeenCalledTimes(2);
    expect(countDay).toHaveBeenLastCalledWith('kid-1', '2026-10-22');
  });

  it('a day already played — by the profile, or marked here (another window counted it) — is never counted again', () => {
    watch((id, day) => id === 'kid-1' && day === '2026-10-21');
    play(PLAY_DAY_MINUTES + 3);
    expect(countDay).not.toHaveBeenCalled();
    stop();
    kid = 'kid-2';
    kept.set('kid-2|2026-10-21', { minutes: 7, played: true });
    watch();
    play(2);
    expect(countDay).not.toHaveBeenCalled();
  });

  it("another kid's minutes don't count: each kid's five are their own", () => {
    watch();
    play(PLAY_DAY_MINUTES - 1); // kid 1's four
    kid = 'kid-2'; // Switch player
    play(1);
    expect(countDay).not.toHaveBeenCalled();
    play(PLAY_DAY_MINUTES - 1);
    expect(countDay).toHaveBeenCalledTimes(1);
    expect(countDay).toHaveBeenCalledWith('kid-2', '2026-10-21');
  });

  it('only minutes on a game screen: a fifth minute with 👪 or "Who\'s playing?" showing counts nothing', () => {
    watch();
    play(PLAY_DAY_MINUTES - 1);
    inGame = false;
    play(3);
    expect(countDay).not.toHaveBeenCalled();
    expect(kept.get('kid-1|2026-10-21')?.minutes).toBe(PLAY_DAY_MINUTES - 1);
    inGame = true;
    play(1);
    expect(countDay).toHaveBeenCalledTimes(1);
  });
});

describe('claimMinute: a minute is one window’s (review round 1)', () => {
  beforeEach(() => localStorage.clear());

  it('taken once in MINUTE_GAP_MS for a kid; another kid has their own; a clock set back never holds it up', () => {
    const t = 5_000_000;
    expect(claimMinute('kid-1', t)).toBe(true);
    expect(claimMinute('kid-1', t + MINUTE_GAP_MS - 1)).toBe(false);
    expect(claimMinute('kid-2', t + 1)).toBe(true);
    expect(claimMinute('kid-1', t + MINUTE_GAP_MS)).toBe(true);
    expect(claimMinute('kid-1', t - 3_600_000)).toBe(true);
    localStorage.setItem(minuteStampKey('kid-3'), 'junk');
    expect(claimMinute('kid-3', t)).toBe(true);
  });

  it('storage that can’t be used: this window counts', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(claimMinute('kid-1', 1)).toBe(true);
    expect(claimMinute('kid-1', 2)).toBe(true);
    vi.restoreAllMocks();
  });
});
