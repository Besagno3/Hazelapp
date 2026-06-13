import { describe, it, expect } from 'vitest';
import { toKaplayAnims } from './worldSprites';

describe('toKaplayAnims', () => {
  it('maps fps→speed and defaults loop to true', () => {
    const out = toKaplayAnims({
      idle: { from: 0, to: 3, fps: 6 },
      walk: { from: 4, to: 7, fps: 10, loop: false },
    });
    expect(out.idle).toEqual({ from: 0, to: 3, loop: true, speed: 6 });
    expect(out.walk).toEqual({ from: 4, to: 7, loop: false, speed: 10 });
  });
});
