import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ReviewItem } from '../../lib/review';

const review = vi.hoisted(() => ({ fetchReviewQueue: vi.fn(), reviewQuestion: vi.fn() }));
vi.mock('../../lib/review', async (original) => ({
  ...(await original<typeof import('../../lib/review')>()),
  fetchReviewQueue: review.fetchReviewQueue,
  reviewQuestion: review.reviewQuestion,
}));

const { default: QuestionReviewPage } = await import('./QuestionReviewPage');

const held: ReviewItem = {
  id: 'q-held', topic: 'science', level: 4, age: 9, status: 'review', text: 'Which planet is red?',
  options: ['Venus', 'Mars', 'Jupiter', 'Saturn'], correctIndex: 1, explanation: 'Rusty dust.',
  reports: 1, families: 1, notForKids: 1, reasons: ['not_for_kids', 'recheck: report check (Haiku): check: scary'],
  lastReport: '2026-10-16T09:00:00Z',
};
const live: ReviewItem = {
  ...held, id: 'q-live', status: 'active', text: 'What is 7 + 5?', options: ['11', '12', '13', '10'], correctIndex: 1,
  explanation: null, age: null, reports: 2, families: 2, notForKids: 0, reasons: ['confusing'],
};
const onBack = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  review.fetchReviewQueue.mockResolvedValue([held, live]);
  review.reviewQuestion.mockResolvedValue(undefined);
});

const card = (text: string) => screen.getByText(text).closest('li') as HTMLElement;

describe('QuestionReviewPage (#146)', () => {
  it('lists what’s waiting: held back first, with the answer, the reports in words and the checks’ notes', async () => {
    render(<QuestionReviewPage onBack={onBack} />);
    expect(await screen.findByText('2 questions waiting')).toBeInTheDocument();
    const h = card('Which planet is red?');
    expect(within(h).getByText('Held back')).toBeInTheDocument();
    expect(within(h).getByText('science · level 4 · written for age 9')).toBeInTheDocument();
    expect(within(h).getByText(/\(the saved answer\)/).parentElement).toHaveTextContent('Mars');
    expect(within(h).getByText('1 report from 1 family')).toBeInTheDocument();
    expect(within(h).getByText('Not OK for kids')).toBeInTheDocument();
    expect(within(h).getByText('🔎 report check (Haiku): check: scary')).toBeInTheDocument();
    expect(within(h).getByText('Explanation: Rusty dust.')).toBeInTheDocument();
    const l = card('What is 7 + 5?');
    expect(within(l).getByText('Still shown')).toBeInTheDocument();
    expect(within(l).getByText('2 reports from 2 families')).toBeInTheDocument();
    expect(within(l).getByText('Confusing')).toBeInTheDocument();
  });

  it('Release and Approve decide at once; the question leaves the list and it says so', async () => {
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(within(card('Which planet is red?')).getByRole('button', { name: '✅ Release' }));
    await waitFor(() => expect(review.reviewQuestion).toHaveBeenCalledWith('q-held', 'active'));
    expect(await screen.findByText('1 question waiting')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Released: "Which planet is red?"');
    fireEvent.click(within(card('What is 7 + 5?')).getByRole('button', { name: '⭐ Approve' }));
    await waitFor(() => expect(review.reviewQuestion).toHaveBeenCalledWith('q-live', 'approved'));
    expect(await screen.findByText(/Nothing waiting — all clear/)).toBeInTheDocument();
  });

  it('Retire asks first; Cancel keeps it', async () => {
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(within(card('Which planet is red?')).getByRole('button', { name: '🗑️ Retire' }));
    expect(screen.getByText('Retire it for good?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(review.reviewQuestion).not.toHaveBeenCalled();
    fireEvent.click(within(card('Which planet is red?')).getByRole('button', { name: '🗑️ Retire' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, retire' }));
    await waitFor(() => expect(review.reviewQuestion).toHaveBeenCalledWith('q-held', 'retired'));
    expect(await screen.findByText('1 question waiting')).toBeInTheDocument();
  });

  it('a decision that fails stays on the card, with why', async () => {
    review.reviewQuestion.mockRejectedValue(new Error("Couldn't save that — timeout"));
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(within(card('Which planet is red?')).getByRole('button', { name: '✅ Release' }));
    expect(await within(card('Which planet is red?')).findByText("Couldn't save that — timeout")).toBeInTheDocument();
    expect(screen.getByText('2 questions waiting')).toBeInTheDocument();
  });

  it('a queue that can’t load says why and offers Try again; someone who isn’t an admin is told so', async () => {
    review.fetchReviewQueue.mockRejectedValueOnce(new Error("Only the game's owner can review questions."));
    render(<QuestionReviewPage onBack={onBack} />);
    expect(await screen.findByText("Only the game's owner can review questions.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('2 questions waiting')).toBeInTheDocument();
  });

  it('nothing waiting is all clear; Back goes back', async () => {
    review.fetchReviewQueue.mockResolvedValue([]);
    render(<QuestionReviewPage onBack={onBack} />);
    expect(await screen.findByText(/Nothing waiting — all clear/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '← Back to Grown-ups' }));
    expect(onBack).toHaveBeenCalled();
  });
});
