import { describe, it, expect, vi } from 'vitest';
// ?raw: the files' TEXT, so the function's inline copy can be compared with the canonical one.
import edgeFnSource from '../../supabase/functions/generate-questions/index.ts?raw';
import sharedSource from '../../supabase/functions/_shared/notify.ts?raw';
import {
  DIGEST_LIST_LIMIT,
  alertChannels,
  digestAlert,
  heldAlert,
  sendAlert,
  type ReviewItem,
} from '../../supabase/functions/_shared/notify';

const block = (src: string) => {
  const m = src.match(/\/\/ --- notify:start[^\n]*\n([\s\S]*?)\/\/ --- notify:end/);
  return m ? m[1] : null;
};

const item: ReviewItem = {
  id: 'q-1',
  topic: 'science',
  level: 4,
  status: 'review',
  text: 'Which planet is the Red Planet?',
  options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
  correct_index: 1,
  explanation: 'Mars looks red because of rusty dust.',
  reports: 2,
  families: 1,
  reasons: ['not_for_kids', 'recheck: 2026-10-16 report check (Haiku): check: two answers fit'],
};

const env = (vars: Record<string, string>) => (name: string) => vars[name];

describe('alerts to the owner (#146)', () => {
  it("the edge function's inline copy is the canonical one, word for word (no drift)", () => {
    expect(block(sharedSource), 'markers missing in _shared/notify.ts').not.toBeNull();
    expect(block(edgeFnSource), 'markers missing in generate-questions/index.ts').not.toBeNull();
    expect(block(edgeFnSource)).toBe(block(sharedSource));
  });

  it('a channel is on only when its secrets are set', () => {
    expect(alertChannels(env({}))).toEqual({});
    expect(alertChannels(env({ RESEND_API_KEY: 'k' }))).toEqual({}); // no address
    expect(alertChannels(env({ ALERT_EMAIL_TO: 'a@x.org' }))).toEqual({}); // no key
    expect(alertChannels(env({ RESEND_API_KEY: 'k', ALERT_EMAIL_TO: ' a@x.org, b@y.org ,' }))).toEqual({
      email: { apiKey: 'k', to: ['a@x.org', 'b@y.org'], from: 'Hazel Quest <onboarding@resend.dev>', url: 'https://api.resend.com/emails' },
    });
    expect(
      alertChannels(
        env({
          RESEND_API_KEY: 'k',
          ALERT_EMAIL_TO: 'a@x.org',
          ALERT_EMAIL_FROM: 'Quest <q@x.org>',
          ALERT_SLACK_WEBHOOK_URL: 'https://hooks.slack.test/1',
          ALERT_DISCORD_WEBHOOK_URL: 'https://discord.test/2',
        }),
      ),
    ).toMatchObject({ email: { from: 'Quest <q@x.org>' }, slack: 'https://hooks.slack.test/1', discord: 'https://discord.test/2' });
  });

  it('the held-back alert shows the question, its answer, the reports in words and the review link', () => {
    const a = heldAlert(item, 'https://quest.example/');
    expect(a.subject).toBe('Hazel Quest: a question needs your review');
    expect(a.text).toContain('science, level 4: Which planet is the Red Planet?');
    expect(a.text).toContain('  ✓ Mars');
    expect(a.text).toContain('  • Venus');
    expect(a.text).toContain('Explanation: Mars looks red because of rusty dust.');
    expect(a.text).toContain('2 reports from 1 family');
    expect(a.text).toContain('  - Not OK for kids');
    expect(a.text).toContain('  - 🔎 2026-10-16 report check (Haiku): check: two answers fit');
    expect(a.text).toContain('Review it: https://quest.example/?review');
    // Without APP_URL it says where to go in the game.
    expect(heldAlert(item).text).toContain('👪 Grown-ups → 🛡️ Question review');
  });

  it('the digest counts what is waiting, lists up to 20, and counts the rest', () => {
    const live = { ...item, id: 'q-2', status: 'active', reports: 1, families: 1, reasons: ['confusing'] };
    const two = digestAlert([item, live], 2, 'https://quest.example');
    expect(two.subject).toBe('Hazel Quest: 2 questions waiting for review');
    expect(two.text).toContain('2 questions are waiting for your review (1 held back, 1 still shown with new reports).');
    expect(two.text).toContain('• [still shown, with new reports] science, level 4 — 1 report (Confusing)');
    expect(two.text).toContain('Review it: https://quest.example/?review');
    expect(digestAlert([item], 1).subject).toBe('Hazel Quest: 1 question waiting for review');

    const many = Array.from({ length: 30 }, (_, i) => ({ ...item, id: `q-${i}` }));
    const big = digestAlert(many, 45);
    expect(big.text.split('\n').filter((l) => l.startsWith('• ')).length).toBe(DIGEST_LIST_LIMIT);
    expect(big.text).toContain('…and 25 more.');
    expect(big.text).toContain('45 questions are waiting for your review.');
  });

  it('sends to every channel, each in its own format, and never throws', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const channels = alertChannels(
      env({
        RESEND_API_KEY: 'key-1',
        ALERT_EMAIL_TO: 'owner@x.org',
        ALERT_SLACK_WEBHOOK_URL: 'https://hooks.slack.test/1',
        ALERT_DISCORD_WEBHOOK_URL: 'https://discord.test/2',
      }),
    );
    const result = await sendAlert(channels, { subject: 'S', text: 'T' }, fetchImpl as typeof fetch);
    expect(result).toEqual({ sent: ['email', 'slack', 'discord'], failed: [] });
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][];
    const byUrl = Object.fromEntries(calls.map(([url, init]) => [url, init]));
    const email = byUrl['https://api.resend.com/emails'];
    expect((email.headers as Record<string, string>).Authorization).toBe('Bearer key-1');
    expect(JSON.parse(email.body as string)).toEqual({
      from: 'Hazel Quest <onboarding@resend.dev>',
      to: ['owner@x.org'],
      subject: 'S',
      text: 'T',
    });
    expect(JSON.parse(byUrl['https://hooks.slack.test/1'].body as string)).toEqual({ text: '*S*\nT' });
    expect(JSON.parse(byUrl['https://discord.test/2'].body as string)).toEqual({ content: '**S**\nT' });
  });

  it('a long Discord message is cut to its 2,000-character limit; a failing channel is reported', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('slack')) throw new Error('offline');
      if (url.includes('resend')) return new Response(null, { status: 401 });
      return new Response(null, { status: 204 });
    });
    const channels = alertChannels(
      env({
        RESEND_API_KEY: 'bad',
        ALERT_EMAIL_TO: 'owner@x.org',
        ALERT_SLACK_WEBHOOK_URL: 'https://hooks.slack.test/1',
        ALERT_DISCORD_WEBHOOK_URL: 'https://discord.test/2',
      }),
    );
    const result = await sendAlert(channels, { subject: 'S', text: 'x'.repeat(5000) }, fetchImpl as unknown as typeof fetch);
    expect(result.sent).toEqual(['discord']);
    expect(result.failed).toEqual(['email (HTTP 401)', 'slack (Error: offline)']);
    const discord = (fetchImpl.mock.calls as unknown as [string, RequestInit][]).find(([u]) => u.includes('discord'))!;
    const content = JSON.parse(discord[1].body as string).content as string;
    expect(content.length).toBe(2000);
    expect(content.endsWith('…')).toBe(true);
    // No channels: nothing sent, nothing thrown.
    expect(await sendAlert({}, { subject: 'S', text: 'T' }, fetchImpl as unknown as typeof fetch)).toEqual({ sent: [], failed: [] });
  });
});
