import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MotionConfig } from 'framer-motion';
import { BattleIntro } from './BattleIntro';
import { INTRO_MS, INTRO_STILL_MS, introLine } from './intro';

const sprite = { def: null, emoji: '🦇' } as unknown as Parameters<typeof BattleIntro>[0]['sprite'];

afterEach(() => {
  vi.useRealTimers();
});

describe('BattleIntro (#158 review)', () => {
  it('names the foe — a boss blocks your path', () => {
    expect(introLine('Count Bat', false)).toBe('⚔️ Count Bat appears!');
    expect(introLine('The Null Fiend', true)).toBe('☠️ The Null Fiend blocks your path!');
  });

  it('says who appears, read out once, and ends after about a second', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<BattleIntro name="Count Bat" sprite={sprite} isBoss={false} onDone={onDone} />);
    expect(screen.getByRole('status')).toHaveTextContent('⚔️ Count Bat appears!');
    act(() => vi.advanceTimersByTime(INTRO_MS - 1));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('under reduced motion it is a short fade', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(
      <MotionConfig reducedMotion="always">
        <BattleIntro name="Count Bat" sprite={sprite} isBoss={false} onDone={onDone} />
      </MotionConfig>,
    );
    act(() => vi.advanceTimersByTime(INTRO_STILL_MS));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
