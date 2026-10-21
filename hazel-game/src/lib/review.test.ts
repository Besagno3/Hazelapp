import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc: rpcMock } }));

import { NOT_AN_ADMIN, fetchReviewQueue, isAdmin, reasonLabel, reviewQuestion } from './review';

beforeEach(() => {
  rpcMock.mockReset();
});

describe('the owner’s question review (#147)', () => {
  it('isAdmin asks the database, and any failure is a no', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    expect(await isAdmin()).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('is_admin');
    rpcMock.mockResolvedValue({ data: false, error: null });
    expect(await isAdmin()).toBe(false);
    rpcMock.mockResolvedValue({ data: null, error: { message: 'no such function' } });
    expect(await isAdmin()).toBe(false);
    rpcMock.mockRejectedValue(new Error('offline'));
    expect(await isAdmin()).toBe(false);
  });

  it('fetchReviewQueue reads the admin queue, counts as numbers', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          id: 'q-1', topic: 'math', level: 3, age: 8, status: 'review', text: 'Q?', options: ['a', 'b', 'c', 'd'],
          correct_index: 2, explanation: null, reports: '2', families: '1', not_for_kids: '1',
          reasons: ['not_for_kids'], last_report: '2026-10-16T09:00:00Z',
        },
        {
          id: 'q-2', topic: 'math', level: 3, age: null, status: 'review', text: 'R?', options: ['a', 'b', 'c', 'd'],
          correct_index: 0, explanation: 'E.', reports: 0, families: 0, not_for_kids: 0, reasons: null, last_report: null,
        },
      ],
      error: null,
    });
    const items = await fetchReviewQueue();
    expect(rpcMock).toHaveBeenCalledWith('admin_review_queue');
    expect(items[0]).toEqual({
      id: 'q-1', topic: 'math', level: 3, age: 8, status: 'review', text: 'Q?', options: ['a', 'b', 'c', 'd'],
      correctIndex: 2, explanation: null, reports: 2, families: 1, notForKids: 1, reasons: ['not_for_kids'],
      lastReport: '2026-10-16T09:00:00Z',
    });
    expect(items[1].reasons).toEqual([]);
  });

  it('someone who isn’t an admin is told so, other failures say what went wrong', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'not an admin', code: '42501' } });
    await expect(fetchReviewQueue()).rejects.toThrow(NOT_AN_ADMIN);
    await expect(reviewQuestion('q-1', 'active')).rejects.toThrow(NOT_AN_ADMIN);
    rpcMock.mockResolvedValue({ data: null, error: { message: 'timeout', code: '57014' } });
    await expect(fetchReviewQueue()).rejects.toThrow(/Couldn't load the review queue — timeout/);
    await expect(reviewQuestion('q-1', 'retired')).rejects.toThrow(/Couldn't save that — timeout/);
  });

  it('"👪 Grown-ups is shut" comes through recognisable, so the gate is asked for (#167)', async () => {
    const locked = { code: 'HQ001', message: 'grown_ups_locked: open 👪 Grown-ups first' };
    rpcMock.mockResolvedValue({ data: null, error: locked });
    await expect(fetchReviewQueue()).rejects.toMatchObject({ code: 'HQ001', message: locked.message });
    await expect(reviewQuestion('q-1', 'retired')).rejects.toMatchObject({ code: 'HQ001' });
  });

  it('reviewQuestion sends the decision', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await reviewQuestion('q-9', 'approved');
    expect(rpcMock).toHaveBeenCalledWith('admin_review_question', { p_question: 'q-9', p_status: 'approved' });
  });

  it('report reasons in words; the checks’ notes as they are', () => {
    expect(reasonLabel('not_for_kids')).toBe('Not OK for kids');
    expect(reasonLabel('difficulty')).toBe('Too hard or too easy');
    expect(reasonLabel('recheck: 2026-10-16 report check (Haiku): check: scary')).toBe(
      '🔎 2026-10-16 report check (Haiku): check: scary',
    );
    expect(reasonLabel('something new')).toBe('something new');
  });
});
