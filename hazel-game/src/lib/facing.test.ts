import { describe, it, expect } from 'vitest';
import { animFor, facingFor } from './facing';

describe('facingFor', () => {
  it('uses the dominant axis', () => {
    expect(facingFor(1, 0, 'down')).toBe('side');
    expect(facingFor(-1, 0.2, 'down')).toBe('side');
    expect(facingFor(0, 1, 'side')).toBe('down');
    expect(facingFor(0.3, -1, 'side')).toBe('up');
  });
  it('prefers the side view on exact diagonals', () => {
    expect(facingFor(0.7, 0.7, 'up')).toBe('side');
  });
  it('keeps the previous facing when standing still', () => {
    expect(facingFor(0, 0, 'up')).toBe('up');
  });
});

describe('animFor', () => {
  const full = { idle: 1, walk: 1, idleDown: 1, walkDown: 1, idleUp: 1, walkUp: 1 };
  it('picks the facing-specific anim', () => {
    expect(animFor('down', true, full)).toBe('walkDown');
    expect(animFor('up', false, full)).toBe('idleUp');
    expect(animFor('side', true, full)).toBe('walk');
  });
  it('falls back to side anims, then idle, for sheets without the view', () => {
    expect(animFor('up', true, { idle: 1, walk: 1 })).toBe('walk');
    expect(animFor('down', true, { idle: 1 })).toBe('idle');
  });
});
