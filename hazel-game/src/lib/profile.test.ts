import { describe, it, expect, beforeEach } from 'vitest';
import { mergeProfiles, readLocalProfile, writeLocalProfile, profileKey } from './profile';
import type { Profile } from '../types';

function makeProfile(over: Partial<Profile> = {}): Profile {
  return {
    id: 'u1',
    birthYear: 2015,
    birthMonth: 3,
    skillLevels: {},
    xp: 0,
    powerUps: {},
    currentStreak: 0,
    longestStreak: 0,
    lastPlayedOn: null,
    ...over,
  };
}

describe('local profile cache', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips through localStorage', () => {
    const p = makeProfile({ xp: 4200 });
    writeLocalProfile(p);
    expect(localStorage.getItem(profileKey('u1'))).not.toBeNull();
    expect(readLocalProfile('u1')).toEqual(p);
  });

  it('returns null when nothing is cached', () => {
    expect(readLocalProfile('nobody')).toBeNull();
  });
});

describe('mergeProfiles', () => {
  it('keeps the higher XP (protects a kid from a remote row stuck at 0)', () => {
    const remote = makeProfile({ xp: 0 });
    const local = makeProfile({ xp: 4200 }); // level ~23 worth of XP
    expect(mergeProfiles(remote, local).xp).toBe(4200);
  });

  it('keeps the higher XP when the remote is ahead', () => {
    expect(mergeProfiles(makeProfile({ xp: 500 }), makeProfile({ xp: 100 })).xp).toBe(500);
  });

  it('returns the remote unchanged when there is no local cache', () => {
    const remote = makeProfile({ xp: 300 });
    expect(mergeProfiles(remote, null)).toEqual(remote);
  });

  it('ignores a local cache for a different user', () => {
    const remote = makeProfile({ id: 'u1', xp: 10 });
    const local = makeProfile({ id: 'u2', xp: 9999 });
    expect(mergeProfiles(remote, local).xp).toBe(10);
  });

  it('merges skill levels, power-ups, and streaks by max', () => {
    const remote = makeProfile({
      skillLevels: { math: 2, space: 5 },
      powerUps: { attack: 1 },
      currentStreak: 1,
      longestStreak: 3,
    });
    const local = makeProfile({
      skillLevels: { math: 4, nature: 1 },
      powerUps: { attack: 3, scholar: 2 },
      currentStreak: 2,
      longestStreak: 2,
    });
    const merged = mergeProfiles(remote, local);
    expect(merged.skillLevels).toEqual({ math: 4, space: 5, nature: 1 });
    expect(merged.powerUps).toEqual({ attack: 3, scholar: 2 });
    expect(merged.currentStreak).toBe(2);
    expect(merged.longestStreak).toBe(3);
  });
});
