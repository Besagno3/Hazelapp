import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('focus lost inside a ModalLayer (#110o r1)', () => {
  /** A layer whose one button goes away once used — like ✨ Learn or a Library shelf entry. */
  function Shelf({ onEscape }: { onEscape: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <ModalLayer label="Library" className="fixed inset-0" onEscape={onEscape}>
        {open ? <p>2 + 2?</p> : <button onClick={() => setOpen(true)}>A question</button>}
      </ModalLayer>
    );
  }

  it('Escape still does the way out once the focused button has gone and focus is on nothing', () => {
    const onEscape = vi.fn();
    render(<Shelf onEscape={onEscape} />);
    const entry = screen.getByRole('button', { name: 'A question' });
    entry.focus();
    fireEvent.click(entry);
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape', repeat: true });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('focus comes back into the layer when its button goes away, or turns off under it', async () => {
    render(<Shelf onEscape={() => {}} />);
    const entry = screen.getByRole('button', { name: 'A question' });
    entry.focus();
    fireEvent.click(entry);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Library' })));
    cleanup();

    function Inn() {
      const [rested, setRested] = useState(false);
      return (
        <ModalLayer label="Inn" className="fixed inset-0" onEscape={() => {}}>
          <button disabled={rested} onClick={() => setRested(true)}>
            Rest
          </button>
        </ModalLayer>
      );
    }
    render(<Inn />);
    const rest = screen.getByRole('button', { name: 'Rest' });
    rest.focus();
    fireEvent.click(rest);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Inn' })));
  });

  it('only the top layer hears a key pressed with focus on nothing', () => {
    const below = vi.fn();
    const above = vi.fn();
    const menu = (
      <ModalLayer key="menu" label="Menu" className="fixed inset-0" onEscape={below}>
        <p>Menu</p>
      </ModalLayer>
    );
    const { rerender } = render(<>{[menu]}</>);
    // The level-up comes up beside the open Menu.
    rerender(
      <>
        {[
          menu,
          <ModalLayer key="up" label="Level up" className="fixed inset-0" onEscape={above}>
            <p>Level 5!</p>
          </ModalLayer>,
        ]}
      </>,
    );
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(above).toHaveBeenCalledTimes(1);
    expect(below).not.toHaveBeenCalled();
  });
});

describe('closing a ModalLayer gives the keys back (#110o r1)', () => {
  /** 📜 Menu and the layer it opens. */
  function World() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>📜 Menu</button>
        {open && (
          <ModalLayer label="Menu" className="fixed inset-0" onEscape={() => setOpen(false)}>
            <button onClick={() => setOpen(false)}>Back to the world</button>
          </ModalLayer>
        )}
      </>
    );
  }

  it('closed with its own button, focus goes back to 📜 Menu; closed by Escape, to the world (the next Space is a talk)', () => {
    render(<World />);
    const menu = screen.getByRole('button', { name: '📜 Menu' });
    menu.focus();
    fireEvent.click(menu);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the world' }));
    expect(document.activeElement).toBe(menu);

    fireEvent.click(menu);
    // A tap or another key inside first doesn't count: only the Escape that closes it.
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Menu' }), { key: 'Tab' });
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Menu' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).not.toBe(menu);
    expect(document.activeElement).toBe(document.body);
  });

  it('closed by Escape over another layer, focus goes back into that layer', () => {
    function Stack() {
      const [top, setTop] = useState(false);
      return (
        <ModalLayer label="Menu" className="fixed inset-0">
          <button onClick={() => setTop(true)}>✨ Field spells</button>
          {top && (
            <ModalLayer label="Spells" className="fixed inset-0" onEscape={() => setTop(false)}>
              <button autoFocus>Cast</button>
            </ModalLayer>
          )}
        </ModalLayer>
      );
    }
    render(<Stack />);
    const spells = screen.getByRole('button', { name: '✨ Field spells' });
    spells.focus();
    fireEvent.click(spells);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cast' }), { key: 'Escape' });
    expect(document.activeElement).toBe(spells);
  });
});
