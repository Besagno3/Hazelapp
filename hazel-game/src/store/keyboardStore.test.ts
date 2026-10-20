import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { keysDown, useKeyboardStore, watchKeyboard } from './keyboardStore';

beforeEach(() => useKeyboardStore.getState().reset());

describe('keyboardStore (#159)', () => {
  it('a real key marks a keyboard present; a glass keyboard\'s key does not; the watcher unsubscribes', () => {
    const stop = watchKeyboard();
    fireEvent.keyDown(window, { code: '', key: 'a' });
    expect(useKeyboardStore.getState().present).toBe(false);
    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' });
    expect(useKeyboardStore.getState().present).toBe(true);
    // Written once (review round 2): more keys change nothing.
    const changed = vi.fn();
    const unsub = useKeyboardStore.subscribe(changed);
    fireEvent.keyDown(window, { code: 'KeyB', key: 'b' });
    fireEvent.keyDown(window, { code: 'KeyB', key: 'b', repeat: true });
    expect(changed).not.toHaveBeenCalled();
    unsub();
    // The keys down right now (review round 6): held across runs, let go on keyup.
    expect([...keysDown()]).toContain('KeyB');
    fireEvent.keyUp(window, { code: 'KeyB', key: 'b' });
    expect([...keysDown()]).not.toContain('KeyB');
    useKeyboardStore.getState().reset();
    stop();
    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' });
    expect(useKeyboardStore.getState().present).toBe(false);
  });
});
