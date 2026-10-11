import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
});
