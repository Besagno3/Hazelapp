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
