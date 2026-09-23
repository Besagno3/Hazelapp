/// <reference types="node" />
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

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AVATARS } from './avatars';
import { ENEMY_DEFS, spawnEnemy } from './enemies';
import { NPC_DEFS, npcSpriteId } from './npcs';
import { EMBER_SPRITE_IDS, EMBER_SPRITES } from './story';

/** Width/height from a PNG's IHDR chunk (bytes 16-23). */
function pngSize(publicPath: string): { w: number; h: number } {
  const buf = readFileSync(join(process.cwd(), 'public', publicPath));
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('generated 16-bit sprite set', () => {
  it('every manifest sheet exists and is exactly frames × frameW wide', () => {
    for (const [id, def] of Object.entries(SPRITES)) {
      for (const view of [def.world, def.battle]) {
        if (!view) continue;
        expect(existsSync(join(process.cwd(), 'public', view.sheet)), `${id} ${view.sheet}`).toBe(true);
        const { w, h } = pngSize(view.sheet);
        expect(w, `${id} sheet width`).toBe(view.frames * view.frameW);
        expect(h, `${id} sheet height`).toBe(view.frameH);
      }
    }
  });
  it('every hero has world (idle+walk) and battle (idle+attack+hurt) art', () => {
    for (const a of AVATARS) {
      const def = resolveSprite(a.spriteId, a.sprite).def;
      expect(def?.world?.anims.walk, `${a.name} walk`).toBeDefined();
      expect(def?.battle?.anims.attack, `${a.name} attack`).toBeDefined();
      expect(def?.battle?.anims.hurt, `${a.name} hurt`).toBeDefined();
    }
  });
  it('every enemy resolves to world + battle art through spawnEnemy', () => {
    for (const id of Object.keys(ENEMY_DEFS)) {
      const e = spawnEnemy(id, 'lumina-field', 'test', 9);
      const def = resolveSprite(e.spriteId, e.sprite).def;
      expect(def?.world, `${id} world`).toBeDefined();
      expect(def?.battle, `${id} battle`).toBeDefined();
    }
  });
  it('every NPC resolves to world art', () => {
    for (const def of Object.values(NPC_DEFS)) {
      expect(resolveSprite(npcSpriteId(def), def.sprite).def?.world, def.id).toBeDefined();
    }
  });
  it('every Ember stage has world + battle art', () => {
    for (const stage of ['egg', 'hatchling', 'whelp', 'dragon'] as const) {
      const def = resolveSprite(EMBER_SPRITE_IDS[stage], EMBER_SPRITES[stage]).def;
      expect(def?.world && def?.battle, stage).toBeTruthy();
    }
  });
});

describe('character → sprite resolution', () => {
  it('avatars resolve', () => {
    for (const a of AVATARS) {
      const r = resolveSprite(a.spriteId, a.sprite);
      expect(r.emoji).toBeTruthy();
    }
  });
  it('enemy defs resolve', () => {
    for (const e of Object.values(ENEMY_DEFS)) {
      const r = resolveSprite(e.spriteId, e.sprite);
      expect(r.emoji).toBeTruthy();
    }
  });
  it('every Ember stage has an id-map entry and an emoji fallback', () => {
    for (const stage of ['egg', 'hatchling', 'whelp', 'dragon'] as const) {
      expect(EMBER_SPRITE_IDS[stage]).toBeTruthy();
      const r = resolveSprite(EMBER_SPRITE_IDS[stage], EMBER_SPRITES[stage]);
      expect(r.emoji).toBeTruthy();
    }
  });
});
