import { describe, it, expect } from 'vitest';
import { stepScroll } from './stepScroll';

// The step-start scroll (UX review rounds 1 and 2, PR 13): a view 0–300 px, a stuck job line 80 px over its top.
const view = { top: 0, bottom: 300 };

describe('⚙️ the step-start scroll', () => {
  it('nothing moves when the button and what’s kept are in sight', () => {
    expect(stepScroll({ go: { top: 200, bottom: 256 }, keep: { top: 100 }, view, cover: 80, keepWins: true })).toBe(0);
  });

  it('down just far enough for the button — never so far that what’s kept goes under the line', () => {
    // The button's foot at 356: down 64. The gears at 200 can go up to 88 under the line: room enough.
    expect(stepScroll({ go: { top: 300, bottom: 356 }, keep: { top: 200 }, view, cover: 80, keepWins: true })).toBe(64);
    // The gears at 120: only 32 before they're under it — they win on Expert, the button off by 32.
    expect(stepScroll({ go: { top: 300, bottom: 356 }, keep: { top: 120 }, view, cover: 80, keepWins: true })).toBe(32);
    // On Gentle the button wins.
    expect(stepScroll({ go: { top: 300, bottom: 356 }, keep: { top: 120 }, view, cover: 80, keepWins: false })).toBe(64);
  });

  it('up, when what’s kept is under the line (UX review round 2: after Take all the gears off it was off the top)', () => {
    expect(stepScroll({ go: { top: 200, bottom: 256 }, keep: { top: 40 }, view, cover: 80, keepWins: true })).toBe(-48);
    // And when the button is: its top just under the line.
    expect(stepScroll({ go: { top: 50, bottom: 106 }, keep: null, view, cover: 80, keepWins: false })).toBe(-38);
    expect(stepScroll({ go: { top: 50, bottom: 106 }, keep: null, view, cover: 0, keepWins: false })).toBe(0);
    expect(stepScroll({ go: { top: -60, bottom: -4 }, keep: null, view, cover: 0, keepWins: false })).toBe(-68);
  });

  it('nothing kept: the button alone, as little as it takes', () => {
    expect(stepScroll({ go: { top: 280, bottom: 336 }, keep: null, view, cover: 0, keepWins: true })).toBe(44);
  });
});
