import { describe, it, expect } from 'vitest';
import { blendSheetsFor, toKaplayAnims, worldFace, worldKey } from './worldSprites';
import { SPRITES } from '../../content/sprites';
import { ZONES } from '../../content/zones';
import { floorZone } from '../../content/spire';

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

describe('blendSheetsFor (#71b)', () => {
  it("a zone's own edge-blend sheet plus every neighbour's, each once", () => {
    expect(blendSheetsFor(ZONES['lumina-village'])).toEqual(['lumina-village', 'dawnreach']);
    const dawn = blendSheetsFor(ZONES.dawnreach);
    expect(dawn[0]).toBe('dawnreach');
    expect(new Set(dawn).size).toBe(dawn.length);
    expect(dawn).toEqual(expect.arrayContaining(ZONES.dawnreach.exits.map((e) => e.to)));
  });
  it("none for the Spire's floors (they don't blend)", () => {
    expect(blendSheetsFor(floorZone('archive'))).toEqual([]);
  });
});

// ── worldFace with a stand-in KaPlay (sprite review B1, B3, C5) ──────────────
type FakeObj = { comps: unknown[]; alive: boolean; children: unknown[][]; played: string[]; exists: () => boolean; add: (c: unknown[]) => void; play: (n: string) => void };
type Sheet = { data: unknown; error: Error | null; load: (() => void)[]; fail: (() => void)[]; onLoad: (f: () => void) => void; onError: (f: () => void) => void };
/** A sheet in one of KaPlay's states: loaded, failed, or still loading (call `load` / `fail` to finish it). */
function sheet(state: 'loaded' | 'failed' | 'loading'): Sheet {
  const s: Sheet = {
    data: state === 'loaded' ? {} : null,
    error: state === 'failed' ? new Error('404') : null,
    load: [],
    fail: [],
    onLoad: (f) => s.load.push(f),
    onError: (f) => s.fail.push(f),
  };
  return s;
}
function fakeK(s: Sheet | null) {
  const added: FakeObj[] = [];
  const k = {
    getSprite: () => s,
    add: (comps: unknown[]) => {
      const obj: FakeObj = {
        comps,
        alive: true,
        children: [],
        played: [],
        exists: () => obj.alive,
        add: (c) => obj.children.push(c),
        play: (n) => obj.played.push(n),
      };
      added.push(obj);
      return obj;
    },
    sprite: (key: string) => ({ sprite: key }),
    text: (text: string, o: { size: number }) => ({ text, ...o }),
    pos: (x: number, y: number) => ({ pos: [x, y] }),
    anchor: (a: string) => ({ anchor: a }),
    z: (n: number) => ({ z: n }),
  };
  return { k: k as unknown as Parameters<typeof worldFace>[0], added };
}
const spriteId = Object.keys(SPRITES).find((id) => SPRITES[id].world)!;
const hasText = (cs: unknown[]) => cs.some((c) => (c as { text?: string }).text === '🦊');

describe('worldFace (sprite review B1, B3)', () => {
  it('a loaded sheet: the sprite, playing idle at once', () => {
    const { k, added } = fakeK(sheet('loaded'));
    const face = worldFace(k, { spriteId, emoji: '🦊', x: 1, y: 2 });
    expect(face.isSprite).toBe(true);
    expect(added[0].played).toEqual(['idle']);
    expect(added[0].comps).toContainEqual({ sprite: worldKey(spriteId) });
  });

  it('a sheet that already failed (a 404): the emoji, not an invisible sprite', () => {
    const { k, added } = fakeK(sheet('failed'));
    const face = worldFace(k, { spriteId, emoji: '🦊', x: 1, y: 2 });
    expect(face.isSprite).toBe(false);
    expect(hasText(added[0].comps)).toBe(true);
  });

  it('a sheet still loading: idle plays once it lands — never on an object a zone change destroyed', () => {
    const s = sheet('loading');
    const { k, added } = fakeK(s);
    worldFace(k, { spriteId, emoji: '🦊', x: 1, y: 2 });
    worldFace(k, { spriteId, emoji: '🦊', x: 3, y: 4 });
    expect(added.map((o) => o.played)).toEqual([[], []]);
    added[1].alive = false; // destroyAll before the sheet arrived
    s.load.forEach((f) => f());
    expect(added[0].played).toEqual(['idle']);
    expect(added[1].played).toEqual([]);
  });

  it('a sheet that fails while loading: the emoji drawn on the face, so the character still shows', () => {
    const s = sheet('loading');
    const { k, added } = fakeK(s);
    const face = worldFace(k, { spriteId, emoji: '🦊', x: 1, y: 2, size: 24 });
    expect(face.isSprite).toBe(true);
    s.fail.forEach((f) => f());
    expect(added[0].children).toHaveLength(1);
    expect(added[0].children[0]).toContainEqual({ text: '🦊', size: 24 });
    expect(added[0].played).toEqual([]);
  });

  it('no sprite for the id: the emoji, and the sheet is never asked about', () => {
    const { k, added } = fakeK(null);
    expect(worldFace(k, { spriteId: 'no-such-sprite', emoji: '🦊', x: 0, y: 0 }).isSprite).toBe(false);
    expect(hasText(added[0].comps)).toBe(true);
  });
});
