import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const addDayMinute = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('./playDays', () => ({ addDayMinute }));

const { minuteCounts, watchActiveMinutes, MINUTE_MS } = await import('./activeMinutes');

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
    addDayMinute.mockClear();
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
    expect(addDayMinute).toHaveBeenLastCalledWith('kid-1', '2026-10-21');
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
});
