import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TopicTally } from '../types';

// This build and the #89 build (a tab left open from before it — the code word
// for word, src/test/playDays89.ts) in one browser: one localStorage, two
// tabs, against a stand-in for migration 0027 (#179 review round 1).
const rpc = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ supabase: { rpc } }));

type Day = { xp: number; minutes: number; topics: Record<string, TopicTally> };
type Sent = Day & { day: string };
/** 0027's parts: per day, per device ('legacy' for note_play_history), each the larger of what it had and what came. */
const parts = new Map<string, Map<string, Day>>();
const merge = (had: Day | undefined, d: Sent): Day => {
  if (!had) return { xp: d.xp, minutes: d.minutes, topics: { ...d.topics } };
  const topics = { ...had.topics };
  for (const [id, t] of Object.entries(d.topics)) if (!topics[id] || t.a >= topics[id].a) topics[id] = t;
  return { xp: Math.max(had.xp, d.xp), minutes: Math.max(had.minutes, d.minutes), topics };
};
/** A note function's call, as the stand-in 0027 takes it. */
const serve = (fn: string, args: { p_device?: string; p_days: Sent[] }) => {
  const part = fn === 'note_device_play' ? args.p_device! : fn === 'note_play_history' ? 'legacy' : null;
  if (part) for (const d of args.p_days) parts.set(d.day, new Map(parts.get(d.day)).set(part, merge(parts.get(d.day)?.get(part), d)));
  return { data: args.p_days.length, error: null };
};
/** What 📈 reads for a day: its parts added up. */
const theDay = (day: string) => {
  const sum = { xp: 0, minutes: 0, answers: 0 };
  for (const p of parts.get(day)?.values() ?? []) {
    sum.xp += p.xp;
    sum.minutes += p.minutes;
    sum.answers += Object.values(p.topics).reduce((n, t) => n + t.a, 0);
  }
  return sum;
};

const TODAY = '2026-10-21';
const later = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
let ours: typeof import('./playDays');
let theirs: typeof import('../test/playDays89');

