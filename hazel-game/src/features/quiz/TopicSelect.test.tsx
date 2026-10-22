import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import TopicSelect from './TopicSelect';
import { ALL_TOPIC_INFO } from '../../content/topics';

const sendFlow = vi.fn();
vi.mock('../../machines/gameFlow', () => ({ sendFlow: (e: unknown) => sendFlow(e) }));

describe('TopicSelect', () => {
  it('keeps every topic open, even one picked before', () => {
    render(<TopicSelect />);
    const first = ALL_TOPIC_INFO[0];
    for (let round = 0; round < 3; round++) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(first.label) }));
    }
    expect(sendFlow).toHaveBeenCalledTimes(3);
    expect(sendFlow).toHaveBeenLastCalledWith({ type: 'PICK_TOPIC', topic: first.id });
    for (const t of ALL_TOPIC_INFO) {
      const button = screen.getByRole('button', { name: new RegExp(t.label) });
      expect(button).toBeEnabled();
      expect(button.textContent).not.toContain('Completed');
    }
  });

  it('🆚 Quiz Duel is a button above the topics, before the world opens too (#177)', () => {
    sendFlow.mockClear();
    render(<TopicSelect />);
    const duel = screen.getByRole('button', { name: /Quiz Duel/ });
    expect(duel).toHaveTextContent('2 players');
    const firstTopic = screen.getByRole('button', { name: new RegExp(ALL_TOPIC_INFO[0].label) });
    expect(duel.compareDocumentPosition(firstTopic) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(duel);
    expect(sendFlow).toHaveBeenCalledWith({ type: 'START_DUEL' });
  });

  it('the level, streak and Switch sit in a top bar in the page, not over the heading (#110h)', () => {
    render(<TopicSelect />);
    const bar = screen.getByTestId('screen-topbar');
    // In the page, not floating: it can't cover "Training Grounds" or the rounds line.
    expect(bar.querySelector('.fixed')).toBeNull();
    expect(bar).toHaveTextContent(/Level/);
    expect(within(bar).getByRole('button', { name: 'Switch player' })).toBeInTheDocument();
    const heading = screen.getByRole('heading', { name: 'Training Grounds' });
    expect(bar.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
