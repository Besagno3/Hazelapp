import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ModalLayer from './ModalLayer';

describe('Escape in a ModalLayer (#128, #110o)', () => {
  it('does what the overlay says Escape does — once, not again for a held key', () => {
    const onEscape = vi.fn();
    render(
      <ModalLayer label="Box" className="fixed inset-0" onEscape={onEscape}>
        <button autoFocus>OK</button>
      </ModalLayer>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'OK' }), { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('button', { name: 'OK' }), { key: 'Escape', repeat: true });
    expect(onEscape).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Box' }), { key: 'Enter' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('with nothing to cancel the overlay passes none, and Escape does nothing; its own key handler still runs', () => {
    const onKeyDown = vi.fn();
    render(
      <ModalLayer label="Question" className="fixed inset-0" onKeyDown={onKeyDown}>
        <p>2 + 2?</p>
      </ModalLayer>,
    );
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Question' }), { key: 'Escape' });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(screen.getByText('2 + 2?')).toBeInTheDocument();
  });

  it('a panel inside that handles Escape itself goes first ("Leave the Spire?")', () => {
    const onEscape = vi.fn();
    const inner = vi.fn();
    render(
      <ModalLayer label="Spire" className="fixed inset-0" onEscape={onEscape}>
        <div
          role="alertdialog"
          aria-label="Leave?"
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            inner();
          }}
        >
          <button autoFocus>Keep climbing</button>
        </div>
      </ModalLayer>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Keep climbing' }), { key: 'Escape' });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(onEscape).not.toHaveBeenCalled();
  });
});
