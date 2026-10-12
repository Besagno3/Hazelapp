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
      },
    },
  },
  plugins: [],
};
