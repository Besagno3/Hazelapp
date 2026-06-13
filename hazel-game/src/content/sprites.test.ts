import { describe, it, expect } from 'vitest';
import { SPRITES, resolveSprite, type SpriteView } from './sprites';

function checkView(view: SpriteView, label: string) {
  expect(view.frameW, `${label} frameW`).toBeGreaterThan(0);
  expect(view.frameH, `${label} frameH`).toBeGreaterThan(0);
  expect(view.frames, `${label} frames`).toBeGreaterThan(0);
  expect(view.sheet, `${label} sheet path`).toMatch(/^\/sprites\/.+\.png$/);
  expect(view.anims.idle, `${label} must define an 'idle' anim`).toBeDefined();
  for (const [name, a] of Object.entries(view.anims)) {
    expect(a.from, `${label}.${name} from`).toBeGreaterThanOrEqual(0);
    expect(a.to, `${label}.${name} to >= from`).toBeGreaterThanOrEqual(a.from);
    expect(a.to, `${label}.${name} to < frames`).toBeLessThan(view.frames);
    expect(a.fps, `${label}.${name} fps`).toBeGreaterThan(0);
  }
}

describe('SPRITES manifest', () => {
  it('every entry has a non-empty emoji fallback and well-formed views', () => {
    for (const [id, def] of Object.entries(SPRITES)) {
      expect(def.emoji, `${id} emoji fallback`).toBeTruthy();
      if (def.world) checkView(def.world, `${id}.world`);
      if (def.battle) checkView(def.battle, `${id}.battle`);
    }
  });
});

describe('resolveSprite', () => {
  it('falls back to the emoji when the id is undefined', () => {
    const r = resolveSprite(undefined, '🦁');
    expect(r.def).toBeNull();
    expect(r.emoji).toBe('🦁');
  });
  it('falls back to the emoji when the id is unknown', () => {
    const r = resolveSprite('does-not-exist', '🐢');
    expect(r.def).toBeNull();
    expect(r.emoji).toBe('🐢');
  });
});
