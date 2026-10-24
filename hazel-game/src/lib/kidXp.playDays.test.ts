import { describe, it, expect, vi, beforeEach } from 'vitest';

// The real day records (`lib/playDays`), with the database stood in for: a
// sibling's row that takes the gift, and the day sends kept (#188 review).
const db = vi.hoisted(() => ({ xp: 90, sends: [] as { p_kid: string; p_days: { day: string; xp: number }[] }[] }));
vi.mock('./supabase', () => {
  const row = () => ({ xp: db.xp, level: 1, level_xp: db.xp, current_streak: 0, longest_streak: 0, last_played_on: null });
  return {
    supabase: {
      from: () => ({
        select: () => {
          const read = { maybeSingle: async () => ({ data: row(), error: null }), abortSignal: () => read };
          return { eq: () => read };
        },
        update: (values: { xp: number }) => ({
          eq: () => ({
            eq: (_col: string, xp: number) => ({
              select: () => {
                const run = async () => {
                  if (xp !== db.xp) return { data: [], error: null };
                  db.xp = values.xp;
                  return { data: [{ id: 'kid-2' }], error: null };
                };
                // Awaited as it is, or called off with a signal first: either way it runs once.
                let once: Promise<unknown> | null = null;
                const go = () => (once ??= run());
                return { abortSignal: go, then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => go().then(res, rej) };
              },
            }),
          }),
        }),
      }),
      rpc: vi.fn(async (fn: string, args: { p_kid: string; p_days: { day: string; xp: number }[] }) => {
        if (fn === 'note_device_play') db.sends.push(args);
        return { data: null, error: null };
      }),
    },
  };
});

const { giveKidXp } = await import('./kidXp');
const { forgetPlayDays, pendingPlayDays } = await import('./playDays');
const { todayIso } = await import('./streak');

beforeEach(() => {
  localStorage.clear();
  forgetPlayDays('kid-2');
  db.xp = 90;
  db.sends = [];
});

describe("a sibling's day XP reaches the database with the gift (#188 review)", () => {
  it('the day goes up with its XP — never as "played, 0 XP" with the XP left waiting on this device', async () => {
    await giveKidXp('kid-2', 50);
    await vi.waitFor(() => expect(pendingPlayDays('kid-2')).toEqual([]));
    const today = todayIso();
    const days = db.sends.flatMap((s) => s.p_days.filter((d) => d.day === today));
    expect(days.at(-1)).toMatchObject({ xp: 50 });
    expect(days.every((d) => d.xp === 50)).toBe(true);
  });

  it('…every gift, even after a send that started the wait between sends', async () => {
    await giveKidXp('kid-2', 50);
    await vi.waitFor(() => expect(pendingPlayDays('kid-2')).toEqual([]));
    await giveKidXp('kid-2', 20);
    await vi.waitFor(() => expect(pendingPlayDays('kid-2')).toEqual([]));
    const today = todayIso();
    expect(db.sends.flatMap((s) => s.p_days.filter((d) => d.day === today)).at(-1)).toMatchObject({ xp: 70 });
  });
});
