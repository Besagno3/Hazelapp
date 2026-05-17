import { FunctionsHttpError } from '@supabase/supabase-js';

/**
 * Best-effort human-readable message from any error value — `Error`, a
 * Supabase `PostgrestError` / `AuthError` ({ message, details, hint, code }),
 * a plain object, or a string. Synchronous; never throws.
 *
 * Use this everywhere a caught error is shown to the user or logged, instead
 * of a hardcoded "something went wrong".
 */
export function errorMessage(err: unknown): string {
  if (err == null) return 'Unknown error';
  if (typeof err === 'string') return err;

  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const base =
      (typeof o.message === 'string' && o.message) ||
      (typeof o.error === 'string' && o.error) ||
      '';
    const code = typeof o.code === 'string' && o.code ? ` [${o.code}]` : '';
    const extra = [o.details, o.hint]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' — ');
    if (base) return extra ? `${base}${code} — ${extra}` : `${base}${code}`;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }

  return String(err);
}

/**
 * Like `errorMessage`, but also unwraps a Supabase Edge Function HTTP error by
 * reading its response body — that body carries the function's real
 * `{ error, detail }` instead of the generic "non-2xx status code" message.
 * Async because reading the response body is async.
 */
export async function resolveErrorMessage(err: unknown): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = (await err.context.json()) as { error?: unknown; detail?: unknown };
      const detail =
        (typeof body.detail === 'string' && body.detail) ||
        (typeof body.error === 'string' && body.error) ||
        '';
      if (detail) return detail;
    } catch {
      // Body wasn't JSON (or was already consumed) — fall back below.
    }
  }
  return errorMessage(err);
}
