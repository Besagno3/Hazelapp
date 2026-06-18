import { describe, it, expect } from 'vitest';
import { trackForScreen } from './audio';

describe('trackForScreen', () => {
  it('maps menu-ish screens to the title theme', () => {
    expect(trackForScreen('topics')).toBe('title');
    expect(trackForScreen('quiz')).toBe('title');
    expect(trackForScreen('avatar')).toBe('title');
  });

  it('plays overworld music in the world', () => {
    expect(trackForScreen('world')).toBe('overworld');
  });

  it('uses the boss theme only for boss battles', () => {
    expect(trackForScreen('battle', false)).toBe('battle');
    expect(trackForScreen('battle', true)).toBe('boss');
  });
});
