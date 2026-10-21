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

  it('keeps the further saved level', () => {
    const remote = makeProfile({ xp: 300, level: 3, levelXp: 20 });
    const local = makeProfile({ xp: 400, level: 3, levelXp: 90 });
    const merged = mergeProfiles(remote, local);
    expect(merged.level).toBe(3);
    expect(merged.levelXp).toBe(90);
  });

  it("keeps a pre-save cache's old level against a fresh remote row", () => {
    // The local cache predates saved levels: 1000 XP was level 11 on the old curve.
    const remote = makeProfile({ xp: 0, level: 1, levelXp: 0 });
    const local = makeProfile({ xp: 1000 });
    expect(mergeProfiles(remote, local)).toMatchObject({ level: 11, levelXp: 0 });
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

  it('keeps a streak with the day it ended on — never days nobody played (#171)', () => {
    // A cached "5 days, last 10 Oct" and the server's "1 day, last 20 Oct": the later copy's streak, not "5 days to 20 Oct".
    const cached = makeProfile({ currentStreak: 5, longestStreak: 5, lastPlayedOn: '2026-10-10' });
    const server = makeProfile({ currentStreak: 1, longestStreak: 4, lastPlayedOn: '2026-10-20' });
    expect(mergeProfiles(server, cached)).toMatchObject({ currentStreak: 1, lastPlayedOn: '2026-10-20', longestStreak: 5 });
    expect(mergeProfiles(cached, server)).toMatchObject({ currentStreak: 1, lastPlayedOn: '2026-10-20', longestStreak: 5 });
    // The same last day: the longer streak (a device that noted more of it).
    const sameDay = makeProfile({ currentStreak: 3, longestStreak: 3, lastPlayedOn: '2026-10-20' });
    expect(mergeProfiles(server, sameDay)).toMatchObject({ currentStreak: 3, lastPlayedOn: '2026-10-20' });
  });
});
