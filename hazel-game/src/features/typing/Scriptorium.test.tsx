import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { LibraryEntry } from '../../types';

vi.mock('canvas-confetti', () => ({ default: () => {} }));

const { default: Scriptorium } = await import('./Scriptorium');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { useKeyboardStore } = await import('../../store/keyboardStore');
const { defaultSave } = await import('../../lib/save');
const { LINE_HOLD_MS, SCRIPTORIUM_OPENS_AFTER, SCRIPTORIUM_XP, TYPING_LESSONS, charKey, pageFlag, typingLessonFlag } = await import('../../content/typing');
afterEach(() => vi.useRealTimers());

const missed: LibraryEntry = {
  question: {
    id: 'q-why',
    topic: 'science',
    level: 3,
    text: 'Why does ice float?',
    options: ['It is lighter than water', 'b', 'c', 'd'],
    correctIndex: 0,
    explanation: 'Ice is lighter than the same amount of water, so it floats on top.',
  },
  picked: 2,
};

/** Every lesson up to and including the capitals lesson, cleared. */
function lessonsThroughCapitals(): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const lesson of TYPING_LESSONS) {
    flags[typingLessonFlag(lesson.id)] = true;
    if (lesson.id === SCRIPTORIUM_OPENS_AFTER) break;
  }
  return flags;
}

const addXp = vi.fn();
beforeEach(() => {
  addXp.mockClear();
  useProfileStore.setState({ addXp, profile: null });
  useKeyboardStore.getState().reset();
  useKeyboardStore.getState().seen();
  useSaveStore.setState({
    userId: null,
    status: 'ready',
    remoteError: null,
    save: { ...defaultSave(), typingAnchor: false, library: [missed], flags: lessonsThroughCapitals() },
  });
});

function typeLine(line: string) {
  if (!vi.isFakeTimers()) vi.useFakeTimers();
  for (const ch of line) {
    const found = charKey(ch)!;
    fireEvent.keyDown(window, { code: found.key.code, key: ch, shiftKey: found.shift });
    fireEvent.keyUp(window, { code: found.key.code, key: ch });
  }
}

const flags = () => useSaveStore.getState().save!.flags;

describe('the Scriptorium (#159 item 5)', () => {
  it('asks for a keyboard first, then waits for the capitals lesson', () => {
    useKeyboardStore.getState().reset();
    render(<Scriptorium onBack={() => {}} />);
    expect(screen.getByText('The Scriptorium')).toBeInTheDocument();
    expect(screen.getByText('Press any key on your keyboard to begin.')).toBeInTheDocument();
    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' });
    expect(screen.getByText('📜 The Scriptorium')).toBeInTheDocument();
    act(() => {
      useSaveStore.setState({ save: { ...useSaveStore.getState().save!, flags: { [typingLessonFlag(TYPING_LESSONS[0].id)]: true } } });
    });
    expect(screen.getByText(/Clear typing lesson 12 \(Capitals/)).toBeInTheDocument();
    expect(screen.getByText(/1 of 12 so far/)).toBeInTheDocument();
  });

  it("the shelf's page first: its lines copied pay XP once, set its flag, and it leaves the desk", () => {
    render(<Scriptorium onBack={() => {}} />);
    expect(screen.getByText('No pages copied yet', { exact: false })).toBeInTheDocument();
    const pages = screen.getAllByRole('button').filter((b) => /lines?$/.test(b.textContent ?? ''));
    expect(pages[0]).toHaveTextContent('Why does ice float?');
    expect(pages[0]).toHaveTextContent('From your shelf');
    expect(pages[1]).toHaveTextContent('A true fact');
    fireEvent.click(pages[0]);
    expect(screen.getByText(/The question that stumped you/)).toHaveTextContent('Why does ice float?');
    expect(screen.getByText('Line 1 of 2')).toBeInTheDocument();
    typeLine('Ice is lighter than the same amount of');
    // Back during the beat, then the page again at once: the old beat must not move the new page on (review round 4).
    fireEvent.click(screen.getByText('← Back to the pages'));
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('Why does ice float?'))!);
    act(() => {
      vi.advanceTimersByTime(LINE_HOLD_MS + 10);
    });
    expect(screen.getByText('Line 1 of 2')).toBeInTheDocument();
    typeLine('Ice is lighter than the same amount of');
    // The finished line stays a beat, all green, before the next (review round 3); the passage shows the way.
    expect(screen.getByText('Type: Ice is lighter than the same amount of')).toBeInTheDocument();
    expect(screen.getByTestId('passage')).toHaveTextContent('Ice is lighter than the same amount of water, so it floats on top.');
    act(() => {
      vi.advanceTimersByTime(LINE_HOLD_MS + 10);
    });
    expect(screen.getByText('Line 2 of 2')).toBeInTheDocument();
    typeLine('water, so it floats on top.');
    // The result card after the same beat (review round 4).
    expect(screen.queryByText('Page copied!')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(LINE_HOLD_MS + 10);
    });
    expect(screen.getByText('Page copied!')).toBeInTheDocument();
    expect(screen.getByText(`⭐ +${SCRIPTORIUM_XP} XP`)).toBeInTheDocument();
    expect(addXp).toHaveBeenCalledTimes(1);
    expect(addXp).toHaveBeenCalledWith(SCRIPTORIUM_XP);
    expect(flags()[pageFlag('q-why')]).toBe(true);
    // Back on the desk the shelf page is gone and the count moved on.
    fireEvent.click(screen.getByText('← Back to the pages'));
    expect(screen.getByText('1 page copied', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText('Why does ice float?')).toBeNull();
    // ➡️ Next page opens the next one straight from the result screen.
    const next = screen.getAllByRole('button').filter((b) => /lines?$/.test(b.textContent ?? ''))[0];
    fireEvent.click(next);
    fireEvent.click(screen.getByText('← Back to the pages'));
    expect(screen.getByText('📜 The Scriptorium')).toBeInTheDocument();
  });

  it('a page copied before pays nothing again; the desk says so', () => {
    useSaveStore.setState({ save: { ...useSaveStore.getState().save!, flags: { ...flags(), [pageFlag('q-why')]: true } } });
    render(<Scriptorium onBack={() => {}} />);
    expect(screen.queryByText(/Why does ice float/)).toBeNull();
    expect(screen.getByText('1 page copied', { exact: false })).toBeInTheDocument();
  });
});
