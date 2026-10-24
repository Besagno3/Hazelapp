/**
 * Whether the last thing the kid did was a key, not a pointer — for a game's
 * focus moved from script, whose ring should show for the keyboard only
 * (`:focus-visible` matches after a mouse click on the title card's button
 * too: Ember Air Mail's code review round 2). Listening from the stage's
 * load, so a key pressed on the title card counts.
 */
let keyed = false;
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', () => void (keyed = true), true);
  document.addEventListener('pointerdown', () => void (keyed = false), true);
}

export const lastInputWasKey = () => keyed;
