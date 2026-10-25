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

// By the question's own line (an open fix form has the same words in its textarea).
const card = (text: string) => screen.getByText(text, { selector: 'p' }).closest('li') as HTMLElement;

describe('QuestionReviewPage (#147)', () => {
  it('lists what’s waiting: held back first, with the answer, the reports in words and the checks’ notes', async () => {
    render(<QuestionReviewPage onBack={onBack} />);
    expect(await screen.findByText('2 questions waiting')).toBeInTheDocument();
    const h = card('Which planet is red?');
    expect(within(h).getByText('Held back')).toBeInTheDocument();
    expect(within(h).getByText(/Science · level 4 · written for age 9$/)).toBeInTheDocument();
    expect(within(h).getByText(/\(the right answer\)/).parentElement).toHaveTextContent('Mars');
    expect(within(h).getByText('1 report from 1 family')).toBeInTheDocument();
    expect(within(h).getByText('Not OK for kids')).toBeInTheDocument();
    expect(within(h).getByText('🔎 report check (Haiku): check: scary')).toBeInTheDocument();
    expect(within(h).getByText('Explanation: Rusty dust.')).toBeInTheDocument();
    const l = card('What is 7 + 5?');
    expect(within(l).getByText('Live · new reports')).toBeInTheDocument();
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

  it('✏️ Fix (0028): opens on the question’s words, tick the right answer, save — approved, gone, the next card takes the focus', async () => {
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(within(card('What is 7 + 5?')).getByRole('button', { name: '✏️ Fix' }));
    const form = screen.getByRole('form', { name: 'Fix this question' });
    expect(within(form).getByRole('textbox', { name: 'Question' })).toHaveFocus();
    expect(within(form).getByRole('radio', { name: 'Right answer: 12' })).toBeChecked();
    fireEvent.click(within(form).getByRole('radio', { name: 'Right answer: 11' }));
    fireEvent.change(within(form).getByRole('textbox', { name: 'Answer 1' }), { target: { value: '12 ' } });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Answer 2' }), { target: { value: '14' } });
    expect(within(form).getByRole('radio', { name: 'Right answer: 12' })).toBeChecked();
    fireEvent.change(within(form).getByLabelText(/Explanation/), { target: { value: 'Count on 5 from 7.' } });
    fireEvent.click(within(form).getByRole('button', { name: '💾 Save fix' }));
    await waitFor(() =>
      expect(review.fixQuestion).toHaveBeenCalledWith('q-live', {
        text: 'What is 7 + 5?', options: ['12 ', '14', '13', '10'], correctIndex: 0, explanation: 'Count on 5 from 7.',
      }),
    );
    expect(await screen.findByText('1 question waiting')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Fixed and approved: "What is 7 + 5?"');
    // It was the last card: the one before it takes the focus, not the top of the page.
    await waitFor(() => expect(card('Which planet is red?')).toHaveFocus());
  });

  it('after a decision the next card takes the focus; once none are left, the title', async () => {
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(within(card('Which planet is red?')).getByRole('button', { name: '⭐ Approve' }));
    await waitFor(() => expect(card('What is 7 + 5?')).toHaveFocus());
    fireEvent.click(within(card('What is 7 + 5?')).getByRole('button', { name: '✅ Release' }));
    expect(await screen.findByText(/Nothing waiting/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: '🛡️ Question review' })).toHaveFocus());
  });

  it('🗑️ Retire’s question takes the focus, and Cancel gives it back to Retire', async () => {
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(within(card('Which planet is red?')).getByRole('button', { name: '🗑️ Retire' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Yes, retire' })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(within(card('Which planet is red?')).getByRole('button', { name: '🗑️ Retire' })).toHaveFocus());
  });

  it('a decision that fails is said out loud on its card', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    review.reviewQuestion.mockRejectedValueOnce(new Error('down'));
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(within(card('Which planet is red?')).getByRole('button', { name: '✅ Release' }));
    expect(await within(card('Which planet is red?')).findByRole('alert')).toHaveTextContent("Couldn't save that just now");
    vi.mocked(console.warn).mockRestore();
  });

  it('a refused fix says why on the form and keeps what was typed; Cancel waits while saving, then gives the focus back to ✏️ Fix', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    review.fixQuestion.mockRejectedValueOnce(new FixRefused('Two answers are the same.'));
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(within(card('What is 7 + 5?')).getByRole('button', { name: '✏️ Fix' }));
    const form = screen.getByRole('form', { name: 'Fix this question' });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Answer 1' }), { target: { value: '12' } });
    fireEvent.click(within(form).getByRole('button', { name: '💾 Save fix' }));
    expect(within(form).getByRole('button', { name: 'Cancel' })).toHaveAttribute('aria-disabled', 'true');
    expect(await within(form).findByText('Two answers are the same.')).toBeInTheDocument();
    expect(within(form).getByRole('alert')).toHaveTextContent('Two answers are the same.');
    expect(within(form).getByRole('textbox', { name: 'Answer 1' })).toHaveValue('12');
    expect(screen.getByText('2 questions waiting')).toBeInTheDocument();
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form', { name: 'Fix this question' })).toBeNull();
    const fixButton = within(card('What is 7 + 5?')).getByRole('button', { name: '✏️ Fix' });
    await waitFor(() => expect(fixButton).toHaveFocus());
    vi.mocked(console.warn).mockRestore();
  });

  it('two fixes can be open at once; Refresh and Back wait for a fix being typed', async () => {
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(within(card('What is 7 + 5?')).getByRole('button', { name: '✏️ Fix' }));
    fireEvent.click(within(card('Which planet is red?')).getByRole('button', { name: '✏️ Fix' }));
    expect(screen.getAllByRole('form', { name: 'Fix this question' })).toHaveLength(2);
    fireEvent.change(within(card('What is 7 + 5?')).getByRole('textbox', { name: 'Answer 1' }), { target: { value: '9' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute('aria-disabled', 'true'));
    expect(screen.getByRole('button', { name: /⏳ Waiting/ })).toHaveTextContent('· fix not saved');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(review.fetchReviewQueue).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAccessibleDescription('Save or cancel your fix first — Refresh would lose it.');
    fireEvent.click(screen.getByRole('button', { name: '← Back to Grown-ups' }));
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByText("A fix on ⏳ Waiting isn't saved yet. Leave without saving it?")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stay' })).toHaveFocus());
    // A second press doesn't leave.
    fireEvent.click(screen.getByRole('button', { name: '← Back to Grown-ups' }));
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '← Back to Grown-ups' })).toHaveFocus());
    expect(within(card('What is 7 + 5?')).getByRole('textbox', { name: 'Answer 1' })).toHaveValue('9');
    fireEvent.click(screen.getByRole('button', { name: '← Back to Grown-ups' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('switching tabs keeps a fix being typed, and the notice is about the tab it was said on', async () => {
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(within(card('Which planet is red?')).getByRole('button', { name: '✅ Release' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Released'));
    fireEvent.click(within(card('What is 7 + 5?')).getByRole('button', { name: '✏️ Fix' }));
    fireEvent.change(within(card('What is 7 + 5?')).getByRole('textbox', { name: 'Answer 1' }), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: '📚 Browse all' }));
    expect(screen.getByRole('status')).toHaveTextContent('');
    await screen.findByText('What is 9 − 4?');
    fireEvent.click(screen.getByRole('button', { name: /⏳ Waiting/ }));
    expect(within(card('What is 7 + 5?')).getByRole('textbox', { name: 'Answer 1' })).toHaveValue('9');
  });

  it('📚 Browse all ticks the answer; the lists apply as picked, the words on Search; a fix there updates in place and leaves Waiting', async () => {
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(screen.getByRole('button', { name: '📚 Browse all' }));
    expect(screen.getByRole('button', { name: '📚 Browse all' })).toHaveAttribute('aria-pressed', 'true');
    const c = (await screen.findByText('What is 9 − 4?')).closest('li') as HTMLElement;
    expect(within(c).getByText('Live')).toBeInTheDocument();
    expect(within(c).getByText(/asked 12×/)).toBeInTheDocument();
    expect(within(c).getByText(/\(the right answer\)/).parentElement).toHaveTextContent('4');
    expect(review.browseQuestions).toHaveBeenLastCalledWith({});

    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'math' } });
    await waitFor(() => expect(review.browseQuestions).toHaveBeenLastCalledWith({ topic: 'math' }));
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: '3' } });
    await waitFor(() => expect(review.browseQuestions).toHaveBeenLastCalledWith({ topic: 'math', level: 3 }));
    fireEvent.change(screen.getByLabelText('Words in the question'), { target: { value: '9' } });
    expect(review.browseQuestions).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole('button', { name: '🔍 Search' }));
    await waitFor(() => expect(review.browseQuestions).toHaveBeenLastCalledWith({ topic: 'math', level: 3, search: '9' }));
    const again = (await screen.findByText('What is 9 − 4?')).closest('li') as HTMLElement;

    fireEvent.click(within(again).getByRole('button', { name: '✏️ Fix' }));
    const form = within(again).getByRole('form', { name: 'Fix this question' });
    fireEvent.click(within(form).getByRole('radio', { name: 'Right answer: 5' }));
    // A fix being typed holds the filters: a new list would drop it.
    expect(screen.getByText(/Save or cancel your fix first/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: '' } });
    expect(review.browseQuestions).toHaveBeenCalledTimes(4);
    fireEvent.click(within(form).getByRole('button', { name: '💾 Save fix' }));
    await waitFor(() => expect(review.fixQuestion).toHaveBeenCalledWith('q-bank', expect.objectContaining({ correctIndex: 1 })));
    expect(await within(again).findByText('Approved')).toBeInTheDocument();
    expect(within(again).getByText(/\(the right answer\)/).parentElement).toHaveTextContent('5');
    expect(screen.getByRole('status')).toHaveTextContent('Fixed and approved: "What is 9 − 4?"');
    await waitFor(() => expect(within(again).getByRole('button', { name: '✏️ Fix' })).toHaveFocus());
  });

  it('a question fixed in 📚 Browse leaves the Waiting list (its copy there is out of date)', async () => {
    review.browseQuestions.mockResolvedValue([{ ...banked, id: 'q-live', text: 'What is 7 + 5?', status: 'active' }]);
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(screen.getByRole('button', { name: '📚 Browse all' }));
    const list = await screen.findByRole('list', { name: 'Saved questions' });
    fireEvent.click(within(list).getByRole('button', { name: '✏️ Fix' }));
    fireEvent.click(within(list).getByRole('button', { name: '💾 Save fix' }));
    await waitFor(() => expect(review.fixQuestion).toHaveBeenCalledWith('q-live', expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: /⏳ Waiting/ }));
    expect(await screen.findByText('1 question waiting')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Questions waiting for review' })).queryByText('What is 7 + 5?')).toBeNull();
  });

  it('📚 Load more asks for the page after the last one shown, focuses the first new one, and is gone after the last page', async () => {
    const page = Array.from({ length: 50 }, (_, i) => ({ ...banked, id: `q-${i}`, text: `Question ${i}?` }));
    review.browseQuestions.mockResolvedValueOnce(page).mockResolvedValueOnce([{ ...banked, id: 'q-last', text: 'The last one?' }]);
    render(<QuestionReviewPage onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: '📚 Browse all' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    const last = await screen.findByText('The last one?');
    expect(review.browseQuestions).toHaveBeenLastCalledWith({}, page[49]);
    await waitFor(() => expect(last.closest('li')).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('📚 a Load more that lands after a new list started is dropped', async () => {
    const page = Array.from({ length: 50 }, (_, i) => ({ ...banked, id: `q-${i}`, text: `Question ${i}?` }));
    let finish: (rows: BankQuestion[]) => void = () => {};
    review.browseQuestions
      .mockResolvedValueOnce(page)
      .mockReturnValueOnce(new Promise<BankQuestion[]>((r) => (finish = r)))
      .mockResolvedValueOnce([{ ...banked, id: 'q-sci', text: 'A science one?' }]);
    render(<QuestionReviewPage onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: '📚 Browse all' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'science' } });
    expect(await screen.findByText('A science one?')).toBeInTheDocument();
    finish([{ ...banked, id: 'q-stale', text: 'An old page?' }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('An old page?')).toBeNull();
  });

  it('📚 a list that can’t load says so; Try again waits in place, then the title takes the focus; no match offers Clear filters', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    review.browseQuestions.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    render(<QuestionReviewPage onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: '📚 Browse all' }));
    const button = await screen.findByRole('button', { name: 'Try again' });
    fireEvent.click(button);
    expect(button).toHaveTextContent('Trying…');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(await screen.findByText('No questions match.', { selector: '.text-gray-500' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: '🛡️ Question review' })).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'retired' } });
    await waitFor(() => expect(review.browseQuestions).toHaveBeenLastCalledWith({ status: 'retired' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(review.browseQuestions).toHaveBeenLastCalledWith({}));
    expect(await screen.findByText('What is 9 − 4?')).toBeInTheDocument();
    vi.mocked(console.warn).mockRestore();
  });

  it('a fix saved while Load more is on its way stays fixed when the page lands', async () => {
    const page = Array.from({ length: 50 }, (_, i) => ({ ...banked, id: `q-${i}`, text: `Question ${i}?` }));
    let finish: (rows: BankQuestion[]) => void = () => {};
    review.browseQuestions.mockResolvedValueOnce(page).mockReturnValueOnce(new Promise<BankQuestion[]>((r) => (finish = r)));
    render(<QuestionReviewPage onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: '📚 Browse all' }));
    const first = (await screen.findByText('Question 0?')).closest('li') as HTMLElement;
    fireEvent.click(within(first).getByRole('button', { name: '✏️ Fix' }));
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    fireEvent.click(within(first).getByRole('radio', { name: 'Right answer: 5' }));
    fireEvent.click(within(first).getByRole('button', { name: '💾 Save fix' }));
    expect(await within(first).findByText('Approved')).toBeInTheDocument();
    finish([{ ...banked, id: 'q-new', text: 'A new one?' }]);
    expect(await screen.findByText('A new one?')).toBeInTheDocument();
    const again = screen.getByText('Question 0?', { selector: 'p' }).closest('li') as HTMLElement;
    expect(within(again).getByText('Approved')).toBeInTheDocument();
    expect(within(again).getByText(/\(the right answer\)/).parentElement).toHaveTextContent('5');
  });

  it('a fix or decision on ⏳ Waiting brings 📚 Browse’s copy up to date; Cancel there keeps the focus on its own tab', async () => {
    review.browseQuestions.mockResolvedValue([
      { ...banked, id: 'q-live', text: 'What is 7 + 5?', options: ['11', '12', '13', '10'], correctIndex: 1 },
      { ...banked, id: 'q-held', text: 'Which planet is red?', status: 'review' },
    ]);
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(screen.getByRole('button', { name: '📚 Browse all' }));
    await screen.findByRole('list', { name: 'Saved questions' });
    fireEvent.click(screen.getByRole('button', { name: /⏳ Waiting/ }));
    const waiting = screen.getByRole('list', { name: 'Questions waiting for review' });
    // Cancel finds Waiting's own ✏️ Fix, not Browse's hidden twin.
    fireEvent.click(within(within(waiting).getByText('What is 7 + 5?', { selector: 'p' }).closest('li') as HTMLElement).getByRole('button', { name: '✏️ Fix' }));
    fireEvent.click(within(waiting).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(within(within(waiting).getByText('What is 7 + 5?', { selector: 'p' }).closest('li') as HTMLElement).getByRole('button', { name: '✏️ Fix' })).toHaveFocus(),
    );
    // Fix one, retire the other.
    const live = within(waiting).getByText('What is 7 + 5?', { selector: 'p' }).closest('li') as HTMLElement;
    fireEvent.click(within(live).getByRole('button', { name: '✏️ Fix' }));
    fireEvent.click(within(live).getByRole('radio', { name: 'Right answer: 13' }));
    fireEvent.click(within(live).getByRole('button', { name: '💾 Save fix' }));
    await screen.findByText('1 question waiting');
    const held = within(waiting).getByText('Which planet is red?', { selector: 'p' }).closest('li') as HTMLElement;
    fireEvent.click(within(held).getByRole('button', { name: '🗑️ Retire' }));
    fireEvent.click(within(held).getByRole('button', { name: 'Yes, retire' }));
    await screen.findByText(/Nothing waiting/);
    fireEvent.click(screen.getByRole('button', { name: '📚 Browse all' }));
    const bank = screen.getByRole('list', { name: 'Saved questions' });
    const fixed = within(bank).getByText('What is 7 + 5?', { selector: 'p' }).closest('li') as HTMLElement;
    expect(within(fixed).getByText('Approved')).toBeInTheDocument();
    expect(within(fixed).getByText(/\(the right answer\)/).parentElement).toHaveTextContent('13');
    const retired = within(bank).getByText('Which planet is red?', { selector: 'p' }).closest('li') as HTMLElement;
    expect(within(retired).getByText('Retired')).toBeInTheDocument();
    expect(within(retired).getByText("Retired questions can't be fixed.")).toBeInTheDocument();
    expect(within(retired).queryByRole('button', { name: '✏️ Fix' })).toBeNull();
  });

  it('Back’s question goes once nothing is unsaved, and asks again for the next fix', async () => {
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(within(card('What is 7 + 5?')).getByRole('button', { name: '✏️ Fix' }));
    fireEvent.change(within(card('What is 7 + 5?')).getByRole('textbox', { name: 'Answer 1' }), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: '← Back to Grown-ups' }));
    expect(screen.getByText(/isn't saved yet/)).toBeInTheDocument();
    fireEvent.click(within(card('What is 7 + 5?')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText(/isn't saved yet/)).toBeNull());
    fireEvent.click(within(card('What is 7 + 5?')).getByRole('button', { name: '✏️ Fix' }));
    fireEvent.change(within(card('What is 7 + 5?')).getByRole('textbox', { name: 'Answer 1' }), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: '← Back to Grown-ups' }));
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByText(/isn't saved yet/)).toBeInTheDocument();
  });

  it('📚 a filter tried while a fix holds changes says why, out loud, and its fields are 16px', async () => {
    render(<QuestionReviewPage onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: '📚 Browse all' }));
    const c = (await screen.findByText('What is 9 − 4?', { selector: 'p' })).closest('li') as HTMLElement;
    expect(screen.getByLabelText('Topic')).toHaveClass('text-base');
    fireEvent.click(within(c).getByRole('button', { name: '✏️ Fix' }));
    fireEvent.click(within(c).getByRole('radio', { name: 'Right answer: 5' }));
    expect(screen.getByRole('button', { name: /📚 Browse all/ })).toHaveTextContent('· fix not saved');
    expect(screen.getByLabelText('Topic')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Topic')).toHaveAccessibleDescription('Save or cancel your fix first — a new list would lose it.');
    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'math' } });
    expect(screen.getByText('Save or cancel your fix first — a new list would lose it.', { selector: '.text-amber-700' })).toBeInTheDocument();
    expect(review.browseQuestions).toHaveBeenCalledTimes(1);
  });

  it('Enter in an answer moves to the next answer and never saves', async () => {
    render(<QuestionReviewPage onBack={onBack} />);
    await screen.findByText('2 questions waiting');
    fireEvent.click(within(card('What is 7 + 5?')).getByRole('button', { name: '✏️ Fix' }));
    const form = screen.getByRole('form', { name: 'Fix this question' });
    fireEvent.keyDown(within(form).getByRole('textbox', { name: 'Answer 1' }), { key: 'Enter' });
    expect(within(form).getByRole('textbox', { name: 'Answer 2' })).toHaveFocus();
    expect(review.fixQuestion).not.toHaveBeenCalled();
  });
});
