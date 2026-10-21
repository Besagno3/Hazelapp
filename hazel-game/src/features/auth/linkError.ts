/**
 * An email link (a sign-up confirmation, a password reset) that came back
 * with an error — most often `otp_expired`: the link ran out, or was used
 * already (some mail apps open links to check them first). Supabase puts the
 * error in the address — the hash, or the query for a PKCE link — and
 * supabase-js reads it and leaves it there, saying nothing, so the grown-up
 * landed on a bare sign-in page. `AuthPage` says why (#159 review round 2).
 */
const LINK_ERROR_KEYS = ['error', 'error_code', 'error_description'];

/** The error an email link came back with, as an auth error (`code`, `message`), or null. */
export function linkErrorFrom(loc: Pick<Location, 'hash' | 'search'>): { code: string; message: string } | null {
  for (const part of [loc.hash.replace(/^#/, ''), loc.search.replace(/^\?/, '')]) {
    const p = new URLSearchParams(part);
    if (!LINK_ERROR_KEYS.some((k) => p.has(k))) continue;
    return { code: p.get('error_code') || p.get('error') || '', message: p.get('error_description') ?? '' };
  }
  return null;
}

/** Take the link's error out of the address (a reload shouldn't say it again), keeping the rest. */
export function dropLinkError(): void {
  const url = new URL(window.location.href);
  let changed = false;
  for (const k of LINK_ERROR_KEYS) {
    if (url.searchParams.has(k)) {
      url.searchParams.delete(k);
      changed = true;
    }
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  if (LINK_ERROR_KEYS.some((k) => hash.has(k))) {
    for (const k of LINK_ERROR_KEYS) hash.delete(k);
    url.hash = hash.toString();
    changed = true;
  }
  if (changed) window.history.replaceState(window.history.state, '', url);
}

/**
 * The address the page opened with, read as this module loads: supabase-js
 * takes an email link's session out of the hash (`#access_token=…&type=…`)
 * once it has read it, so by the time a screen asks, only this copy says
 * what kind of link it was.
 */
const START_URL: Pick<Location, 'hash' | 'search'> =
  typeof window === 'undefined' ? { hash: '', search: '' } : { hash: window.location.hash, search: window.location.search };

/**
 * What an email link that came back to the game means for an email change
 * (#124d, #167 review round 1): with "Secure email change" on, the first of
 * the two links lands with Supabase's `message` ("…proceed to confirm link
 * sent to the other email") — `other-email`; the second signs in with
 * `type=email_change` — `email-changed`; a link that came back with an
 * error (run out, used already) while signed in — `link-failed` (signed out,
 * the sign-in page says it, `linkErrorFrom`).
 */
export type EmailLinkNotice = 'other-email' | 'email-changed' | 'link-failed';

export function emailLinkNoticeFrom(loc: Pick<Location, 'hash' | 'search'>): EmailLinkNotice | null {
  for (const part of [loc.hash.replace(/^#/, ''), loc.search.replace(/^\?/, '')]) {
    const p = new URLSearchParams(part);
    if (p.get('type') === 'email_change') return 'email-changed';
    if (/other email/i.test(p.get('message') ?? '')) return 'other-email';
  }
  return linkErrorFrom(loc) ? 'link-failed' : null;
}

/** The words for it: what happened, and what to do next. */
export function emailLinkWords(notice: EmailLinkNotice, email: string): string {
  switch (notice) {
    case 'other-email':
      return 'Nearly done! Now tap the link in the other email we sent — your sign-in email changes once both links are tapped.';
    case 'email-changed':
      return email ? `Your sign-in email is now ${email}.` : 'Your sign-in email has changed.';
    case 'link-failed':
      return "That email link didn't work — it may have run out, or been used already — so nothing changed. Need a new one? Ask again in 👪 Grown-ups.";
  }
}

let noticeTaken = false;

/**
 * The email-change notice the page opened with, once (null after the first
 * ask, or when there's none); its words come off the address, so a reload
 * doesn't say it again.
 */
export function takeEmailLinkNotice(loc: Pick<Location, 'hash' | 'search'> = START_URL): EmailLinkNotice | null {
  if (noticeTaken) return null;
  noticeTaken = true;
  const notice = emailLinkNoticeFrom(loc);
  if (notice) dropEmailLinkWords();
  return notice;
}

/** Take Supabase's `message` (and a link's error) out of the address, keeping the rest. */
function dropEmailLinkWords(): void {
  try {
    dropLinkError();
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    if (url.searchParams.has('message') || hash.has('message')) {
      url.searchParams.delete('message');
      hash.delete('message');
      url.hash = hash.toString();
      window.history.replaceState(window.history.state, '', url);
    }
  } catch {
    // Not in a browser: nothing to tidy.
  }
}
