import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { useKeyboardStore, watchKeyboard } from './keyboardStore';

beforeEach(() => useKeyboardStore.getState().reset());

describe('keyboardStore (#159)', () => {
  it('a real key marks a keyboard present; a glass keyboard\'s key does not; the watcher unsubscribes', () => {
    const stop = watchKeyboard();
    fireEvent.keyDown(window, { code: '', key: 'a' });
    expect(useKeyboardStore.getState().present).toBe(false);
    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' });
    expect(useKeyboardStore.getState().present).toBe(true);
    useKeyboardStore.getState().reset();
    stop();
    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' });
    expect(useKeyboardStore.getState().present).toBe(false);
  });
});
