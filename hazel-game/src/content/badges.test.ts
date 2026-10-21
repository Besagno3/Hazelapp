import { describe, it, expect } from 'vitest';
import { badgeInfo } from './badges';

describe('badgeInfo — what a save.badges id is called (#29, shared with the menu shelf)', () => {
  it('every kind of badge and trophy by name', () => {
    expect(badgeInfo('badge:compass')).toEqual({ name: 'Compass Badge', emoji: '🧭' });
    expect(badgeInfo('verdara-key')).toEqual({ name: 'Verdant Key', emoji: '🌿' });
    expect(badgeInfo('foglight')).toEqual({ name: 'Foglight Badge', emoji: '🌤️' });
    expect(badgeInfo('dog-badge')).toEqual({ name: 'Dog Badge', emoji: '🐕' });
    expect(badgeInfo('badge:scribe')).toEqual({ name: "Scribe's Quill", emoji: '✍️' });
    expect(badgeInfo('all-secrets-badge')).toEqual({ name: 'Secret Seeker', emoji: '🔍' });
  });

  it('an id this build doesn’t know is null — and never one of Object’s own', () => {
    expect(badgeInfo('not-a-real-badge')).toBeNull();
    expect(badgeInfo('constructor')).toBeNull();
    expect(badgeInfo('toString')).toBeNull();
  });
});
