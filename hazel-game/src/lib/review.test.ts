import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc: rpcMock } }));

import {
  BANK_PAGE,
  FixRefused,
  NOT_AN_ADMIN,
  browseQuestions,
  fetchReviewQueue,
  fixProblem,
  fixQuestion,
  isAdmin,
  reasonLabel,
  reviewQuestion,
  reviewTrouble,
} from './review';

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

describe('fixing a question and browsing the bank (migration 0028)', () => {
  const fix = { text: ' What is 7 + 5? ', options: [' 11', '12', '13', '10 '], correctIndex: 1, explanation: '  ' };

  it('fixProblem runs the game’s own screening, in words', () => {
    expect(fixProblem(fix)).toBeNull();
    expect(fixProblem({ ...fix, options: ['11', '12', '12 ', '10'] })).toBe('Two answers are the same.');
    expect(fixProblem({ ...fix, options: ['11', '', '13', '10'] })).toBe('Every answer needs words.');
    expect(fixProblem({ ...fix, text: ' ' })).toBe('The question needs words.');
    expect(fixProblem({ ...fix, options: ['11', '12', '13', 'All of the above'] })).toMatch(/shuffled/);
    expect(fixProblem({ ...fix, explanation: 'See www.example.com' })).toMatch(/link/);
  });

  it('fixQuestion sends the fix trimmed, an empty explanation as none', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await fixQuestion('q-3', fix);
    expect(rpcMock).toHaveBeenCalledWith('admin_fix_question', {
      p_question: 'q-3',
      p_text: 'What is 7 + 5?',
      p_options: ['11', '12', '13', '10'],
      p_correct_index: 1,
      p_explanation: null,
    });
  });

  it('a fix the game would refuse is never sent', async () => {
    await expect(fixQuestion('q-3', { ...fix, options: ['a', 'a', 'b', 'c'] })).rejects.toBeInstanceOf(FixRefused);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('the database’s refusals come through in words; others as trouble', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '22023', message: 'two answers are the same' } });
    const refused = await fixQuestion('q-3', fix).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(FixRefused);
    expect(reviewTrouble(refused, 'fallback')).toBe('Two answers are the same.');
    rpcMock.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'no such question' } });
    await expect(fixQuestion('q-3', fix)).rejects.toThrow('That question was retired or removed meanwhile, so it can’t be fixed.');
    rpcMock.mockResolvedValue({ data: null, error: { code: '42501', message: 'not an admin' } });
    await expect(fixQuestion('q-3', fix)).rejects.toThrow(NOT_AN_ADMIN);
    rpcMock.mockResolvedValue({ data: null, error: { code: 'HQ001', message: 'grown_ups_locked: open' } });
    await expect(fixQuestion('q-3', fix)).rejects.toMatchObject({ code: 'HQ001' });
    rpcMock.mockResolvedValue({ data: null, error: { code: '57014', message: 'timeout' } });
    const other = await fixQuestion('q-3', fix).catch((e: unknown) => e);
    expect(reviewTrouble(other, 'Couldn’t save.')).toBe('Couldn’t save.');
  });

  it('browseQuestions asks for a page with the filters, counts as numbers', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          id: 'q-1', topic: 'math', level: 3, age: 8, status: 'approved', text: 'Q?', options: ['a', 'b', 'c', 'd'],
          correct_index: 2, explanation: null, times_asked: 7, reports: '1', created_at: '2026-10-20T09:00:00Z',
        },
      ],
      error: null,
    });
    const page = await browseQuestions({ topic: 'math', search: '  planet ' });
    expect(rpcMock).toHaveBeenCalledWith('admin_browse_questions', {
      p_topic: 'math', p_level: null, p_status: null, p_search: 'planet', p_limit: BANK_PAGE,
      p_after_created: null, p_after_id: null,
    });
    expect(page).toEqual([
      {
        id: 'q-1', topic: 'math', level: 3, age: 8, status: 'approved', text: 'Q?', options: ['a', 'b', 'c', 'd'],
        correctIndex: 2, explanation: null, timesAsked: 7, reports: 1, createdAt: '2026-10-20T09:00:00Z',
      },
    ]);
    await browseQuestions({ status: 'review', level: 4 }, page[0]);
    expect(rpcMock).toHaveBeenLastCalledWith('admin_browse_questions', {
      p_topic: null, p_level: 4, p_status: 'review', p_search: null, p_limit: BANK_PAGE,
      p_after_created: '2026-10-20T09:00:00Z', p_after_id: 'q-1',
    });
    rpcMock.mockResolvedValue({ data: null, error: { code: '42501', message: 'not an admin' } });
    await expect(browseQuestions({})).rejects.toThrow(NOT_AN_ADMIN);
  });
});
