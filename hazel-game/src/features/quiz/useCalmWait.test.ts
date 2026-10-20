import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCalmWait } from './useCalmWait';

const after = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useCalmWait — a wait that never flashes (#163 review)', () => {
  it('a wait that ends before the delay is never shown', () => {
    const { result, rerender } = renderHook(({ waiting }) => useCalmWait(waiting, 800, 400), { initialProps: { waiting: true } });
    expect(result.current).toBe(false);
    after(799);
    rerender({ waiting: false });
    after(1000);
    expect(result.current).toBe(false);
  });

  it('shown once it has lasted the delay, it stays the minimum even when the wait ends at once', () => {
    const { result, rerender } = renderHook(({ waiting }) => useCalmWait(waiting, 800, 400), { initialProps: { waiting: true } });
    after(800);
    expect(result.current).toBe(true);
    after(100);
    rerender({ waiting: false });
    // 100 ms on screen: 300 more to go.
    after(299);
    expect(result.current).toBe(true);
    after(1);
    expect(result.current).toBe(false);
  });

  it('a long wait goes as soon as it ends', () => {
    const { result, rerender } = renderHook(({ waiting }) => useCalmWait(waiting, 250, 400), { initialProps: { waiting: true } });
    after(3000);
    expect(result.current).toBe(true);
    rerender({ waiting: false });
    after(0);
    expect(result.current).toBe(false);
  });

  it('each wait gets its own delay', () => {
    const { result, rerender } = renderHook(({ waiting }) => useCalmWait(waiting, 250, 400), { initialProps: { waiting: false } });
    rerender({ waiting: true });
    after(200);
    rerender({ waiting: false });
    rerender({ waiting: true });
    after(200);
    expect(result.current).toBe(false);
    after(50);
    expect(result.current).toBe(true);
  });
});
