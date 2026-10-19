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
