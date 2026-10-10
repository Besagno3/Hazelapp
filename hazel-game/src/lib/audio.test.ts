/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MUSIC_SOURCES, SEA_TRACK, SFX_SOURCES, ZONE_KIND_TRACK, trackForScreen } from './audio';
import { SEA_AREAS } from '../content/boat';

describe('trackForScreen', () => {
  it('maps menu-ish screens to the title theme', () => {
    expect(trackForScreen('topics')).toBe('title');
    expect(trackForScreen('quiz')).toBe('title');
    expect(trackForScreen('avatar')).toBe('title');
  });

  it('plays overworld music in the world', () => {
    expect(trackForScreen('world')).toBe('overworld');
  });

  it('in the world, follows the kind of place you are in (#75 Phase 1)', () => {
    expect(trackForScreen('world', false, 'overworld')).toBe('overworld');
    expect(trackForScreen('world', false, 'field')).toBe('overworld');
    expect(trackForScreen('world', false, 'town')).toBe('town');
    expect(trackForScreen('world', false, 'dungeon')).toBe('cave');
    expect(trackForScreen('world', false, 'shrine')).toBe('shrine');
    // Kind only matters in the world.
    expect(trackForScreen('battle', false, 'town')).toBe('battle');
  });

  it('out on the water, each sea area has its own music (#75 item 14)', () => {
    expect(trackForScreen('world', false, 'overworld', 'dawnreach-waters')).toBe('sailing');
    expect(trackForScreen('world', false, 'overworld', 'silver-shallows')).toBe('shallows');
    expect(trackForScreen('world', false, 'overworld', 'great-fogbank')).toBe('fogbank');
    expect(trackForScreen('world', false, 'overworld', null)).toBe('overworld');
    // A battle at sea is still a battle.
    expect(trackForScreen('battle', false, 'overworld', 'silver-shallows')).toBe('battle');
    // One track per sea, none shared with a kind of place.
    const tracks = SEA_AREAS.map((a) => SEA_TRACK[a]);
    expect(new Set(tracks).size).toBe(SEA_AREAS.length);
    for (const t of tracks) expect(Object.values(ZONE_KIND_TRACK)).not.toContain(t);
  });

  it('uses the boss theme only for boss battles', () => {
    expect(trackForScreen('battle', false)).toBe('battle');
    expect(trackForScreen('battle', true)).toBe('boss');
  });
});

describe('16-bit audio set', () => {
  it('every SFX and music source points at a shipped file', () => {
    for (const src of [...Object.values(SFX_SOURCES), ...Object.values(MUSIC_SOURCES)]) {
      expect(existsSync(join(process.cwd(), 'public', decodeURI(src))), src).toBe(true);
    }
  });

  it('every audio file shipped is one the game plays — no leftover tracks (#115)', () => {
    const used = new Set([...Object.values(SFX_SOURCES), ...Object.values(MUSIC_SOURCES)].map(decodeURI));
    const root = join(process.cwd(), 'public');
    const shipped = readdirSync(join(root, 'audio'), { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(mp3|ogg|wav|m4a)$/i.test(f))
      .map((f) => `/audio/${f.split('\\').join('/')}`);
    expect(shipped.filter((f) => !used.has(f))).toEqual([]);
  });
});
