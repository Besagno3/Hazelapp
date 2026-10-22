import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Profile } from '../types';

// The profile write: a chain that always succeeds (nothing reaches Supabase).
vi.mock('../lib/supabase', () => {
  const ok = { data: null, error: null };
  const chain: Record<string, unknown> = {};
  for (const m of ['update', 'eq', 'select', 'upsert', 'maybeSingle', 'abortSignal']) chain[m] = () => chain;
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve(ok).then(res);
  return { supabase: { rpc: vi.fn(async () => ({ data: 1, error: null })), from: () => chain } };
});

const { useProfileStore } = await import('./profileStore');
const { useSaveStore } = await import('./saveStore');
const { defaultSave } = await import('../lib/save');

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

beforeEach(() => {
  localStorage.clear();
  useSaveStore.setState({ userId: 'kid-1', save: { ...defaultSave(), revision: 10 }, status: 'ready' });
});

describe("a topic's real start is noted when its level is first saved (#29 review round 2)", () => {
  it('the first save of a topic notes where it started — the level for their age now, and that age — in their save', async () => {
    useProfileStore.setState({ profile: kid() });
    await useProfileStore.getState().setSkillLevel('math', 6);
    expect(useSaveStore.getState().save?.topicStarts).toEqual({ math: { level: 4, age: 9 } });
    expect(useSaveStore.getState().save?.revision).toBe(11);
    expect(useProfileStore.getState().profile?.skillLevels).toEqual({ math: 6 });
    expect(useProfileStore.getState().profile?.skillStarts).toEqual({ math: { level: 4, age: 9 } }); // on the profile too (#174)
  });

  it('later saves of that topic never move its start — a birthday, a climb or a drop', async () => {
    useProfileStore.setState({ profile: kid() });
    await useProfileStore.getState().setSkillLevel('math', 5);
    await useProfileStore.getState().setSkillLevel('math', 7);
    // A birthday later (now 10: a new topic would start at 5) — Math keeps the start it had.
    useProfileStore.setState({ profile: { ...useProfileStore.getState().profile!, birthYear: YEAR - 10 } });
    await useProfileStore.getState().setSkillLevel('math', 3);
    await useProfileStore.getState().setSkillLevel('science', 5);
    expect(useSaveStore.getState().save?.topicStarts).toEqual({ math: { level: 4, age: 9 }, science: { level: 5, age: 10 } });
  });

  it('a topic already saved before starts were noted gets none: the page makes no claim about it', async () => {
    useProfileStore.setState({ profile: kid({ history: 2 }) });
    await useProfileStore.getState().setSkillLevel('history', 3);
    expect(useSaveStore.getState().save?.topicStarts).toEqual({});
    expect(useSaveStore.getState().save?.revision).toBe(10);
  });

  it('a start noted on another device (the save already has it) stays as it was', async () => {
    useSaveStore.setState({ save: { ...defaultSave(), revision: 10, topicStarts: { math: { level: 2, age: 7 } } } });
    useProfileStore.setState({ profile: kid() });
    await useProfileStore.getState().setSkillLevel('math', 4);
    expect(useSaveStore.getState().save?.topicStarts).toEqual({ math: { level: 2, age: 7 } });
    expect(useSaveStore.getState().save?.revision).toBe(10);
    // …and it's the start the profile notes too (#174) — never "level 4 at 9".
    expect(useProfileStore.getState().profile?.skillStarts).toEqual({ math: { level: 2, age: 7 } });
  });

  it("never into another kid's save (a Switch player mid-write)", async () => {
    useSaveStore.setState({ userId: 'kid-2' });
    useProfileStore.setState({ profile: kid() });
    await useProfileStore.getState().setSkillLevel('math', 6);
    expect(useSaveStore.getState().save?.topicStarts).toEqual({});
  });

  it('a teen starts at 6 (#156), and the age is kept as the game plays it (18 at most)', async () => {
    useProfileStore.setState({ profile: { ...kid(), birthYear: YEAR - 25 } });
    await useProfileStore.getState().setSkillLevel('words', 6);
    expect(useSaveStore.getState().save?.topicStarts.words).toEqual({ level: 6, age: 18 });
  });
});
