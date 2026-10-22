import { describe, it, expect } from 'vitest';
// ?raw: the migration's TEXT, so the limits the app keeps a day to and the
// ones the database clamps it to can't drift apart (#182) — drifted, the
// server would skip or clamp a day quietly.
import migration0026 from '../../supabase/migrations/0026_progress_history.sql?raw';
import { DAYS_AHEAD, DAYS_BACK, MAX_ANSWERS, MAX_MINUTES, MAX_TOPICS, MAX_XP, PENDING_MAX, TOPIC_KEY } from './playDays';
import { MAX_SKILL_LEVEL, MIN_SKILL_LEVEL } from './age';

/** A function's body in 0026 (between its `$$`s). */
function body(name: string): string {
  const m = migration0026.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`));
  if (!m) throw new Error(`0026 has no function ${name}`);
  return m[1];
}

/** Every number `re`'s groups catch in `text`, in order. */
const numbers = (text: string, re: RegExp) => [...text.matchAll(re)].flatMap((m) => m.slice(1).map(Number));

describe("the app keeps a day to 0026's limits (#182)", () => {
  const history = body('note_play_history');
  const days = body('note_play_days');
  const clean = body('play_topics_clean');

  it('the window: 7 days back to 1 ahead, in both note functions', () => {
    expect(numbers(history, /generate_series\(-(\d+), (\d+)\)/g)).toEqual([DAYS_BACK, DAYS_AHEAD]);
    expect(numbers(days, /between current_date - (\d+) and current_date \+ (\d+)/g)).toEqual([DAYS_BACK, DAYS_AHEAD, DAYS_BACK, DAYS_AHEAD]);
  });

  it('at most 31 days a call — the most the app ever sends is under it', () => {
    const [most] = numbers(history, /jsonb_array_length\(p_days\) > (\d+)/g);
    expect(numbers(days, /cardinality\(p_days\) > (\d+)/g)).toEqual([most]);
    expect(PENDING_MAX).toBeLessThanOrEqual(most);
  });

  it('XP 0–100,000 and minutes 0–1,440: the clamp and the table check', () => {
    expect(numbers(history, /least\(greatest\(trunc\(\(v_el ->> 'xp'\)::numeric\), (\d+)\), (\d+)\)/g)).toEqual([0, MAX_XP]);
    expect(numbers(history, /least\(greatest\(trunc\(\(v_el ->> 'minutes'\)::numeric\), (\d+)\), (\d+)\)/g)).toEqual([0, MAX_MINUTES]);
    expect(numbers(migration0026, /check \(xp between (\d+) and (\d+)\)/g)).toEqual([0, MAX_XP]);
    expect(numbers(migration0026, /check \(minutes between (\d+) and (\d+)\)/g)).toEqual([0, MAX_MINUTES]);
  });

  it('topics: ids of 1–24 lowercase letters, at most 16 a day, a ≤ 10,000 (r with it), l 1–10', () => {
    expect(clean.match(/e\.key ~ '([^']+)'/)?.[1]).toBe(TOPIC_KEY.source);
    expect(numbers(clean, /limit (\d+)/g)).toEqual([MAX_TOPICS]);
    expect(numbers(body('play_topics_merge'), /limit (\d+)/g)).toEqual([MAX_TOPICS]);
    expect(numbers(clean, /least\(greatest\(trunc\(\(e\.value ->> '[ar]'\)::numeric\), (\d+)\), (\d+)\)/g)).toEqual([0, MAX_ANSWERS, 0, MAX_ANSWERS]);
    expect(numbers(clean, /\(e\.value ->> 'l'\)::integer between (\d+) and (\d+)/g)).toEqual([MIN_SKILL_LEVEL, MAX_SKILL_LEVEL]);
  });
});
