import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { upsertSaveKeepalive, KEEPALIVE_MAX_BYTES } from './saveKeepalive';
import { useAuthStore } from '../store/authStore';
import { defaultSave } from './save';

const row = { profile_id: 'kid-1', data: { ...defaultSave(), revision: 4 }, updated_at: '2026-10-16T00:00:00.000Z' };
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  useAuthStore.setState({ session: { access_token: 'the-token' } as Session });
});
afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.setState({ session: null });
});

describe('upsertSaveKeepalive (#151)', () => {
  it('sends the same upsert supabase-js would, as a keepalive request, at once', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    const sent = upsertSaveKeepalive(row);
    // Started before any await: a closing page may not run another tick.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:54321/rest/v1/saves');
    expect(init).toMatchObject({ method: 'POST', keepalive: true });
    expect(init?.headers).toMatchObject({
      apikey: 'test-anon-key',
      Authorization: 'Bearer the-token',
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    });
    expect(JSON.parse(init?.body as string)).toEqual(row);
    await expect(sent).resolves.toEqual({ error: null });
  });

  it('a refusal comes back as the server\'s error, like supabase-js returns it', async () => {
    const refusal = { code: 'P0001', message: 'save_version_conflict: a newer save is already stored (revision 9), refusing revision 4', details: 'save_revision_conflict', hint: null };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(refusal), { status: 400 }));
    await expect(upsertSaveKeepalive(row)).resolves.toEqual({ error: refusal });
  });

  it('a network failure resolves with the error (never rejects)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { error } = (await upsertSaveKeepalive(row))!;
    expect(error).toBeInstanceOf(TypeError);
  });

  it('a token that has expired, or is about to, isn\'t sent (the server would refuse it): null, nothing sent', async () => {
    const now = Math.floor(Date.now() / 1000);
    for (const expiresAt of [now - 60, now, now + 10]) {
      useAuthStore.setState({ session: { access_token: 'the-token', expires_at: expiresAt } as Session });
      expect(upsertSaveKeepalive(row), `expires_at ${expiresAt - now}s`).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
    // A token good for a while longer is used.
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    useAuthStore.setState({ session: { access_token: 'the-token', expires_at: now + 3600 } as Session });
    await expect(upsertSaveKeepalive(row)).resolves.toEqual({ error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('can\'t be sent this way without a session, or over the keepalive limit: null, nothing sent', () => {
    useAuthStore.setState({ session: null });
    expect(upsertSaveKeepalive(row)).toBeNull();
    useAuthStore.setState({ session: { access_token: 'the-token' } as Session });
    const big = { ...row, data: { ...row.data, note: 'x'.repeat(KEEPALIVE_MAX_BYTES) } };
    expect(upsertSaveKeepalive(big)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
