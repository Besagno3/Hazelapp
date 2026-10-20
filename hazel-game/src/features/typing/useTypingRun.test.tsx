import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useTypingRun } from './useTypingRun';
import { useKeyboardStore, watchKeyboard } from '../../store/keyboardStore';

function Probe({ text, active = true, holdRule = false }: { text: string; active?: boolean; holdRule?: boolean }) {
  const run = useTypingRun({ text, holdRule, active });
  return (
    <div>
      <input aria-label="field" />
      <button>Carry on</button>
      <output data-testid="index">{run.progress.index}</output>
      <output data-testid="held">{[...run.held].join(',')}</output>
      <output data-testid="caps">{String(run.last?.capsLock ?? '')}</output>
    </div>
  );
}

afterEach(() => {
  cleanup();
  useKeyboardStore.getState().reset();
});

describe('useTypingRun (#165 review rounds 2–3)', () => {
  it('a focused text field keeps its keys: nothing typed, nothing prevented', () => {
    render(<Probe text="fj" />);
    const field = screen.getByLabelText('field');
    field.focus();
    const notPrevented = fireEvent.keyDown(field, { code: 'KeyF', key: 'f' });
    expect(notPrevented).toBe(true);
    expect(screen.getByTestId('index')).toHaveTextContent('0');
    field.blur();
    fireEvent.keyDown(window, { code: 'KeyF', key: 'f' });
    expect(screen.getByTestId('index')).toHaveTextContent('1');
  });

  it("a Space the line takes off a focused button is taken on keyup too; a button's own Space is not", () => {
    render(<Probe text="a b" />);
    const button = screen.getByRole('button');
    button.focus();
    // The line wants "a": Space is the button's, down and up.
    expect(fireEvent.keyDown(button, { code: 'Space', key: ' ' })).toBe(true);
    expect(fireEvent.keyUp(button, { code: 'Space', key: ' ' })).toBe(true);
    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' });
    fireEvent.keyUp(window, { code: 'KeyA', key: 'a' });
    // Now the line wants a space: both halves are the line's.
    expect(fireEvent.keyDown(button, { code: 'Space', key: ' ' })).toBe(false);
    expect(fireEvent.keyUp(button, { code: 'Space', key: ' ' })).toBe(false);
    expect(screen.getByTestId('index')).toHaveTextContent('2');
    // The next keyup is ordinary again.
    expect(fireEvent.keyUp(button, { code: 'Space', key: ' ' })).toBe(true);
  });

  it('Caps Lock is blamed for a letter only (review round 5)', () => {
    render(<Probe text="!f" />);
    fireEvent.keyDown(window, { code: 'Digit1', key: '1', modifierCapsLock: true });
    expect(screen.getByTestId('caps')).toHaveTextContent('false');
    fireEvent.keyDown(window, { code: 'Digit1', key: '!' });
    fireEvent.keyDown(window, { code: 'KeyF', key: 'F', modifierCapsLock: true });
    expect(screen.getByTestId('caps')).toHaveTextContent('true');
  });

  it('an anchor already down as the run starts counts as held (review round 6)', () => {
    const stop = watchKeyboard();
    fireEvent.keyDown(window, { code: 'KeyJ', key: 'j' });
    render(<Probe text="ff" holdRule />);
    expect(screen.getByTestId('held')).toHaveTextContent('KeyJ');
    fireEvent.keyDown(window, { code: 'KeyF', key: 'f' });
    expect(screen.getByTestId('index')).toHaveTextContent('1');
    fireEvent.keyUp(window, { code: 'KeyF', key: 'f' });
    fireEvent.keyUp(window, { code: 'KeyJ', key: 'j' });
    stop();
  });

  it('a repeat of a key never seen going down counts as a press; one let go of before the run attaches does not (review rounds 6–7)', () => {
    render(<Probe text="ff" holdRule />);
    // No watcher: only the auto-repeat says J is down.
    fireEvent.keyDown(window, { code: 'KeyJ', key: 'j', repeat: true });
    expect(screen.getByTestId('held')).toHaveTextContent('KeyJ');
    fireEvent.keyDown(window, { code: 'KeyF', key: 'f' });
    expect(screen.getByTestId('index')).toHaveTextContent('1');
    fireEvent.keyUp(window, { code: 'KeyF', key: 'f' });
    fireEvent.keyUp(window, { code: 'KeyJ', key: 'j' });
    cleanup();
    // J down at render, up before the run attaches: not held.
    const stop = watchKeyboard();
    fireEvent.keyDown(window, { code: 'KeyJ', key: 'j' });
    const { rerender } = render(<Probe text="ff" holdRule active={false} />);
    fireEvent.keyUp(window, { code: 'KeyJ', key: 'j' });
    rerender(<Probe text="ff" holdRule />);
    expect(screen.getByTestId('held')).toHaveTextContent('');
    fireEvent.keyDown(window, { code: 'KeyF', key: 'f' });
    expect(screen.getByTestId('index')).toHaveTextContent('0');
    fireEvent.keyUp(window, { code: 'KeyF', key: 'f' });
    stop();
  });

  it('a key still down when the run ends is let go of', () => {
    const { rerender } = render(<Probe text="fj" />);
    fireEvent.keyDown(window, { code: 'KeyJ', key: 'j' });
    expect(screen.getByTestId('held')).toHaveTextContent('KeyJ');
    rerender(<Probe text="fj" active={false} />);
    expect(screen.getByTestId('held')).toHaveTextContent('');
  });
});
