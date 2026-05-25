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

  it('surfaces the underlying error when the flag insert fails', async () => {
    flagQuestionMock.mockRejectedValue(new Error('permission denied'));
    render(<FlagButton questionId="q-1" />);
    fireEvent.click(screen.getByRole('button', { name: /report this question/i }));
    fireEvent.click(screen.getByRole('button', { name: /doesn.t make sense/i }));

    await waitFor(() => {
      expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
    });
  });
});
