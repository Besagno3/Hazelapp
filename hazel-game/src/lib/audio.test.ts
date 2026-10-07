/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MUSIC_SOURCES, SFX_SOURCES, trackForScreen } from './audio';

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
});
