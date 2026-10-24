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
      },
      // The mini-games' big pixel titles (docs/DESIGN-MINIGAMES.md), self-hosted in public/fonts.
      fontFamily: {
        pixel: ['"Jersey 15"', '"Arial Narrow"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
