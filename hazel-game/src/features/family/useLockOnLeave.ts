import { useEffect, useRef } from 'react';
import { lockGrownUps } from '../../lib/grownUps';
import type { FamilyScreen } from '../../store/familyStore';

/** The screens a grown-up uses (#124): consent, 👪 Grown-ups, the first player, a player's PIN. */
export const GROWN_UP_SCREENS: readonly FamilyScreen[] = ['consent', 'grownUps', 'firstKid', 'kidSetup'];

/**
 * Leaving the grown-up screens for the kids' — 👪 Grown-ups' "Done", or a new
 * family's setup finishing on "Who's playing?" — shuts 👪 Grown-ups on this
 * sign-in at once (#167), so the device goes back to the kids with nothing
 * open. (The 15 minutes run out anyway; this is the usual way it shuts.)
 */
export function useLockOnLeave(family: FamilyScreen): void {
  const last = useRef<FamilyScreen>(family);
  useEffect(() => {
    const was = last.current;
    last.current = family;
    if (GROWN_UP_SCREENS.includes(was) && (family === 'pick' || family === 'play')) void lockGrownUps();
  }, [family]);
}
