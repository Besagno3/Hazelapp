import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Profile } from '../types';

// Nothing reaches Supabase: every write and note succeeds.
vi.mock('../lib/supabase', () => {
  const ok = { data: null, error: null };
  const chain: Record<string, unknown> = {};
  for (const m of ['update', 'eq', 'select', 'upsert', 'maybeSingle']) chain[m] = () => chain;
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve(ok).then(res);
  return { supabase: { rpc: vi.fn(async () => ({ data: 1, error: null })), from: () => chain, functions: { invoke: vi.fn() } } };
});

const { useProfileStore } = await import('./profileStore');
const { playDayRecords } = await import('../lib/playDays');
const { inQuestionBank } = await import('../lib/questions');
const { todayIso } = await import('../lib/streak');

// Born in January 9 years ago: 9 today, so a topic not saved yet stands at level 4.
const YEAR = new Date().getFullYear();
const kid = (skillLevels: Profile['skillLevels'] = {}): Profile => ({
  id: 'kid-1',
  birthYear: YEAR - 9,
  birthMonth: 1,
  skillLevels,
  xp: 0,
  level: 1,
  levelXp: 0,
  powerUps: {},
  currentStreak: 0,
  longestStreak: 0,
  lastPlayedOn: null,
});
const tally = (topic: string) => playDayRecords('kid-1')[0]?.topics[topic];

beforeEach(() => {
  localStorage.clear();
  useProfileStore.setState({ profile: kid({ math: 6 }), unread: null });
});

describe("answers per topic for the kid's day (#173)", () => {
  it("counted with the topic's level now — or, for a topic not saved yet, the start for their age", () => {
    const { noteAnswer } = useProfileStore.getState();
    noteAnswer({ id: 'q-1', topic: 'math' }, true);
    noteAnswer({ id: 'q-2', topic: 'math' }, false);
    noteAnswer({ id: 'q-3', topic: 'space' }, true);
    expect(playDayRecords('kid-1')).toEqual([
      { day: todayIso(), xp: 0, minutes: 0, topics: { math: { a: 2, r: 1, l: 6 }, space: { a: 1, r: 1, l: 4 } } },
    ]);
  });

  it('bank questions only — the starters repeat, so knowing them says little (the rule inQuestionBank follows)', () => {
    const ids = ['bank-uuid-1', 'starter-math-2-1', 'fresh-1700000000-0', ''];
    for (const id of ids) useProfileStore.getState().noteAnswer({ id, topic: 'math' }, true);
    const counted = ids.filter((id) => inQuestionBank(id)).length;
    expect(counted).toBe(1);
    expect(tally('math')).toEqual({ a: counted, r: counted, l: 6 });
  });

  it('nobody playing: nothing noted', () => {
    useProfileStore.setState({ profile: null });
    useProfileStore.getState().noteAnswer({ id: 'q-1', topic: 'math' }, true);
    expect(playDayRecords('kid-1')).toEqual([]);
  });

  it("a level saved is the day's level for the topic (setSkillLevel → the day's record)", async () => {
    useProfileStore.getState().noteAnswer({ id: 'q-1', topic: 'math' }, true);
    await useProfileStore.getState().setSkillLevel('math', 7);
    expect(tally('math')).toEqual({ a: 1, r: 1, l: 7 });
  });
});

describe('noting an answer never gets in the way of answering', () => {
  it('a profile cached by an older build without its levels: the answer counts, nothing throws', () => {
    useProfileStore.setState({ profile: { ...kid(), skillLevels: undefined } as unknown as Profile });
    expect(() => useProfileStore.getState().noteAnswer({ id: 'q-1', topic: 'math' }, true)).not.toThrow();
    expect(tally('math')).toEqual({ a: 1, r: 1, l: 4 });
  });
});
