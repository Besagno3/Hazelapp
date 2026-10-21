import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { FamilyScreen } from '../../store/familyStore';

const lockGrownUps = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../../lib/grownUps', () => ({ lockGrownUps }));

const { useLockOnLeave } = await import('./useLockOnLeave');

beforeEach(() => lockGrownUps.mockClear());

function walk(screens: FamilyScreen[]) {
  const { rerender } = renderHook(({ s }) => useLockOnLeave(s), { initialProps: { s: screens[0] } });
  for (const s of screens.slice(1)) rerender({ s });
}

describe('leaving the grown-up screens shuts 👪 Grown-ups (#167)', () => {
  it('👪 Grown-ups → Who\'s playing?, and a new family\'s setup → Who\'s playing? or the game', () => {
    walk(['grownUps', 'pick']);
    walk(['kidSetup', 'pick']);
    walk(['firstKid', 'play']);
    walk(['consent', 'pick']);
    expect(lockGrownUps).toHaveBeenCalledTimes(4);
  });

  it('moving between grown-up screens, or between the kids\' screens, shuts nothing', () => {
    walk(['consent', 'firstKid', 'kidSetup', 'grownUps']);
    walk(['pick', 'play', 'pick']);
    walk(['loading', 'pick']);
    expect(lockGrownUps).not.toHaveBeenCalled();
  });
});
