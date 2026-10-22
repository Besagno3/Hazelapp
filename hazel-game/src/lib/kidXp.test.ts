import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface Row {
  xp: number | null;
  level: number | null;
  level_xp: number | null;
  current_streak: number | null;
  longest_streak: number | null;
  last_played_on: string | null;
}

// A sibling's `profiles` row, stood in for: reads, guarded updates, failures,
// and another device writing between the read and the update.
const db = vi.hoisted(() => ({
  row: null as Row | null,
  readError: null as { message: string } | null,
  /** Updates that find the row changed (another device wrote XP first) before one goes through. */
  raced: 0,
  updates: [] as Record<string, unknown>[],
  reads: 0,
}));
vi.mock('./supabase', () => {
  const update = (values: Record<string, unknown>) => {
    const guarded = (xp: number | null) => ({
      select: async () => {
        if (db.raced > 0) {
          db.raced -= 1;
          db.row = { ...db.row!, xp: (db.row!.xp ?? 0) + 5 };
          return { data: [], error: null };
        }
        if (!db.row || db.row.xp !== xp) return { data: [], error: null };
        db.updates.push(values);
        db.row = { ...db.row, ...(values as Partial<Row>) };
        return { data: [{ id: 'kid-2' }], error: null };
      },
    });
    return { eq: () => ({ eq: (_col: string, xp: number) => guarded(xp), is: () => guarded(null) }) };
  };
  return {
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              db.reads += 1;
              return db.readError ? { data: null, error: db.readError } : { data: db.row, error: null };
            },
          }),
        }),
        update,
      }),
    },
  };
});
const { notePlayDay } = vi.hoisted(() => ({ notePlayDay: vi.fn(async () => {}) }));
vi.mock('./playDays', () => ({ notePlayDay }));

const { giveKidXp, kidXpWords, owedXp, takeOwedXp, xpStartsLine, GUARD_TRIES } = await import('./kidXp');
const { profileKey } = await import('./profile');

const TODAY = '2026-10-22';
const row = (over: Partial<Row> = {}): Row => ({
  xp: 90,
  level: 1,
  level_xp: 90,
  current_streak: 2,
  longest_streak: 4,
  last_played_on: '2026-10-21',
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 22, 15), toFake: ['Date'] });
  db.row = row();
  db.readError = null;
  db.raced = 0;
  db.updates = [];
  db.reads = 0;
  notePlayDay.mockClear();
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("giveKidXp — a sibling's XP, to their own game", () => {
  it('adds it to their row — the level rolling over — and today counts as played', async () => {
    expect(await giveKidXp('kid-2', 30)).toEqual({ saved: true, level: 2, leveledUp: true });
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]).toMatchObject({
      xp: 120,
      level: 2,
      level_xp: 20,
      current_streak: 3,
      longest_streak: 4,
      last_played_on: TODAY,
    });
    expect(notePlayDay).toHaveBeenCalledWith('kid-2', TODAY);
  });

  it('a row with no saved level counts from the old flat curve', async () => {
    db.row = row({ xp: 250, level: null, level_xp: null });
    expect(await giveKidXp('kid-2', 10)).toEqual({ saved: true, level: 3, leveledUp: false });
    expect(db.updates[0]).toMatchObject({ xp: 260, level: 3, level_xp: 60 });
  });

  it('never writes over XP another device added in between: it reads again and adds on top', async () => {
    db.raced = 1;
    expect(await giveKidXp('kid-2', 30)).toMatchObject({ saved: true });
    expect(db.reads).toBe(2);
    expect(db.row?.xp).toBe(125);
  });

  it("a row that keeps changing, or a read that fails, keeps the XP owed on this device — and the next gift brings it", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.raced = GUARD_TRIES;
    expect(await giveKidXp('kid-2', 30)).toEqual({ saved: false });
    expect(owedXp('kid-2')).toBe(30);
    db.readError = { message: 'offline' };
    expect(await giveKidXp('kid-2', 20)).toEqual({ saved: false });
    expect(owedXp('kid-2')).toBe(50);
    expect(warn).toHaveBeenCalled();
    db.readError = null;
    db.row = row();
    await giveKidXp('kid-2', 10);
    expect(db.updates.at(-1)).toMatchObject({ xp: 150 });
    expect(owedXp('kid-2')).toBe(0);
    warn.mockRestore();
  });

  it('two gifts at once go one after the other — both counted', async () => {
    const [a, b] = await Promise.all([giveKidXp('kid-2', 30), giveKidXp('kid-2', 20)]);
    expect(a).toMatchObject({ saved: true });
    expect(b).toMatchObject({ saved: true });
    expect(db.row?.xp).toBe(140);
  });

  it("moves this device's copy of their profile too, so it never looks behind the row", async () => {
    localStorage.setItem(
      profileKey('kid-2'),
      JSON.stringify({ id: 'kid-2', xp: 95, level: 1, levelXp: 95, currentStreak: 1, longestStreak: 1, lastPlayedOn: '2026-10-21', skillLevels: {}, powerUps: {} }),
    );
    await giveKidXp('kid-2', 10);
    const copy = JSON.parse(localStorage.getItem(profileKey('kid-2'))!);
    expect(copy).toMatchObject({ xp: 105, level: 2, levelXp: 5, currentStreak: 2, lastPlayedOn: TODAY });
  });

  it('nothing to give, nothing written', async () => {
    expect(await giveKidXp('kid-2', 0)).toEqual({ saved: false });
    expect(db.reads).toBe(0);
  });
});

describe('owed XP and the words on screen', () => {
  it('takeOwedXp hands it over once', () => {
    localStorage.setItem('hazel-owed-xp-kid-2', '40');
    expect(takeOwedXp('kid-2')).toBe(40);
    expect(takeOwedXp('kid-2')).toBe(0);
    localStorage.setItem('hazel-owed-xp-kid-2', 'junk');
    expect(owedXp('kid-2')).toBe(0);
  });

  it('says saving, saved, a new level, or kept for next time', () => {
    expect(kidXpWords('Mia', null)).toBe('Saving…');
    expect(kidXpWords('Mia', { saved: true, level: 3, leveledUp: false })).toBe("Saved to Mia's game.");
    expect(kidXpWords('Mia', { saved: true, level: 4, leveledUp: true })).toBe('⭐ Mia reached level 4!');
    expect(kidXpWords('Mia', { saved: false })).toBe("It'll be added the next time Mia plays on this device.");
    expect(xpStartsLine('Mia')).toBe('XP starts for Mia once Mia opens the world.');
  });
});
