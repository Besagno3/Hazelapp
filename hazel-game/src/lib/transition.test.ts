import { describe, it, expect } from 'vitest';
import { exitSide, slideFrom } from './transition';

describe('exitSide', () => {
  it('names the map edge an exit is on', () => {
    expect(exitSide(10, 0, 22, 14)).toBe('north');
    expect(exitSide(10, 13, 22, 14)).toBe('south');
    expect(exitSide(0, 6, 22, 14)).toBe('west');
    expect(exitSide(21, 6, 22, 14)).toBe('east');
  });
  it('is null for an exit inside the map', () => {
    expect(exitSide(5, 5, 22, 14)).toBeNull();
  });
});

describe('slideFrom', () => {
  it('brings the new screen in from the side the hero walks toward', () => {
    expect(slideFrom('east')).toEqual({ x: 1, y: 0 });
    expect(slideFrom('west')).toEqual({ x: -1, y: 0 });
    expect(slideFrom('north')).toEqual({ x: 0, y: -1 });
    expect(slideFrom('south')).toEqual({ x: 0, y: 1 });
  });
});
