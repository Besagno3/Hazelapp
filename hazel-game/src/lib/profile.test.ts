import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  addUnreadStep,
  addUnreadXp,
  forgetLocalProfile,
  mergeProfiles,
  readLocalProfile,
  readUnreadSteps,
  writeLocalProfile,
  writeUnreadSteps,
  withoutSteps,
  profileKey,
  skillStartsFrom,
  takeUnreadSteps,
  withStepsLock,
} from './profile';
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

describe("topic starts on the profile (#174)", () => {
  it('read from skill_starts: known topics only (own keys), a whole level 1–10 and age 3–18 — the rest left out', () => {
    expect(
      skillStartsFrom({
        math: { level: 2, age: 7 },
        science: { level: 10, age: 18 },
        words: { level: 0, age: 9 },
        music: { level: 3, age: 2 },
        nature: { level: 2.5, age: 7 },
        space: 'level 2',
        constructor: { level: 1, age: 5 },
        dragons: { level: 1, age: 5 },
      }),
    ).toEqual({ math: { level: 2, age: 7 }, science: { level: 10, age: 18 } });
    expect(skillStartsFrom(null)).toEqual({});
    // The day it was noted (#183) is kept when it's a real one; a bad one is dropped alone.
    expect(skillStartsFrom({ math: { level: 2, age: 7, on: '2026-10-22' }, science: { level: 3, age: 8, on: '2026-02-30' } })).toEqual({
      math: { level: 2, age: 7, on: '2026-10-22' },
      science: { level: 3, age: 8 },
    });
    expect(skillStartsFrom([{ level: 1, age: 5 }])).toEqual({});
  });

  it("mergeProfiles keeps every start either copy noted — the server's on a clash; junk in this device's copy left out", () => {
    const remote = makeProfile({ skillStarts: { math: { level: 2, age: 7 } } });
    const local = makeProfile({ skillStarts: { math: { level: 4, age: 9 }, science: { level: 3, age: 8 }, words: { level: 0, age: 9 } } });
    expect(mergeProfiles(remote, local).skillStarts).toEqual({ math: { level: 2, age: 7 }, science: { level: 3, age: 8 } });
    expect(mergeProfiles(makeProfile(), local).skillStarts).toEqual({ math: { level: 4, age: 9 }, science: { level: 3, age: 8 } });
    // The day each was noted goes with it (#183), from either copy.
    expect(mergeProfiles(makeProfile(), makeProfile({ skillStarts: { math: { level: 4, age: 9, on: '2026-10-21' } } })).skillStarts).toEqual({
      math: { level: 4, age: 9, on: '2026-10-21' },
    });
    // Neither copy has any: none (a profile from a database without the column stays as it was).
    expect(mergeProfiles(makeProfile(), makeProfile())).not.toHaveProperty('skillStarts');
  });
});

