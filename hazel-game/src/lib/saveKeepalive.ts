import { useAuthStore } from '../store/authStore';

/**
 * A `keepalive` request may carry at most 64 KiB (and all of a page's
 * keepalive requests in flight share that), so a save bigger than this goes
 * the normal way instead.
 */
export const KEEPALIVE_MAX_BYTES = 60 * 1024;

/** One row of the `saves` table, as `saveStore` upserts it. */
export interface SaveRow {
  profile_id: string;
  data: unknown;
  updated_at: string;
}

/**
 * Upserts a save with `fetch(…, { keepalive: true })`, so the request can
 * finish after the tab is hidden or closed (#151). supabase-js can't do this:
 * it looks the access token up asynchronously (behind an auth lock) before it
 * calls fetch, which may never happen once the page is going away. This sends
 * the same request (a PostgREST upsert, merging on the primary key) at once,
 * with the token `authStore` already holds.
 *
 * Returns null when it can't be sent this way (no session, a body over the
 * keepalive limit, no fetch) — the caller saves the normal way instead. The
 * promise settles with `{ error }` like a supabase-js call; it never rejects.
 * Best effort on a closing page: the browser may still drop it (see #151).
 */
export function upsertSaveKeepalive(row: SaveRow): Promise<{ error: unknown }> | null {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '');
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const token = useAuthStore.getState().session?.access_token;
  if (!url || !key || !token || typeof fetch !== 'function') return null;
  const body = JSON.stringify(row);
  if (new TextEncoder().encode(body).length > KEEPALIVE_MAX_BYTES) return null;
  let sent: Promise<Response>;
  try {
    sent = fetch(`${url}/rest/v1/saves`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'public',
        Prefer: 'resolution=merge-duplicates',
      },
      body,
    });
  } catch {
    return null;
  }
  return sent.then(
    async (res) => {
      if (res.ok) return { error: null };
      // PostgREST's error body ({ message, details, hint, code }) — what supabase-js would hand back.
      const error: unknown = await res.json().catch(() => ({ message: `${res.status} ${res.statusText}` }));
      return { error };
    },
    (error: unknown) => ({ error }),
  );
}
