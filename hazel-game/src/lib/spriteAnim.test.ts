import { describe, it, expect } from 'vitest';
import { frameCount, frameAt, bgPosX, cycleMs, type SpriteAnim } from './spriteAnim';

const walk: SpriteAnim = { from: 2, to: 5, fps: 8 }; // 4 frames, loops by default

describe('frameCount', () => {
  it('counts inclusive of both ends', () => {
    expect(frameCount(walk)).toBe(4);
    expect(frameCount({ from: 0, to: 0, fps: 1 })).toBe(1);
  });
});

describe('frameAt', () => {
  it('returns the first frame at t=0', () => {
    expect(frameAt(walk, 0)).toBe(2);
  });
  it('advances one frame per 1/fps seconds', () => {
    expect(frameAt(walk, 125)).toBe(3); // 1/8s = 125ms
    expect(frameAt(walk, 250)).toBe(4);
  });
  it('loops back to the start after the last frame', () => {
    expect(frameAt(walk, 500)).toBe(2); // 4 frames * 125ms = full cycle
  });
  it('clamps to the last frame when loop is false', () => {
    const once: SpriteAnim = { from: 0, to: 2, fps: 8, loop: false };
    expect(frameAt(once, 10_000)).toBe(2);
  });
});

describe('bgPosX', () => {
  it('shifts left by frame index times frame width', () => {
    expect(bgPosX(0, 32)).toBe(0);
    expect(bgPosX(3, 32)).toBe(-96);
  });
});

describe('cycleMs', () => {
  it('is frames over fps in milliseconds', () => {
    expect(cycleMs(walk)).toBe(500);
  });
});
