import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { flagQuestionMock } = vi.hoisted(() => ({ flagQuestionMock: vi.fn() }));

vi.mock('../lib/questions', async () => {
  const actual = await vi.importActual<typeof import('../lib/questions')>('../lib/questions');
  return { ...actual, flagQuestion: flagQuestionMock };
});

import FlagButton from './FlagButton';

beforeEach(() => {
  flagQuestionMock.mockReset();
});

describe('FlagButton', () => {
  it('starts with a "Report this question" affordance', () => {
    render(<FlagButton questionId="q-1" />);
    expect(screen.getByRole('button', { name: /report this question/i })).toBeInTheDocument();
  });

  it('opens a reason picker on click, then closes on Cancel', () => {
    render(<FlagButton questionId="q-1" />);
    fireEvent.click(screen.getByRole('button', { name: /report this question/i }));
    expect(screen.getByText(/what.s wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /wrong answer/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/what.s wrong/i)).toBeNull();
  });

  it('submits the chosen reason and shows a "Reported" acknowledgement', async () => {
    flagQuestionMock.mockResolvedValue(undefined);
    render(<FlagButton questionId="q-42" />);
    fireEvent.click(screen.getByRole('button', { name: /report this question/i }));
    fireEvent.click(screen.getByRole('button', { name: /wrong answer/i }));

    await waitFor(() => {
      expect(screen.getByText(/reported/i)).toBeInTheDocument();
    });
    expect(flagQuestionMock).toHaveBeenCalledWith('q-42', 'wrong_answer');
  });

  it('a failed report says so in plain words and keeps the reasons up to try again — the raw error goes to the console (#130 S6)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      flagQuestionMock.mockRejectedValue(new Error("Couldn't flag question — permission denied for table question_flags [42501]"));
      render(<FlagButton questionId="q-1" />);
      fireEvent.click(screen.getByRole('button', { name: /report this question/i }));
      fireEvent.click(screen.getByRole('button', { name: /doesn.t make sense/i }));

      await waitFor(() => {
        expect(screen.getByText("Your report didn't send. Tap a reason to try again.")).toBeInTheDocument();
      });
      expect(screen.queryByText(/permission denied|42501/)).toBeNull();
      expect(warn).toHaveBeenCalledWith('Reporting a question failed:', expect.stringContaining('permission denied'));
      // The reasons are still there, so one more tap tries again.
      flagQuestionMock.mockResolvedValue(undefined);
      fireEvent.click(screen.getByRole('button', { name: /doesn.t make sense/i }));
      await waitFor(() => expect(screen.getByText(/reported/i)).toBeInTheDocument());
    } finally {
      warn.mockRestore();
    }
  });

  it('shows nothing for a question that isn’t in the bank — a report couldn’t reach anyone (#153)', () => {
    const { container, rerender } = render(<FlagButton questionId="starter-math-easy-1" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<FlagButton questionId="fresh-1-0" />);
    expect(container).toBeEmptyDOMElement();
    expect(flagQuestionMock).not.toHaveBeenCalled();
  });

  it('offers "Not OK for kids" first, and sends it as not_for_kids (B10)', async () => {
    flagQuestionMock.mockResolvedValue(undefined);
    render(<FlagButton questionId="q-7" />);
    fireEvent.click(screen.getByRole('button', { name: /report this question/i }));
    const reasons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(reasons[0]).toBe('Not OK for kids');
    fireEvent.click(screen.getByRole('button', { name: 'Not OK for kids' }));
    await waitFor(() => expect(screen.getByText(/We'll take a look/)).toBeInTheDocument());
    expect(flagQuestionMock).toHaveBeenCalledWith('q-7', 'not_for_kids');
  });
});
