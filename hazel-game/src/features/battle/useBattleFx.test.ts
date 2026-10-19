import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../lib/audio', () => ({ sfx: () => {} }));

const { useBattleFx } = await import('./useBattleFx');

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('the callout banner queues (#97c)', () => {
  it("a charge banner right after \"So quick!\" waits until it's had its time", () => {
    const { result } = renderHook(() => useBattleFx());
    act(() => result.current.showBanner('So quick! The questions just got harder — level 4 → 5', 3200, '⚡'));
    wait(500);
    act(() => result.current.showBanner('Count Bat is gathering power for Zero Crush!', 2800, '💢'));
    // Still the speed banner: the charge one waits.
    expect(result.current.banner).toBe('⚡ So quick! The questions just got harder — level 4 → 5');
    wait(2650);
    expect(result.current.banner).toMatch(/^⚡ So quick!/);
    wait(50);
    // 3.2 s in: the charge banner takes over, for its own full time.
    expect(result.current.banner).toBe('💢 Count Bat is gathering power for Zero Crush!');
    wait(2790);
    expect(result.current.banner).toMatch(/^💢/);
    wait(10);
    expect(result.current.banner).toBeNull();
  });

  it('banners show in the order they came, each for its own time', () => {
    const { result } = renderHook(() => useBattleFx());
    act(() => {
      result.current.showBanner('One', 1000, '1️⃣');
      result.current.showBanner('Two', 2000, '2️⃣');
      result.current.showBanner('Three', 500, '3️⃣');
    });
    expect(result.current.banner).toBe('1️⃣ One');
    wait(1000);
    expect(result.current.banner).toBe('2️⃣ Two');
    wait(2000);
    expect(result.current.banner).toBe('3️⃣ Three');
    wait(500);
    expect(result.current.banner).toBeNull();
  });

  it('the same banner on screen or waiting is not queued twice', () => {
    const { result } = renderHook(() => useBattleFx());
    act(() => {
      result.current.showBanner('Roar!');
      result.current.showBanner('Roar!');
      result.current.showBanner('Next', 1000, '➡️');
      result.current.showBanner('Next', 1000, '➡️');
    });
    expect(result.current.banner).toBe('⚠️ Roar!');
    wait(2500);
    expect(result.current.banner).toBe('➡️ Next');
    wait(1000);
    expect(result.current.banner).toBeNull();
  });

  it('a banner that answers the one on screen takes its place at once, and the rest still wait', () => {
    const { result } = renderHook(() => useBattleFx());
    act(() => {
      result.current.showBanner('Pixel Witch is too slippery for Hint Feathers! Light a 🕯️ Glimmer Candle!', 5000);
      result.current.showBanner('So quick!', 3200, '⚡');
    });
    wait(1000);
    act(() => result.current.showBanner('Your Glimmer Candle is lit!', 2500, '🕯️', { answers: 'too slippery for Hint Feathers' }));
    expect(result.current.banner).toBe('🕯️ Your Glimmer Candle is lit!');
    wait(2500);
    expect(result.current.banner).toBe('⚡ So quick!');
    wait(3200);
    expect(result.current.banner).toBeNull();
  });

  it('…and a waiting one it answers never shows', () => {
    const { result } = renderHook(() => useBattleFx());
    act(() => {
      result.current.showBanner('Roar!', 1000);
      result.current.showBanner('Pixel Witch is too slippery for Hint Feathers!', 3000);
      result.current.showBanner('Your Glimmer Candle is lit!', 2500, '🕯️', { answers: 'too slippery for Hint Feathers' });
    });
    expect(result.current.banner).toBe('⚠️ Roar!');
    wait(1000);
    expect(result.current.banner).toBe('🕯️ Your Glimmer Candle is lit!');
  });

  it('a banner after the last one went shows at once', () => {
    const { result } = renderHook(() => useBattleFx());
    act(() => result.current.showBanner('First', 1000));
    wait(1500);
    expect(result.current.banner).toBeNull();
    act(() => result.current.showBanner('Second', 1000));
    expect(result.current.banner).toBe('⚠️ Second');
  });

  it('a swap banner cuts in at once; the callout it cut short comes back for the rest of its time (#97c review)', () => {
    const { result } = renderHook(() => useBattleFx());
    act(() => result.current.showBanner('Pixel Witch is too slippery for Hint Feathers!', 6000));
    wait(1000);
    act(() => result.current.showBanner('Pip tags in — still your move!', 1800, '🧒', { kind: 'swap' }));
    // Now, not 5 s later mid-question.
    expect(result.current.banner).toBe('🧒 Pip tags in — still your move!');
    wait(1800);
    expect(result.current.banner).toBe('⚠️ Pixel Witch is too slippery for Hint Feathers!');
    wait(4990);
    expect(result.current.banner).toMatch(/too slippery/);
    wait(10);
    expect(result.current.banner).toBeNull();
  });

  it('…and a callout nearly done still comes back long enough to read', () => {
    const { result } = renderHook(() => useBattleFx());
    act(() => result.current.showBanner('Roar!', 3000));
    wait(2900);
    act(() => result.current.showBanner('Pip tags in — still your move!', 1800, '🧒', { kind: 'swap' }));
    wait(1800);
    expect(result.current.banner).toBe('⚠️ Roar!');
    wait(1490);
    expect(result.current.banner).toBe('⚠️ Roar!');
    wait(10);
    expect(result.current.banner).toBeNull();
  });

  it('quick swaps: the last banner names the friend fighting now, and none waits behind it', () => {
    const { result } = renderHook(() => useBattleFx());
    act(() => {
      result.current.showBanner('Pip tags in — still your move!', 1800, '🧒', { kind: 'swap' });
      result.current.showBanner('Ember tags in — still your move!', 1800, '🐉', { kind: 'swap' });
      result.current.showBanner('Pip tags in — still your move!', 1800, '🧒', { kind: 'swap' });
    });
    expect(result.current.banner).toBe('🧒 Pip tags in — still your move!');
    wait(1800);
    // Not "Ember tags in" after it: Ember isn't fighting any more.
    expect(result.current.banner).toBeNull();
  });

  it('a Pair Attack banner shows with its strike, not after a "So quick!" — which still gets its time', () => {
    const { result } = renderHook(() => useBattleFx());
    act(() => result.current.showBanner('So quick! The questions just got harder — level 4 → 5', 3200, '⚡'));
    wait(500);
    act(() => result.current.showBanner('PAIR ATTACK — STARFIRE!', 1800, '🌟', { kind: 'pair' }));
    expect(result.current.banner).toBe('🌟 PAIR ATTACK — STARFIRE!');
    wait(1800);
    expect(result.current.banner).toMatch(/^⚡ So quick!/);
    wait(2700);
    expect(result.current.banner).toBeNull();
  });

  it('the fight over, nothing on screen or waiting — and nothing asked for late shows (#159 review round 2)', () => {
    const { result } = renderHook(() => useBattleFx());
    act(() => {
      result.current.showBanner('One', 1000);
      result.current.showBanner('Two', 1000);
    });
    act(() => result.current.clearBanners());
    expect(result.current.banner).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    wait(3000);
    expect(result.current.banner).toBeNull();
    // A harder pool landing after the win: its "So quick!" is refused, so it can't sit over the result.
    let taken = true;
    act(() => {
      taken = result.current.showBanner('So quick! The questions just got harder', 3200, '⚡');
      result.current.showBanner('Pip tags in', 1800, '🧒', { kind: 'swap' });
    });
    expect(taken).toBe(false);
    expect(result.current.banner).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('effects run again (StrictMode, Fast Refresh) open the banners afresh: the next one shows at once', () => {
    // StrictMode mounts, cleans up (which shuts the banners and resets the timer's ref) and mounts again.
    const { result } = renderHook(() => useBattleFx(), { reactStrictMode: true });
    let taken = false;
    act(() => {
      taken = result.current.showBanner('Three', 1000);
    });
    expect(taken).toBe(true);
    expect(result.current.banner).toBe('⚠️ Three');
    wait(1000);
    expect(result.current.banner).toBeNull();
  });

  it('nothing is left running once the arena closes', () => {
    const { result, unmount } = renderHook(() => useBattleFx());
    act(() => {
      result.current.showBanner('One', 1000);
      result.current.showBanner('Two', 1000);
    });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('floating numbers', () => {
  it('a big one (super effective) says so, for the stage to draw larger', () => {
    const { result } = renderHook(() => useBattleFx());
    act(() => {
      result.current.float('-42!!', 'enemy', 'text-yellow-300', true);
      result.current.float('-12', 'enemy', 'text-orange-300');
    });
    expect(result.current.stage.floats.map((f) => [f.text, f.big])).toEqual([
      ['-42!!', true],
      ['-12', false],
    ]);
  });
});
