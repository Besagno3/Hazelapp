import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The supabase client is replaced (the real one needs env); rpcMock stands in
// for `mark_questions_seen`.
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc: rpcMock } }));

/** A fresh copy of the module (it keeps what's waiting and what's been sent). */
async function fresh(kid: string | null = 'kid-1') {
  vi.resetModules();
  const seen = await import('./seen');
  const { useFamilyStore } = await import('../store/familyStore');
  useFamilyStore.setState({ activeKidId: kid });
  return { ...seen, useFamilyStore };
}

const call = (kid: string, ids: string[]) => ['mark_questions_seen', { p_profile: kid, p_ids: ids }];

beforeEach(() => {
  vi.useFakeTimers();
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ error: null });
});
afterEach(() => vi.useRealTimers());

describe('markSeen — the app tells the server what was on screen (#134)', () => {
  it('sends questions shown close together in one call, a moment later', async () => {
    const { markSeen, SEEN_FLUSH_MS } = await fresh();
    markSeen('q-1');
    markSeen('q-2');
    expect(rpcMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SEEN_FLUSH_MS);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0]).toEqual(call('kid-1', ['q-1', 'q-2']));
  });

  it('a question shown again (a battle goes round its pool) is sent once', async () => {
    const { markSeen, SEEN_FLUSH_MS } = await fresh();
    markSeen('q-1');
    markSeen('q-1');
    vi.advanceTimersByTime(SEEN_FLUSH_MS);
    markSeen('q-1');
    vi.advanceTimersByTime(SEEN_FLUSH_MS);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0]).toEqual(call('kid-1', ['q-1']));
  });

  it('…but sent again once it shows after SEEN_RESEND_MS, so it stays in the recent window (review fix)', async () => {
    const { markSeen, SEEN_FLUSH_MS, SEEN_RESEND_MS } = await fresh();
    markSeen('q-1');
    vi.advanceTimersByTime(SEEN_FLUSH_MS);
    vi.advanceTimersByTime(SEEN_RESEND_MS);
    markSeen('q-1');
    vi.advanceTimersByTime(SEEN_FLUSH_MS);
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[1]).toEqual(call('kid-1', ['q-1']));
  });

  it('a full batch goes at once, never more than the server takes', async () => {
    const { markSeen, SEEN_BATCH_MAX } = await fresh();
    for (let i = 0; i < SEEN_BATCH_MAX; i++) markSeen(`q-${i}`);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][1].p_ids).toHaveLength(SEEN_BATCH_MAX);
  });

  it('skips questions that failed to cache, and does nothing with no kid playing', async () => {
    const { markSeen, SEEN_FLUSH_MS } = await fresh();
    markSeen('fresh-123-0');
    markSeen('');
    vi.advanceTimersByTime(SEEN_FLUSH_MS);
    expect(rpcMock).not.toHaveBeenCalled();

    const noKid = await fresh(null);
    noKid.markSeen('q-1');
    vi.advanceTimersByTime(noKid.SEEN_FLUSH_MS);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("a switch of player sends the last kid's questions as theirs first", async () => {
    const { markSeen, SEEN_FLUSH_MS, useFamilyStore } = await fresh();
    markSeen('q-1');
    useFamilyStore.setState({ activeKidId: 'kid-2' });
    markSeen('q-2');
    expect(rpcMock.mock.calls[0]).toEqual(call('kid-1', ['q-1']));
    vi.advanceTimersByTime(SEEN_FLUSH_MS);
    expect(rpcMock.mock.calls[1]).toEqual(call('kid-2', ['q-2']));
  });

  it('a failed send is logged, never thrown, and tried again the next time it shows (review fix)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpcMock.mockResolvedValueOnce({ error: { message: 'permission denied' } });
    const { markSeen, flushSeen } = await fresh();
    markSeen('q-1');
    flushSeen();
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith('Could not mark questions seen:', 'permission denied'));
    markSeen('q-1');
    flushSeen();
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[1]).toEqual(call('kid-1', ['q-1']));
    errorSpy.mockRestore();
  });

  it('a thrown network error is handled the same way', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpcMock.mockRejectedValueOnce(new Error('Failed to fetch'));
    const { markSeen, flushSeen } = await fresh();
    markSeen('q-1');
    flushSeen();
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith('Could not mark questions seen:', 'Failed to fetch'));
    markSeen('q-1');
    flushSeen();
    expect(rpcMock).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });
});
