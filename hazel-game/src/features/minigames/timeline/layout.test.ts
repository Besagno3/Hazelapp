import { describe, it, expect } from 'vitest';
import { startScroll, type StartView } from './layout';

// Positions as the game measures them (px, in the scroller), at the sizes the reviews benched.
const at = (v: Partial<StartView> & Pick<StartView, 'step' | 'view'>): number => startScroll({ top: 0, go: 0, foot: 1e4, bar: 0, ...v });

describe('📜 the scroll as a step starts (code review round 2: untested, and it hid the line)', () => {
  it('placing, every card in sight: no scroll for the words under them (1024 × 768: 80 px for the how-to)', () => {
    expect(at({ step: 'place', view: 716, go: 520, line: { top: 16, bottom: 140 }, cards: { top: 176, bottom: 690 } })).toBe(0);
  });

  it('placing, the cards too many for the screen: the line’s top kept in sight (800 × 600: it went off the top)', () => {
    expect(at({ step: 'place', view: 470, go: 300, line: { top: 16, bottom: 150 }, cards: { top: 170, bottom: 640 } })).toBe(16);
  });

  it('placing on a short screen: the cards’ last row clear of the bar kept at the foot, their first’s top in sight', () => {
    // The line beside the cards (a phone held upright): no cap.
    expect(at({ step: 'place', view: 600, bar: 120, line: { top: 100, bottom: 700 }, cards: { top: 100, bottom: 560 } })).toBe(88);
    expect(at({ step: 'place', view: 300, bar: 120, cards: { top: 40, bottom: 400 } })).toBe(40);
    // Never past the board's foot.
    expect(at({ step: 'place', view: 300, bar: 120, foot: 20, cards: { top: 40, bottom: 400 } })).toBe(20);
  });

  it('the years and filed on a short screen: the line’s years clear of the bar, its top in sight (568 × 320: all under it)', () => {
    // Scrolled just enough that the line's foot clears the bar…
    expect(at({ step: 'span', view: 320, top: 0, bar: 150, line: { top: 40, bottom: 200 } })).toBe(38);
    // …but where it can't, its top kept in sight.
    expect(at({ step: 'span', view: 300, top: 0, bar: 150, line: { top: 10, bottom: 250 } })).toBe(10);
    expect(at({ step: 'done', view: 320, top: 0, bar: 100, line: { top: 40, bottom: 140 } })).toBe(0);
  });

  it('the years and filed elsewhere: the box under the answers, or Next, in sight — never above the board', () => {
    expect(at({ step: 'span', view: 600, top: 50, go: 900, line: { top: 60, bottom: 400 } })).toBe(312);
    expect(at({ step: 'done', view: 600, top: 50, go: 300 })).toBe(50);
  });
});
