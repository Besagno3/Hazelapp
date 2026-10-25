import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { FixRefused, type BankQuestion, type ReviewItem } from '../../lib/review';

const review = vi.hoisted(() => ({
  fetchReviewQueue: vi.fn(),
  reviewQuestion: vi.fn(),
  fixQuestion: vi.fn(),
  browseQuestions: vi.fn(),
}));
vi.mock('../../lib/review', async (original) => ({
  ...(await original<typeof import('../../lib/review')>()),
  fetchReviewQueue: review.fetchReviewQueue,
  reviewQuestion: review.reviewQuestion,
  fixQuestion: review.fixQuestion,
  browseQuestions: review.browseQuestions,
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
const banked: BankQuestion = {
  id: 'q-bank', topic: 'math', level: 3, age: 8, status: 'active', text: 'What is 9 − 4?',
  options: ['4', '5', '6', '3'], correctIndex: 0, explanation: null, timesAsked: 12, reports: 0,
  createdAt: '2026-10-20T09:00:00Z',
};
const onBack = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  review.fetchReviewQueue.mockResolvedValue([held, live]);
  review.reviewQuestion.mockResolvedValue(undefined);
  review.fixQuestion.mockResolvedValue(undefined);
  review.browseQuestions.mockResolvedValue([banked]);
});

const card = (text: string) => screen.getByText(text).closest('li') as HTMLElement;

describe('QuestionReviewPage (#147)', () => {
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

  it('a decision that fails stays on the card, in plain words — the raw error goes to the console (#130 S6)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    review.reviewQuestion.mockRejectedValue(new Error("Couldn't save that — canceling statement due to statement timeout [57014]"));
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(within(card('Which planet is red?')).getByRole('button', { name: '✅ Release' }));
    expect(await within(card('Which planet is red?')).findByText("Couldn't save that just now. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/57014|statement timeout/)).toBeNull();
    expect(warn).toHaveBeenCalledWith('Saving a review decision failed:', "Couldn't save that — canceling statement due to statement timeout [57014]");
    expect(screen.getByText('2 questions waiting')).toBeInTheDocument();
    warn.mockRestore();
  });

  it('a queue that fails to load says so plainly, with Try again', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    review.fetchReviewQueue.mockRejectedValueOnce(new Error("Couldn't load the review queue — relation does not exist [42P01]"));
    render(<QuestionReviewPage onBack={onBack} />);
    expect(await screen.findByText(`Couldn't load the review queue just now. Tap "Try again".`)).toBeInTheDocument();
    expect(screen.queryByText(/42P01/)).toBeNull();
    vi.mocked(console.warn).mockRestore();
  });

  it('a queue that can’t load says why and offers Try again; someone who isn’t an admin is told so', async () => {
    review.fetchReviewQueue.mockRejectedValueOnce(new Error("Only the game's owner can review questions."));
    render(<QuestionReviewPage onBack={onBack} />);
    expect(await screen.findByText("Only the game's owner can review questions.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('2 questions waiting')).toBeInTheDocument();
  });

  it('Try again keeps the keyboard: it waits in place, a second failure leaves the focus on it, and once loaded the title has it (#29 review round 1)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    review.fetchReviewQueue.mockRejectedValueOnce(new Error('down')).mockRejectedValueOnce(new Error('still down'));
    render(<QuestionReviewPage onBack={onBack} />);
    const button = await screen.findByRole('button', { name: 'Try again' });
    button.focus();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveTextContent('Trying…');
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(await screen.findByText('2 questions waiting')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '🛡️ Question review' })).toHaveFocus();
    vi.mocked(console.warn).mockRestore();
  });

  it('nothing waiting is all clear; Back goes back', async () => {
    review.fetchReviewQueue.mockResolvedValue([]);
    render(<QuestionReviewPage onBack={onBack} />);
    expect(await screen.findByText(/Nothing waiting — all clear/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '← Back to Grown-ups' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('locked again (#167): the queue waits for the gate, then loads; a decision waits the same way', async () => {
    const { resetGrownUps, unlockedAgain, useGrownUpsStore } = await import('../../store/grownUpsStore');
    resetGrownUps();
    const locked = Object.assign(new Error('grown_ups_locked: open 👪 Grown-ups first'), { code: 'HQ001' });
    review.fetchReviewQueue.mockRejectedValueOnce(locked).mockResolvedValueOnce([held]);
    render(<QuestionReviewPage onBack={onBack} />);
    await waitFor(() => expect(useGrownUpsStore.getState().asked).toBe(true));
    unlockedAgain();
    expect(await screen.findByText('1 question waiting')).toBeInTheDocument();
    review.reviewQuestion.mockRejectedValueOnce(locked).mockResolvedValueOnce(undefined);
    fireEvent.click(within(card('Which planet is red?')).getByRole('button', { name: /Release/ }));
    await waitFor(() => expect(useGrownUpsStore.getState().asked).toBe(true));
    unlockedAgain();
    await waitFor(() => expect(review.reviewQuestion).toHaveBeenCalledTimes(2));
  });

  it('✏️ Fix (0028): change the right answer and save — it’s approved and leaves the list', async () => {
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(within(card('What is 7 + 5?')).getByRole('button', { name: '✏️ Fix' }));
    const form = screen.getByRole('form', { name: 'Fix this question' });
    expect(within(form).getByRole('radio', { name: 'Answer 2 is the right one' })).toBeChecked();
    fireEvent.click(within(form).getByRole('radio', { name: 'Answer 1 is the right one' }));
    fireEvent.change(within(form).getByRole('textbox', { name: 'Answer 1' }), { target: { value: '12 ' } });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Answer 2' }), { target: { value: '14' } });
    fireEvent.change(within(form).getByLabelText(/Explanation/), { target: { value: 'Count on 5 from 7.' } });
    fireEvent.click(within(form).getByRole('button', { name: '💾 Save fix' }));
    await waitFor(() =>
      expect(review.fixQuestion).toHaveBeenCalledWith('q-live', {
        text: 'What is 7 + 5?', options: ['12 ', '14', '13', '10'], correctIndex: 0, explanation: 'Count on 5 from 7.',
      }),
    );
    expect(await screen.findByText('1 question waiting')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Fixed and approved: "What is 7 + 5?"');
  });

  it('a refused fix says why on the form and keeps what was typed; Cancel goes back to the buttons', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    review.fixQuestion.mockRejectedValueOnce(new FixRefused('Two answers are the same.'));
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(within(card('What is 7 + 5?')).getByRole('button', { name: '✏️ Fix' }));
    const form = screen.getByRole('form', { name: 'Fix this question' });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Answer 1' }), { target: { value: '12' } });
    fireEvent.click(within(form).getByRole('button', { name: '💾 Save fix' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Two answers are the same.');
    expect(within(form).getByRole('textbox', { name: 'Answer 1' })).toHaveValue('12');
    expect(screen.getByText('2 questions waiting')).toBeInTheDocument();
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form', { name: 'Fix this question' })).toBeNull();
    expect(within(card('What is 7 + 5?')).getByRole('button', { name: '✏️ Fix' })).toBeInTheDocument();
    vi.mocked(console.warn).mockRestore();
  });

  it('📚 Browse all lists the bank with the answer ticked, searches with the filters, and fixes in place', async () => {
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(screen.getByRole('button', { name: '📚 Browse all' }));
    expect(screen.getByRole('button', { name: '📚 Browse all' })).toHaveAttribute('aria-pressed', 'true');
    const q = await screen.findByText('What is 9 − 4?');
    const c = q.closest('li') as HTMLElement;
    expect(within(c).getByText('Live')).toBeInTheDocument();
    expect(within(c).getByText(/asked 12×/)).toBeInTheDocument();
    expect(within(c).getByText(/\(the saved answer\)/).parentElement).toHaveTextContent('4');
    expect(review.browseQuestions).toHaveBeenLastCalledWith({});

    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'math' } });
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Words in the question'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: '🔍 Search' }));
    await waitFor(() => expect(review.browseQuestions).toHaveBeenLastCalledWith({ topic: 'math', level: 3, search: '9' }));
    const again = (await screen.findByText('What is 9 − 4?')).closest('li') as HTMLElement;

    fireEvent.click(within(again).getByRole('button', { name: '✏️ Fix' }));
    const form = within(again).getByRole('form', { name: 'Fix this question' });
    fireEvent.click(within(form).getByRole('radio', { name: 'Answer 2 is the right one' }));
    fireEvent.click(within(form).getByRole('button', { name: '💾 Save fix' }));
    await waitFor(() => expect(review.fixQuestion).toHaveBeenCalledWith('q-bank', expect.objectContaining({ correctIndex: 1 })));
    expect(await within(again).findByText('Approved')).toBeInTheDocument();
    expect(within(again).getByText(/\(the saved answer\)/).parentElement).toHaveTextContent('5');
    expect(screen.getByRole('status')).toHaveTextContent('Fixed and approved: "What is 9 − 4?"');
  });

  it('📚 Browse offers Load more on a full page and adds the next one', async () => {
    const page = Array.from({ length: 50 }, (_, i) => ({ ...banked, id: `q-${i}`, text: `Question ${i}?` }));
    review.browseQuestions.mockResolvedValueOnce(page).mockResolvedValueOnce([{ ...banked, id: 'q-last', text: 'The last one?' }]);
    render(<QuestionReviewPage onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: '📚 Browse all' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('The last one?')).toBeInTheDocument();
    expect(review.browseQuestions).toHaveBeenLastCalledWith({}, 50);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});
