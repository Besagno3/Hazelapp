/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Touch screens of any size (Act I review B2): a tablet or a sideways
      // phone is wider than `sm` but still has no keyboard to walk with.
      // The main pointer only, as WorldCanvas uses for its "Tap:" prompts:
      // a touchscreen laptop used as a laptop keeps its keyboard, no pad.
      screens: {
        touch: { raw: '(pointer: coarse)' },
        'touch-wide': { raw: '(pointer: coarse) and (orientation: landscape)' },
        // Echo's Call's two columns (chimes and steps beside the host): a screen 768 px wide, or a phone on its side
        // from 640 — narrower tall windows stack like a phone (PR 5: its steps were squeezed beside the chimes).
        split: { raw: '(min-width: 768px), (min-width: 640px) and (max-height: 500px)' },
        // Ember Air Mail's board beside its side panel: from 768 px wide with height, or from 1000 px — a phone held
        // sideways (844 × 390) gives its map the screen's width (PR 9 review round 2: the world's map was 290 × 145).
        wide: { raw: '(min-width: 768px) and (min-height: 501px), (min-width: 1000px)' },
        // The Potion Lab's counter of jars, under its scene, where its jars fit (PR 11 review round 1): from 501 px high
        // where they're one row (6 from 780 px wide, 9 from 924, 12 from 1280), else from 621 px high (12 at 1024 px from
        // 541) — under that, two rows ran under the scene (640 × 505), so the jars are in the step card.
        'jars-6': { raw: '(min-width: 780px) and (min-height: 501px), (min-width: 640px) and (min-height: 621px)' },
        'jars-9': { raw: '(min-width: 924px) and (min-height: 501px), (min-width: 640px) and (min-height: 621px)' },
        'jars-12': { raw: '(min-width: 1280px) and (min-height: 501px), (min-width: 1024px) and (min-height: 541px), (min-width: 640px) and (min-height: 621px)' },
      },
      // The mini-games' big pixel titles (docs/DESIGN-MINIGAMES.md), self-hosted in public/fonts.
      fontFamily: {
        pixel: ['"Jersey 15"', '"Arial Narrow"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
