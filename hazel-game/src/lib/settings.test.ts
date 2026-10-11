import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings';

describe('settings', () => {
  it('music is on by default, sound effects off', () => {
    expect(DEFAULT_SETTINGS.music).toBe(true);
    expect(DEFAULT_SETTINGS.sfx).toBe(false);
  });

  it('normalizes empty / missing input to the defaults (music on, sound effects off)', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('a choice sticks: music turned off stays off, sound effects turned on stay on', () => {
    expect(normalizeSettings({ music: false }).music).toBe(false);
    expect(normalizeSettings({ music: true }).music).toBe(true);
    expect(normalizeSettings({ sfx: true }).sfx).toBe(true);
    expect(normalizeSettings({ sfx: false }).sfx).toBe(false);
  });

  it('a toggle that is not a boolean falls back to its default (no truthy coercion)', () => {
    expect(normalizeSettings({ music: 0 } as unknown).music).toBe(true);
    expect(normalizeSettings({ music: 'off' } as unknown).music).toBe(true);
    expect(normalizeSettings({ sfx: 'yes' } as unknown).sfx).toBe(false);
    expect(normalizeSettings({ sfx: 1 } as unknown).sfx).toBe(false);
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
