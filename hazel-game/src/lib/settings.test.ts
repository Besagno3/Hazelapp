import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings';

describe('settings', () => {
  it('audio is off by default', () => {
    expect(DEFAULT_SETTINGS.music).toBe(false);
    expect(DEFAULT_SETTINGS.sfx).toBe(false);
  });

  it('normalizes empty / missing input to the defaults (off)', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('only literal true enables a toggle (no truthy coercion)', () => {
    expect(normalizeSettings({ music: 1 } as unknown).music).toBe(false);
    expect(normalizeSettings({ music: true }).music).toBe(true);
    expect(normalizeSettings({ sfx: 'yes' } as unknown).sfx).toBe(false);
  });

  it('clamps volumes to 0..1, falling back on garbage', () => {
    expect(normalizeSettings({ musicVolume: 0.3 }).musicVolume).toBe(0.3);
    expect(normalizeSettings({ musicVolume: 5 }).musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    expect(normalizeSettings({ sfxVolume: -1 }).sfxVolume).toBe(DEFAULT_SETTINGS.sfxVolume);
    expect(normalizeSettings({ sfxVolume: 'loud' } as unknown).sfxVolume).toBe(
      DEFAULT_SETTINGS.sfxVolume,
    );
  });
});
