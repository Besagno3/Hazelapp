import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { DefendTimer } from './DefendTimer';
import { tickAt, urgentAt } from './urgency';

afterEach(() => vi.useRealTimers());

const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('DefendTimer (#165 review round 3)', () => {
  it('urgency: the last 5 s on a clock of 10 s and over, a third of a shorter one; ticks never longer than urgency', () => {
    expect(urgentAt(25_000)).toBe(5);
    expect(urgentAt(10_000)).toBe(5);
    expect(urgentAt(12_000)).toBe(5);
    expect(urgentAt(8_000)).toBe(2);
    expect(urgentAt(6_000)).toBe(2);
    expect(urgentAt(2_000)).toBe(1);
    expect(tickAt(25_000)).toBe(3);
    expect(tickAt(8_000)).toBe(2);
  });

  it('run out, it says "Time\'s up" (never "In time"), fires once, and shows no pulse', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    render(<DefendTimer durationMs={3_000} stopped={false} onExpire={onExpire} label="Go" what="to type" />);
    expect(screen.getByRole('timer')).toHaveAccessibleName('3 seconds left to type');
    tick(3_300);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('timer')).toHaveAccessibleName("Time's up");
    expect(screen.getByRole('timer')).toHaveTextContent(/Time's up/);
    expect(screen.getByRole('timer')).not.toHaveTextContent(/In time/);
    expect(screen.getByRole('timer').querySelector('.animate-pulse, .motion-safe\\:animate-pulse')).toBeNull();
    tick(2_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('stopped: "Typed in time" for a word, "Answered in time" for a block', () => {
    const { rerender } = render(<DefendTimer durationMs={3_000} stopped onExpire={() => {}} label="Go" what="to type" />);
    expect(screen.getByRole('timer')).toHaveAccessibleName('Typed in time');
    expect(screen.getByRole('timer')).toHaveTextContent(/In time!/);
    rerender(<DefendTimer durationMs={3_000} stopped onExpire={() => {}} label="Go" />);
    expect(screen.getByRole('timer')).toHaveAccessibleName('Answered in time');
  });

  it('not ready: "Ready…" and nothing counts; ready, the whole clock runs from then', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const { rerender } = render(<DefendTimer durationMs={3_000} stopped={false} ready={false} onExpire={onExpire} label="Go" what="to type" />);
    const timer = screen.getByRole('timer');
    expect(timer).toHaveAccessibleName('Get ready — 3 seconds to type');
    expect(timer).toHaveTextContent(/Ready…/);
    expect(timer).not.toHaveTextContent(/Paused/);
    tick(2_000);
    expect(timer).toHaveTextContent(/Ready…/);
    rerender(<DefendTimer durationMs={3_000} stopped={false} ready onExpire={onExpire} label="Go" what="to type" />);
    expect(timer).toHaveAccessibleName('3 seconds left to type');
    tick(2_800);
    expect(onExpire).not.toHaveBeenCalled();
    tick(400);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
