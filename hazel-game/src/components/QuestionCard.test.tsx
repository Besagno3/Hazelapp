import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QuestionCard from './QuestionCard';
import { useProfileStore } from '../store/profileStore';
import type { Question } from '../types';

vi.mock('../lib/audio', () => ({ sfx: vi.fn() }));
const { markSeen } = vi.hoisted(() => ({ markSeen: vi.fn() }));
vi.mock('../lib/seen', () => ({ markSeen }));

const q: Question = { id: 'q', topic: 'math', level: 3, text: 'What is 2 + 2?', options: ['4', '5', '6', '7'], correctIndex: 0 };

describe('QuestionCard — on screen = seen (#134)', () => {
  it('marks its question seen once it shows, and the next one when it changes', () => {
    markSeen.mockClear();
    const { rerender } = render(<QuestionCard question={q} onAnswered={() => {}} onContinue={() => {}} />);
    expect(markSeen).toHaveBeenCalledWith('q');
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(markSeen).toHaveBeenCalledTimes(1);
    rerender(<QuestionCard question={{ ...q, id: 'q2' }} onAnswered={() => {}} onContinue={() => {}} />);
    expect(markSeen).toHaveBeenLastCalledWith('q2');
  });
});

describe('QuestionCard — a Forget-Me-Knot gives a second try (#75 item 14e)', () => {
  it('a Hint Feather first, then a wrong pick on the last wrong option: final — the knot stays tied (review fix)', () => {
    const onAnswered = vi.fn();
    const onSecondChance = vi.fn();
    render(<QuestionCard question={q} hints={1} onUseHint={() => {}} secondChance onSecondChance={onSecondChance} onAnswered={onAnswered} onContinue={() => {}} />);
    fireEvent.click(screen.getByText(/Use a Hint Feather/));
    const lastWrong = ['5', '6', '7'].find((o) => screen.queryByRole('button', { name: o }))!;
    fireEvent.click(screen.getByRole('button', { name: lastWrong }));
    expect(onSecondChance).not.toHaveBeenCalled();
    expect(onAnswered).toHaveBeenCalledWith(false, q.options.indexOf(lastWrong));
  });

  it('keyboard focus stays on the crossed-out answer (review fix)', () => {
    render(<QuestionCard question={q} secondChance onSecondChance={() => {}} onAnswered={() => {}} onContinue={() => {}} />);
    const five = screen.getByRole('button', { name: '5' });
    five.focus();
    fireEvent.click(five);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '5 — not this one' }));
  });

  it('the first wrong pick is crossed out, not answered; the next pick counts', () => {
    const onAnswered = vi.fn();
    const onSecondChance = vi.fn();
    const onContinue = vi.fn();
    render(<QuestionCard question={q} secondChance onSecondChance={onSecondChance} onAnswered={onAnswered} onContinue={onContinue} />);
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    expect(onSecondChance).toHaveBeenCalledTimes(1);
    expect(onAnswered).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('your Forget-Me-Knot gives you a second try. Take your time!');
    expect(screen.getByRole('button', { name: '5 — not this one' })).toHaveAttribute('aria-disabled', 'true');
    // Picking it again does nothing.
    fireEvent.click(screen.getByRole('button', { name: '5 — not this one' }));
    expect(onAnswered).not.toHaveBeenCalled();
    expect(screen.queryByText('▶ Go!')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(onAnswered).toHaveBeenCalledWith(true, 0);
    fireEvent.click(screen.getByText('Continue'));
    expect(onContinue).toHaveBeenCalledWith(true);
  });

  it('only once: a second wrong pick is the answer', () => {
    const onAnswered = vi.fn();
    render(<QuestionCard question={q} secondChance onSecondChance={() => {}} onAnswered={onAnswered} onContinue={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: '6' }));
    expect(onAnswered).toHaveBeenCalledWith(false, 2);
    expect(screen.getByText(/The answer is: 4/)).toBeInTheDocument();
  });

  it('a right first pick spends nothing, and without a knot a wrong pick is final', () => {
    const onSecondChance = vi.fn();
    const first = render(<QuestionCard question={q} secondChance onSecondChance={onSecondChance} onAnswered={() => {}} onContinue={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(onSecondChance).not.toHaveBeenCalled();
    first.unmount();
    const onAnswered = vi.fn();
    render(<QuestionCard question={q} onAnswered={onAnswered} onContinue={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    expect(onAnswered).toHaveBeenCalledWith(false, 1);
  });

  it('a Hint Feather after the cross-out still leaves a wrong answer to choose from', () => {
    for (let run = 0; run < 20; run++) {
      const { unmount } = render(
        <QuestionCard question={q} hints={1} onUseHint={() => {}} secondChance onSecondChance={() => {}} onAnswered={() => {}} onContinue={() => {}} />,
      );
      fireEvent.click(screen.getByRole('button', { name: '5' }));
      fireEvent.click(screen.getByText(/Use a Hint Feather/));
      const pickable = ['4', '5', '6', '7'].filter((o) => {
        const b = screen.queryByRole('button', { name: o });
        return !!b && !b.hasAttribute('disabled') && b.getAttribute('aria-disabled') !== 'true';
      });
      expect(pickable).toContain('4');
      expect(pickable.length, `run ${run}: ${pickable}`).toBe(2);
      unmount();
    }
  });
});

describe('QuestionCard — any question can be reported (B10)', () => {
  it('shows 🚩 Report this question once answered, not before', () => {
    render(<QuestionCard question={q} onAnswered={() => {}} onContinue={() => {}} />);
    expect(screen.queryByRole('button', { name: /report this question/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    fireEvent.click(screen.getByRole('button', { name: /report this question/i }));
    expect(screen.getByRole('button', { name: 'Not OK for kids' })).toBeInTheDocument();
  });
});

describe('QuestionCard — a slot under the options once answered (#165)', () => {
  const question: Question = { id: 'q-slot', topic: 'math', level: 1, text: '1 + 1?', options: ['2', '3', '4', '5'], correctIndex: 0 };
  it('shows afterAnswer only once an answer is picked', () => {
    render(<QuestionCard question={question} onAnswered={() => {}} onContinue={() => {}} afterAnswer={<p>a scribe burst</p>} />);
    expect(screen.queryByText('a scribe burst')).toBeNull();
    fireEvent.click(screen.getByText('2'));
    expect(screen.getByText('a scribe burst')).toBeInTheDocument();
  });
});

describe("QuestionCard — the final pick counts for the kid's day (#173)", () => {
  it('a pick is noted once, right or wrong; a Forget-Me-Knot cross-out is not a pick', () => {
    const noteAnswer = vi.fn();
    useProfileStore.setState({ noteAnswer });
    const { unmount } = render(<QuestionCard question={q} secondChance onSecondChance={() => {}} onAnswered={() => {}} onContinue={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '5' })); // crossed out: picks again
    expect(noteAnswer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(noteAnswer).toHaveBeenCalledTimes(1);
    expect(noteAnswer).toHaveBeenCalledWith(q, true);
    unmount();
    render(<QuestionCard question={{ ...q, id: 'q3' }} onAnswered={() => {}} onContinue={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '6' }));
    fireEvent.click(screen.getByRole('button', { name: '7' })); // answered already: nothing more
    expect(noteAnswer).toHaveBeenCalledTimes(2);
    expect(noteAnswer).toHaveBeenLastCalledWith({ ...q, id: 'q3' }, false);
  });
});
