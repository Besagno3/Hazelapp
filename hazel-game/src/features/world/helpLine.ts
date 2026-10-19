/**
 * The help line under the map: how to get about and use things. A keyboard's
 * words, or on a touch screen the pad's (#130 S4, #110m) — touch players were
 * told "arrow keys / WASD". `WorldScreen` renders both and lets the `touch:`
 * screen (the main pointer is coarse) pick, the same test that shows the d-pad
 * at any width and turns the canvas's "Space:" prompts into "Tap:". Pure.
 */
export function helpLine({
  vehicle,
  touch,
  flightOffered = false,
  fogTip = false,
}: {
  vehicle: 'foot' | 'boat' | 'ember';
  touch: boolean;
  /** 🐉 Fly is on the HUD (and F flies). */
  flightOffered?: boolean;
  /** Out on the Silver Shallows' fog before Voices: go ashore and fly over it. */
  fogTip?: boolean;
}): string {
  const move = touch ? 'the arrow pad' : 'arrow keys / WASD';
  // Words a 7-year-old knows, and what to tap (#159 r1): not "foes", not "a tap".
  if (vehicle === 'ember') {
    return `Fly: ${move} · Land: ${touch ? 'tap 🛬, ✋ or the map' : 'Space, F or 🛬'} (over grass, sand or a road)`;
  }
  if (vehicle === 'boat') {
    return `Sail: ${move} · into a beach or dock to land, a critter to battle!${fogTip ? ' · to cross the fog: go ashore, then 🐉 Fly' : ''}`;
  }
  const use = touch ? 'tap ✋ or tap someone' : 'Space, Enter or a click';
  const fly = flightOffered ? (touch ? ' · 🐉 to fly' : ' · F or 🐉 to fly') : '';
  return `Walk: ${move} · ${use} to talk, open and use · bump into a critter to battle!${fly}`;
}
