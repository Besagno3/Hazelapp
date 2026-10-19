/**
 * The `ModalLayer`s up now, oldest first: the last one is on top (the
 * level-up over the Menu). `ModalLayer` adds itself on mount and leaves on
 * unmount; this module only keeps the list, so a story panel can use it too.
 */
export const layers: HTMLElement[] = [];

/**
 * Something on top just closed (a level-up, a story) and focus fell to
 * nothing — its button went with it: the layer now on top takes focus, so a
 * keyboard or a screen reader isn't left on the page behind an open Library
 * (#159 r2). With no layer up, focus goes to the page's keys home, if it has
 * one (`data-keys-home`: the world's stage, a region that owns no keys): the
 * next Space is still the world's, but a screen reader hears where it is and
 * the next Tab lands in the HUD, not up at the top bar's Switch player.
 */
export function refocusTopLayer() {
  const now = document.activeElement;
  if (now && now !== document.body) return;
  for (let i = layers.length - 1; i >= 0; i--) {
    const el = layers[i];
    // One closing in the same go is still listed until its own cleanup runs.
    if (!el.isConnected) continue;
    if (!el.closest('[inert]')) el.focus({ preventScroll: true });
    return;
  }
  const home = document.querySelector<HTMLElement>('[data-keys-home]');
  if (home && !home.closest('[inert]')) home.focus({ preventScroll: true });
}
