/**
 * The mini-game stage's look (docs/DESIGN-MINIGAMES.md §2): the game's own
 * dialog window (navy, a white frame, an ink rim), gold buttons that press
 * down, and pixel titles. Shared by the stage and every game.
 */

/** The ink every outline and pixel shadow is drawn in. */
export const INK = '#1b0f22';

/**
 * A keyboard's focus, plain to see on gold, navy or wood (review round 1: the
 * browser's 1 px ring didn't show on a gold button). On every button here.
 */
export const focusRing =
  'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-cyan-300';

/** A navy window with a white frame and an ink rim. */
export const windowClass = 'bg-[#2a2766] border-[3px] border-white rounded-xl shadow-[0_0_0_3px_#1b0f22]';

/** The gold button — the one thing to do next. */
export const goldClass =
  'min-h-11 inline-flex items-center justify-center gap-2 rounded-lg border-[3px] border-[#1b0f22] bg-amber-300 px-5 font-bold text-[#1b0f22] shadow-[0_4px_0_#1b0f22] hover:bg-amber-200 active:translate-y-0.5 active:shadow-[0_2px_0_#1b0f22] disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:bg-[#8f8aa8] aria-disabled:hover:bg-[#8f8aa8] ' + focusRing;

/** A quiet button beside it (Back, Try another). */
export const outlineClass =
  'min-h-11 inline-flex items-center justify-center gap-2 rounded-lg border-[3px] border-white bg-transparent px-5 font-bold text-white hover:bg-white/10 ' + focusRing;

/** A big pixel title with an ink outline. */
export const pixelTitleClass =
  'font-pixel font-normal leading-none tracking-wide text-amber-300 [text-shadow:3px_3px_0_#1b0f22,-2px_-2px_0_#1b0f22,2px_-2px_0_#1b0f22,-2px_2px_0_#1b0f22]';

/** A smaller pixel heading inside a window. */
export const pixelHeadClass = 'font-pixel font-normal leading-none tracking-wide text-amber-200';
