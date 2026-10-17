// The encounter flash's timing and words (#158 review); drawn by BattleIntro.

/** How long the encounter flash lasts (#158 review): it covers the first questions' wait. */
export const INTRO_MS = 1000;
/** Under reduced motion: a plain fade, no flashing. */
export const INTRO_STILL_MS = 400;
/** Dark bars that sweep the screen. */
export const BARS = 8;

/** What the opening says. */
export function introLine(name: string, isBoss: boolean): string {
  return isBoss ? `☠️ ${name} blocks your path!` : `⚔️ ${name} appears!`;
}