describe('level steps played while the row was unread, kept beside the copy (#180)', () => {
  beforeEach(() => localStorage.clear());

  it('kept and read back; junk left out; none kept reads as none', () => {
    writeUnreadSteps('u1', { steps: { math: -1, science: 2 }, starts: { science: { level: 4, age: 9 } } });
    expect(readUnreadSteps('u1')).toEqual({ steps: { math: -1, science: 2 }, starts: { science: { level: 4, age: 9 } } });
    localStorage.setItem('hazel-profile-steps-u1', JSON.stringify({ steps: { math: 1.5, words: -10, cooking: 1, constructor: 1, history: 0 }, starts: { music: { level: 0, age: 9 } } }));
    expect(readUnreadSteps('u1')).toEqual({ steps: { history: 0 }, starts: {} });
    for (const raw of ['not json', 'null', '[]', '{"steps": {"math": "1"}}', '{"starts": {}}']) {
      localStorage.setItem('hazel-profile-steps-u1', raw);
      expect(readUnreadSteps('u1')).toBeNull();
    }
    expect(readUnreadSteps('nobody')).toBeNull();
  });

  it('the copy before the steps: each stepped topic back where it stood, one first played meanwhile left out', () => {
    const copy = makeProfile({ skillLevels: { math: 6, science: 8, words: 4, history: 5 } });
    expect(withoutSteps(copy, { steps: { math: -1, science: 2, history: 1 }, starts: { history: { level: 4, age: 9 } } }).skillLevels).toEqual({
      math: 7,
      science: 6,
      words: 4,
    });
  });

  it("each tab's step adds to what's kept, within 9 either way; a topic's first start kept stays; taken once (#180 review)", () => {
    expect(addUnreadStep('u1', 'math', 1, { level: 4, age: 9, on: '2026-10-22' })).toBe(true);
    expect(addUnreadStep('u1', 'math', 2, { level: 5, age: 10, on: '2026-10-22' })).toBe(true); // another tab
    addUnreadStep('u1', 'science', -1);
    expect(readUnreadSteps('u1')).toEqual({ steps: { math: 3, science: -1 }, starts: { math: { level: 4, age: 9, on: '2026-10-22' } } });
    for (let i = 0; i < 12; i++) addUnreadStep('u1', 'math', 1);
    expect(readUnreadSteps('u1')?.steps.math).toBe(9);
    // Taken: read and gone, so a second take finds none.
    expect(takeUnreadSteps('u1')?.steps).toEqual({ math: 9, science: -1 });
    expect(takeUnreadSteps('u1')).toBeNull();
  });

  it('XP earned unread is kept the same way: it adds up, the state before the first of it stays, and the copy goes back to it (#180 review)', () => {
    expect(addUnreadXp('u1', 20, { xp: 500, level: 6, levelXp: 30 })).toBe(true);
    expect(addUnreadXp('u1', 15, { xp: 520, level: 6, levelXp: 50 })).toBe(true); // another tab, or later
    const kept = readUnreadSteps('u1');
    expect(kept).toEqual({ steps: {}, starts: {}, xp: 35, from: { xp: 500, level: 6, levelXp: 30 } });
    const copy = makeProfile({ xp: 535, level: 6, levelXp: 65, skillLevels: { math: 4 } });
    expect(withoutSteps(copy, kept!)).toMatchObject({ xp: 500, level: 6, levelXp: 30, skillLevels: { math: 4 } });
    // Junk XP (or none) reads as none.
    for (const bad of [{ xp: 10 }, { xp: 1.5, from: { xp: 1, level: 1, levelXp: 0 } }, { xp: 10, from: { xp: 1, level: 0, levelXp: 0 } }]) {
      localStorage.setItem('hazel-profile-steps-u1', JSON.stringify({ steps: {}, ...bad }));
      expect(readUnreadSteps('u1')).toBeNull();
    }
  });

  it("a step that can't be kept says so (that tab then puts its own on)", () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(addUnreadStep('u1', 'math', 1)).toBe(false);
    set.mockRestore();
  });

  it("the take runs in the kid's lock where the browser has the Web Locks API, else at once — and once if the lock is refused", async () => {
    const take = vi.fn(() => 'taken');
    expect(await withStepsLock('u1', take)).toBe('taken'); // jsdom: no navigator.locks
    const request = vi.fn((_name: string, grant: () => unknown) => Promise.resolve(grant()));
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
    try {
      expect(await withStepsLock('u1', take)).toBe('taken');
      expect(request).toHaveBeenCalledWith('hazel-profile-steps-u1', expect.any(Function));
      request.mockImplementationOnce(() => Promise.reject(new DOMException('not allowed', 'SecurityError')));
      take.mockClear();
      expect(await withStepsLock('u1', take)).toBe('taken');
      expect(take).toHaveBeenCalledTimes(1);
      // A take that throws inside the lock isn't run again.
      const boom = vi.fn(() => {
        throw new Error('boom');
      });
      await expect(withStepsLock('u1', boom)).rejects.toThrow('boom');
      expect(boom).toHaveBeenCalledTimes(1);
    } finally {
      delete (navigator as { locks?: unknown }).locks;
    }
  });

  it('they go with the copy', () => {
    writeLocalProfile(makeProfile());
    writeUnreadSteps('u1', { steps: { math: -1 }, starts: {} });
    forgetLocalProfile('u1');
    expect(localStorage.getItem(profileKey('u1'))).toBeNull();
    expect(readUnreadSteps('u1')).toBeNull();
  });
});
