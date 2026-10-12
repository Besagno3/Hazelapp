/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Touch screens of any size (Act I review B2): a tablet or a sideways
      // phone is wider than `sm` but still has no keyboard to walk with.
      screens: {
        touch: { raw: '(any-pointer: coarse)' },
        'touch-wide': { raw: '(any-pointer: coarse) and (orientation: landscape)' },
      },
    },
  },
  plugins: [],
};