beforeEach(async () => {
  localStorage.clear();
  parts.clear();
  rpc.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`));
  rpc.mockImplementation(async (fn: string, args: { p_device?: string; p_days: Sent[] }) => serve(fn, args));
  vi.resetModules();
  ours = await import('./playDays');
  vi.resetModules();
  theirs = await import('../test/playDays89');
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a #89 tab and a tab of this build in one browser (#179 review round 1)', () => {
  it('never count the day twice: each tab sends its own play — this one to its part, the #89 one to the legacy part', async () => {
    // This tab: the kid plays 10 minutes, earns 50 XP, answers two; sent to this browser's part.
    await ours.notePlayDay('kid-1', TODAY);
    for (let i = 0; i < 10; i++) await ours.addDayMinute('kid-1', TODAY);
    await ours.addDayXp('kid-1', TODAY, 50);
    await ours.noteDayAnswer('kid-1', TODAY, 'math', true, 4);
    await ours.noteDayAnswer('kid-1', TODAY, 'math', false, 4);
    await ours.flushPlayDays('kid-1', { now: true });
    // The #89 tab, still open from before the deploy: a minute, 5 XP, an answer; then it goes out of view and sends.
    await theirs.addDayMinute('kid-1', TODAY, { played: true });
    await theirs.addDayXp('kid-1', TODAY, 5, { played: true });
    await theirs.noteDayAnswer('kid-1', TODAY, 'math', true, 4, { played: true });
    await theirs.flushPlayDays('kid-1', { now: true });
    // Back here: one more minute and a send.
    await ours.addDayMinute('kid-1', TODAY);
    later(ours.SEND_EVERY_MS + 1);
    await ours.flushPlayDays('kid-1', { now: true });
    // 12 minutes, 55 XP, 3 answers played — and that's what the day holds (it was 22 minutes, 105 XP, 5 answers).
    expect(theDay(TODAY)).toEqual({ xp: 55, minutes: 12, answers: 3 });
    expect([...parts.get(TODAY)!.keys()].sort()).toEqual([ours.deviceId(), 'legacy'].sort());
    // The #89 build's record holds its own play only: this build never wrote play into it.
    expect(theirs.playDayRecords('kid-1')).toEqual([{ day: TODAY, xp: 5, minutes: 1, topics: { math: { a: 1, r: 1, l: 4 } } }]);
  });

  it('the other way round too: the #89 tab sends first, then this one', async () => {
    await theirs.notePlayDay('kid-1', TODAY);
    await theirs.addDayXp('kid-1', TODAY, 20);
    await theirs.flushPlayDays('kid-1', { now: true });
    await ours.addDayXp('kid-1', TODAY, 30, { played: true });
    await ours.flushPlayDays('kid-1', { now: true });
    await theirs.addDayXp('kid-1', TODAY, 4);
    later(ours.SEND_EVERY_MS + 1);
    await theirs.flushPlayDays('kid-1', { now: true });
    await ours.addDayXp('kid-1', TODAY, 6, { played: true });
    await ours.flushPlayDays('kid-1', { now: true });
    expect(theDay(TODAY).xp).toBe(60);
  });

  it('across the upgrade: the morning played on the #89 build, the afternoon on this one — both counted, the morning once however often either tab sends it', async () => {
    // The morning, on the #89 build (sent before the deploy).
    await theirs.notePlayDay('kid-1', TODAY);
    await theirs.addDayXp('kid-1', TODAY, 30);
    for (let i = 0; i < 3; i++) await theirs.addDayMinute('kid-1', TODAY);
    later(theirs.SEND_EVERY_MS + 1);
    await theirs.flushPlayDays('kid-1', { now: true });
    expect(theDay(TODAY)).toEqual({ xp: 30, minutes: 3, answers: 0 });
    // A reload into this build (the profile counts today): the afternoon is its own record, for its own part.
    ours.markPlayDays('kid-1', (d) => d === TODAY);
    await ours.addDayXp('kid-1', TODAY, 20, { played: true });
    await ours.flushPlayDays('kid-1', { now: true });
    expect(theDay(TODAY)).toEqual({ xp: 50, minutes: 3, answers: 0 });
    // The #89 tab, still open in another window, grows its morning and sends it; the answer is lost (the database
    // has it, the tab never heard). This tab sends that grown record too: the legacy part keeps the larger, and
    // nothing adds up.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.mockImplementationOnce(async (fn: string, args: { p_days: Sent[] }) => {
      serve(fn, args);
      throw new TypeError('Failed to fetch');
    });
    await theirs.addDayXp('kid-1', TODAY, 5);
    later(theirs.SEND_EVERY_MS + 1);
    await theirs.flushPlayDays('kid-1', { now: true });
    expect(theDay(TODAY).xp).toBe(55);
    await ours.addDayXp('kid-1', TODAY, 1, { played: true });
    later(ours.SEND_EVERY_MS + 1);
    await ours.flushPlayDays('kid-1', { now: true });
    expect(rpc).toHaveBeenLastCalledWith('note_play_history', { p_kid: 'kid-1', p_days: [{ day: TODAY, xp: 35, minutes: 3, topics: {}, noted: true }] });
    expect(theDay(TODAY)).toEqual({ xp: 56, minutes: 3, answers: 0 });
  });

  it('minutes on both builds count towards five (#177), and the #89 tab\'s go once the day is played here', async () => {
    const { keptDay } = ours;
    for (let i = 0; i < 3; i++) await theirs.addDayMinute('kid-1', TODAY);
    for (let i = 0; i < 2; i++) await ours.addDayMinute('kid-1', TODAY);
    expect(keptDay('kid-1', TODAY)).toEqual({ minutes: 5, played: false });
    expect(ours.pendingPlayDays('kid-1')).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    // Five minutes count the day (recordActivity → notePlayDay): both records go, each to its part.
    await ours.notePlayDay('kid-1', TODAY);
    expect(theDay(TODAY).minutes).toBe(5);
    expect(parts.get(TODAY)!.get('legacy')).toMatchObject({ minutes: 3 });
    // Its key marks it played and sent, as that build marks what it sent; its play as it was.
    expect(JSON.parse(localStorage.getItem(theirs.playDaysKey('kid-1'))!)).toEqual([
      { day: TODAY, xp: 0, minutes: 3, topics: {}, played: true, sent: 'all' },
    ]);
  });

  it('a #89 day leaves its key once sent and past; today\'s stays until it\'s past', async () => {
    localStorage.setItem(
      ours.legacyPlayDaysKey('kid-1'),
      JSON.stringify([
        { day: '2026-10-19', xp: 9, minutes: 1, topics: {}, played: true, sent: 'all' },
        { day: '2026-10-20', xp: 12, minutes: 2, topics: {}, played: true },
        { day: TODAY, xp: 7, minutes: 1, topics: {}, played: true, sent: 'all' },
      ]),
    );
    await ours.flushPlayDays('kid-1', { now: true });
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['note_play_history']);
    expect(theDay('2026-10-20').xp).toBe(12);
    expect(JSON.parse(localStorage.getItem(ours.legacyPlayDaysKey('kid-1'))!).map((r: { day: string }) => r.day)).toEqual([TODAY]);
    // The next day: nothing to send, but today's (now past, sent) leaves too — and the key with it.
    later(24 * 3600_000);
    await ours.flushPlayDays('kid-1');
    expect(localStorage.getItem(ours.legacyPlayDaysKey('kid-1'))).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
