/**
 * Telling the game's owner a question needs review (#146): by email (Resend),
 * Slack and/or Discord — every channel whose secrets are set. The canonical,
 * tested copy of the block between the markers below; generate-questions keeps
 * an identical copy INLINE (single-file deploys, #67), and
 * `src/lib/notify.test.ts` fails if the two ever differ.
 *
 * Two messages: `heldAlert` the moment a report check leaves a question held
 * back, and `digestAlert` — everything waiting — once a day.
 *
 * Secrets (Supabase → Edge Functions → Secrets):
 *   RESEND_API_KEY + ALERT_EMAIL_TO    email (comma-separate several addresses);
 *     ALERT_EMAIL_FROM                 sender, default "Hazel Quest <onboarding@resend.dev>"
 *                                      (Resend's test sender, which only delivers to the
 *                                      Resend account's own address — verify a domain to
 *                                      send from your own)
 *   ALERT_SLACK_WEBHOOK_URL            Slack incoming webhook
 *   ALERT_DISCORD_WEBHOOK_URL          Discord channel webhook
 *   APP_URL                            the game's address, for the review link
 *
 * Messages carry the question and its report counts — never a child's name or
 * anything about a family.
 *
 * Deliberately dependency-free: imported by vitest through this file.
 */

// --- notify:start (identical in generate-questions/index.ts)
/** Where alerts go: whichever channels have their secrets set. */
interface AlertChannels {
  email?: { apiKey: string; to: string[]; from: string; url: string };
  slack?: string;
  discord?: string;
}

/** The channels, from the function's secrets (`get` reads one). */
function alertChannels(get: (name: string) => string | undefined): AlertChannels {
  const channels: AlertChannels = {};
  const apiKey = get('RESEND_API_KEY');
  const to = (get('ALERT_EMAIL_TO') ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  if (apiKey && to.length > 0) {
    channels.email = {
      apiKey,
      to,
      from: get('ALERT_EMAIL_FROM') || 'Hazel Quest <onboarding@resend.dev>',
      url: get('RESEND_API_URL') || 'https://api.resend.com/emails',
    };
  }
  const slack = get('ALERT_SLACK_WEBHOOK_URL');
  if (slack) channels.slack = slack;
  const discord = get('ALERT_DISCORD_WEBHOOK_URL');
  if (discord) channels.discord = discord;
  return channels;
}

const hasChannels = (c: AlertChannels) => Boolean(c.email || c.slack || c.discord);

/** A question waiting for review, as the review queue lists it. */
interface ReviewItem {
  id: string;
  topic: string;
  level: number;
  status: string;
  text: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  reports: number;
  families: number;
  reasons: string[] | null;
}

interface Alert {
  subject: string;
  text: string;
}

/** The report reasons in words; the checks' notes as they are. */
const REASON_WORDS: Record<string, string> = {
  not_for_kids: 'Not OK for kids',
  wrong_answer: 'Wrong answer',
  confusing: 'Confusing',
  difficulty: 'Too hard or too easy',
};
function reasonWords(reasons: string[] | null): string[] {
  // A check's note arrives as "recheck: <note>" (the queue's label for it, 0017).
  return (reasons ?? []).map((r) => (r.startsWith('recheck: ') ? `🔎 ${r.slice(9)}` : (REASON_WORDS[r] ?? r)));
}

/** Where the owner reviews: the app's admin page (`?review` opens it). */
function reviewLink(appUrl: string | undefined): string {
  return appUrl
    ? `Review it: ${appUrl.replace(/\/+$/, '')}/?review`
    : 'Review it in the game: 👪 Grown-ups → 🛡️ Question review.';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const statusWords = (s: string) => (s === 'review' ? 'held back' : 'still shown, with new reports');

/** The moment a report check leaves a question held back. */
function heldAlert(item: ReviewItem, appUrl?: string): Alert {
  const lines = [
    'A question was reported and is held back until you review it.',
    '',
    `${item.topic}, level ${item.level}: ${item.text}`,
    ...item.options.map((o, i) => `  ${i === item.correct_index ? '✓' : '•'} ${o}`),
  ];
  if (item.explanation) lines.push(`Explanation: ${item.explanation}`);
  lines.push(
    '',
    `${plural(item.reports, 'report', 'reports')} from ${plural(item.families, 'family', 'families')}`,
    ...reasonWords(item.reasons).map((r) => `  - ${r}`),
    '',
    reviewLink(appUrl),
  );
  return { subject: 'Hazel Quest: a question needs your review', text: lines.join('\n') };
}

/** Questions listed in a digest; the rest are counted. */
const DIGEST_LIST_LIMIT = 20;

/** Everything waiting, once a day. */
function digestAlert(items: ReviewItem[], total: number, appUrl?: string): Alert {
  const held = items.filter((i) => i.status === 'review').length;
  const lines = [
    `${plural(total, 'question is', 'questions are')} waiting for your review` +
      (items.length === total ? ` (${held} held back, ${total - held} still shown with new reports).` : '.'),
    '',
  ];
  for (const item of items.slice(0, DIGEST_LIST_LIMIT)) {
    lines.push(
      `• [${statusWords(item.status)}] ${item.topic}, level ${item.level} — ` +
        `${plural(item.reports, 'report', 'reports')}${item.reasons?.length ? ` (${reasonWords(item.reasons).join('; ')})` : ''}`,
      `  ${item.text}`,
    );
  }
  const shown = Math.min(items.length, DIGEST_LIST_LIMIT);
  if (total > shown) lines.push(`…and ${total - shown} more.`);
  lines.push('', reviewLink(appUrl));
  return {
    subject: `Hazel Quest: ${plural(total, 'question', 'questions')} waiting for review`,
    text: lines.join('\n'),
  };
}

/** Discord rejects a message over 2,000 characters. */
const DISCORD_MAX = 2000;

/**
 * Sends `alert` to every configured channel at once. Never throws: returns
 * which channels took it and which didn't (a bad key, a dead webhook), for
 * the log.
 */
async function sendAlert(
  channels: AlertChannels,
  alert: Alert,
  fetchImpl: typeof fetch = fetch,
): Promise<{ sent: string[]; failed: string[] }> {
  const jobs: [string, () => Promise<Response>][] = [];
  const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
    fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  if (channels.email) {
    const e = channels.email;
    jobs.push([
      'email',
      () =>
        post(e.url, { from: e.from, to: e.to, subject: alert.subject, text: alert.text }, {
          Authorization: `Bearer ${e.apiKey}`,
        }),
    ]);
  }
  if (channels.slack) {
    const url = channels.slack;
    jobs.push(['slack', () => post(url, { text: `*${alert.subject}*\n${alert.text}` })]);
  }
  if (channels.discord) {
    const url = channels.discord;
    const content = `**${alert.subject}**\n${alert.text}`;
    jobs.push([
      'discord',
      () => post(url, { content: content.length > DISCORD_MAX ? `${content.slice(0, DISCORD_MAX - 1)}…` : content }),
    ]);
  }
  const results = await Promise.allSettled(jobs.map(([, run]) => run()));
  const sent: string[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    const name = jobs[i][0];
    if (r.status === 'fulfilled' && r.value.ok) sent.push(name);
    else failed.push(r.status === 'fulfilled' ? `${name} (HTTP ${r.value.status})` : `${name} (${String(r.reason)})`);
  });
  return { sent, failed };
}
// --- notify:end

export { DIGEST_LIST_LIMIT, DISCORD_MAX, alertChannels, digestAlert, hasChannels, heldAlert, reasonWords, sendAlert };
export type { Alert, AlertChannels, ReviewItem };
