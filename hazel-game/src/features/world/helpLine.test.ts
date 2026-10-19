import { describe, it, expect } from 'vitest';
import { helpLine } from './helpLine';

describe('the help line under the map (#130 S4, #110m)', () => {
  it('walking: the keyboard words as before, or on a touch screen the pad and ✋ — never "arrow keys / WASD"', () => {
    expect(helpLine({ vehicle: 'foot', touch: false })).toBe(
      'Walk: arrow keys / WASD · Space, Enter or a click to talk, open and use · walk into foes to battle!',
    );
    const touch = helpLine({ vehicle: 'foot', touch: true });
    expect(touch).toBe('Walk: the arrow pad · ✋ or a tap to talk, open and use · walk into foes to battle!');
    expect(touch).not.toMatch(/WASD|arrow keys|Space|Enter|click/);
  });

  it('once Ember can fly: F or 🐉 on a keyboard, just 🐉 on a touch screen', () => {
    expect(helpLine({ vehicle: 'foot', touch: false, flightOffered: true })).toMatch(/ · F or 🐉 to fly$/);
    expect(helpLine({ vehicle: 'foot', touch: true, flightOffered: true })).toMatch(/battle! · 🐉 to fly$/);
  });

  it('sailing: the pad steers the boat; the fog tip is the same for both', () => {
    expect(helpLine({ vehicle: 'boat', touch: false })).toBe('Sail: arrow keys / WASD · into a beach or dock to land, a critter to battle!');
    expect(helpLine({ vehicle: 'boat', touch: true, fogTip: true })).toBe(
      'Sail: the arrow pad · into a beach or dock to land, a critter to battle! · to cross the fog: go ashore, then 🐉 Fly',
    );
  });

  it('flying: lands with 🛬, ✋ or a tap on a touch screen (Space or F need a keyboard)', () => {
    expect(helpLine({ vehicle: 'ember', touch: false })).toBe('Fly: arrow keys / WASD · Land: Space, F or 🛬 (over grass, sand or a road)');
    const touch = helpLine({ vehicle: 'ember', touch: true });
    expect(touch).toBe('Fly: the arrow pad · Land: 🛬, ✋ or a tap (over grass, sand or a road)');
    expect(touch).not.toMatch(/Space|\bF\b|WASD/);
  });
});
