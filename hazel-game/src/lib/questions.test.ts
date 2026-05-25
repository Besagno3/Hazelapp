import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocked supabase client — replaces the real module (which would throw at
// import time without VITE_SUPABASE_URL / _ANON_KEY set). vi.hoisted lifts
// the mock fns above the vi.mock factory so the factory can reference them.
const { insertMock, fromMock, getUserMock } = vi.hoisted(() => {
  const insertMock = vi.fn();
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  const getUserMock = vi.fn();
  return { insertMock, fromMock, getUserMock };
});

vi.mock('./supabase', () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
  },
}));

// Import AFTER the mock is registered.
import { flagQuestion } from './questions';

beforeEach(() => {
  insertMock.mockReset();
  fromMock.mockClear();
  getUserMock.mockReset();
});

describe('flagQuestion', () => {
  it('inserts a flag row with the caller as profile_id and the chosen reason', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    insertMock.mockResolvedValue({ error: null });

    await flagQuestion('q-123', 'wrong_answer');

    expect(fromMock).toHaveBeenCalledWith('question_flags');
    expect(insertMock).toHaveBeenCalledWith({
      question_id: 'q-123',
      profile_id: 'user-1',
      reason: 'wrong_answer',
    });
  });

  it('passes null for reason when none is provided', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    insertMock.mockResolvedValue({ error: null });

    await flagQuestion('q-7');

    expect(insertMock).toHaveBeenCalledWith({
      question_id: 'q-7',
      profile_id: 'user-1',
      reason: null,
    });
  });

  it('is a no-op for synthetic fresh- IDs (FK would fail anyway)', async () => {
    await flagQuestion('fresh-123-0', 'wrong_answer');
    expect(getUserMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('throws "sign in" when no user is on the session', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await expect(flagQuestion('q-1', 'confusing')).rejects.toThrow(/sign in/i);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('wraps the underlying auth error in a flag-context message', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'jwt expired' } });
    await expect(flagQuestion('q-1', 'confusing')).rejects.toThrow(/jwt expired/);
  });

  it('wraps the underlying DB error in a flag-context message', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    insertMock.mockResolvedValue({
      error: { message: 'permission denied for table question_flags', code: '42501' },
    });
    await expect(flagQuestion('q-1', 'difficulty')).rejects.toThrow(/permission denied/);
  });
});
