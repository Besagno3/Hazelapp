import { describe, expect, it } from 'vitest';
// ?raw: the migration's TEXT, so the notice and the database can't drift apart.
import migration0021 from '../../supabase/migrations/0021_family_question_budget.sql?raw';
import { PRIVACY_NOTICE } from './family';

describe('the privacy notice and a removed child (B9, #152)', () => {
  const keep = PRIVACY_NOTICE.find((s) => s.heading === 'How long we keep it')?.body ?? '';

  it('the database deletes a removed kid’s question count once it is a day old', () => {
    expect(migration0021).toMatch(
      /delete from question_requests\s+where profile_id is null\s+and requested_at <= now\(\) - interval '1 day'/,
    );
  });

  it('removing a kid deletes at once the rows no budget needs (review round 2)', () => {
    expect(migration0021).toMatch(
      /delete from public\.question_requests\s+where profile_id = old\.id\s+and \(fresh_count = 0 or requested_at <= now\(\) - interval '1 day'\)/,
    );
    expect(migration0021).toMatch(/create trigger profiles_forget_requests\s+before delete on public\.profiles/);
  });

  it('the notice says that count is kept, without the child’s name, for one day', () => {
    expect(keep).toMatch(/Removing a child in the Grown-ups area deletes their information straight away/);
    expect(keep).toMatch(/without their name/);
    expect(keep).toMatch(/kept for one day/);
  });
});

describe('the privacy notice and 👪 Grown-ups locking again (#167)', () => {
  it('the notice, the app and the database agree on how long it stays open', async () => {
    const { default: migration0024 } = await import('../../supabase/migrations/0024_grown_up_unlock.sql?raw');
    const { GROWN_UP_UNLOCK_MINUTES } = await import('../lib/grownUpsGate');
    const seconds = Number(migration0024.match(/function public\.grown_up_unlock_seconds\(\)[\s\S]*?select (\d+);/)?.[1]);
    expect(seconds).toBe(GROWN_UP_UNLOCK_MINUTES * 60);
    const choices = PRIVACY_NOTICE.find((s) => s.heading === 'Your choices')?.body ?? '';
    expect(choices).toContain(`locks again when you leave it (or after ${GROWN_UP_UNLOCK_MINUTES} minutes)`);
    expect(choices).toMatch(/change the email and password you sign in with there/);
  });
});

describe('the privacy notice and the play history (#169–#174)', () => {
  it('names what is noted each day, and that it goes after five weeks — as long as the database and the page keep it', async () => {
    const { default: migration0026 } = await import('../../supabase/migrations/0026_progress_history.sql?raw');
    const { HISTORY_DAYS } = await import('../lib/progress');
    const collect = PRIVACY_NOTICE.find((s) => s.heading === 'What we collect')?.body ?? '';
    // The day's note in its own sentence; where each topic started is one of the "levels" (review round 2).
    expect(collect).toMatch(
      /For each day they play, we also keep a note: how long they played, the XP they earned, their right and wrong answers in each topic, and the level each topic reached\./,
    );
    expect(collect).toMatch(/game progress \(answers, levels, items and saved game\)/);
    // Each device's share of a day (0027, #179): kept under a random code per browser — said, briefly.
    expect(collect).toMatch(
      /If they play on more than one device, each one's share of the day is kept under a random code the browser makes up \(linked to nothing outside the game\), so the totals add up\./,
    );
    const keep = PRIVACY_NOTICE.find((s) => s.heading === 'How long we keep it')?.body ?? '';
    // Exactly what happens (review round 2): the read policy hides a day after five weeks; the tidy-up runs inside
    // the note functions, as children play — no scheduled job, so "deleted after five weeks" claimed too much.
    expect(keep).toMatch(/Each day's note is kept for five weeks; after that your family can't see it, and it is deleted as the game tidies up \(as children play\)/);
    expect(keep).not.toMatch(/deleted after five weeks/);
    expect(keep).toMatch(/Only the date of their first day stays, to show from when days played are recorded/);
    // The tidy-up is part of noting a day: no scheduled job does it.
    expect(migration0026).toMatch(/function public\.note_play_history\([\s\S]*?perform public\.play_days_tidy\(\)/);
    expect(migration0026).not.toMatch(/cron\.schedule/);
    expect(HISTORY_DAYS).toBe(5 * 7);
    // The purge and the read policy (0026) at the same five weeks.
    expect(Number(migration0026.match(/where o\.day < current_date - (\d+)/)?.[1])).toBe(HISTORY_DAYS);
    expect(Number(migration0026.match(/day >= current_date - (\d+)/)?.[1])).toBe(HISTORY_DAYS);
    // …and each device's share of a day (0027) goes with the days, by the same notes.
    const { default: migration0027 } = await import('../../supabase/migrations/0027_play_day_devices.sql?raw');
    const tidy = migration0027.match(/function public\.play_days_tidy\(\)[\s\S]*?\$\$([\s\S]*?)\$\$;/)?.[1] ?? '';
    expect([...tidy.matchAll(/from public\.(\w+) o\s+where o\.day < current_date - (\d+)/g)].map((m) => [m[1], Number(m[2])])).toEqual([
      ['play_days', HISTORY_DAYS],
      ['play_day_parts', HISTORY_DAYS],
    ]);
    expect(migration0027).toMatch(/function public\.play_days_note\([\s\S]*?perform public\.play_days_tidy\(\)/);
  });
});
