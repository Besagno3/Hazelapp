import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

vi.mock('canvas-confetti', () => ({ default: () => {} }));

const { default: TypingLessons } = await import('./TypingLessons');
const { useSaveStore } = await import('../../store/saveStore');
const { spellLine } = await import('./hints');
const { useProfileStore } = await import('../../store/profileStore');
const { useKeyboardStore } = await import('../../store/keyboardStore');
const { defaultSave } = await import('../../lib/save');
const { LINE_HOLD_MS, TYPING_BADGE_ID, TYPING_LESSONS, TYPING_LESSON_XP, anchorsFor, charKey, typingLessonFlag } = await import('../../content/typing');
afterEach(() => vi.useRealTimers());

const addXp = vi.fn();
beforeEach(() => {
  addXp.mockClear();
  useProfileStore.setState({ addXp, profile: null });
  useKeyboardStore.getState().reset();
  useSaveStore.setState({ userId: null, save: defaultSave(), status: 'ready', remoteError: null });
});

/** Press one character the touch-typing way: the other hand's key down first, if the hold asks for one. */
function pressChar(ch: string, hold = true) {
  const found = charKey(ch)!;
  const anchor = hold ? anchorsFor(ch)[0] : undefined;
  if (anchor) fireEvent.keyDown(window, { code: anchor, key: anchor.startsWith('Shift') ? 'Shift' : anchor === 'KeyF' ? 'f' : 'j' });
  fireEvent.keyDown(window, { code: found.key.code, key: ch });
  fireEvent.keyUp(window, { code: found.key.code, key: ch });
  if (anchor) fireEvent.keyUp(window, { code: anchor, key: anchor.startsWith('Shift') ? 'Shift' : anchor === 'KeyF' ? 'f' : 'j' });
}

/** Types a line, then waits out the beat it stays on screen (review round 3). */
function typeLine(line: string, hold = true) {
  if (!vi.isFakeTimers()) vi.useFakeTimers();
  for (const ch of line) pressChar(ch, hold);
  act(() => {
    vi.advanceTimersByTime(LINE_HOLD_MS + 10);
  });
}

const flags = () => useSaveStore.getState().save!.flags;
const openLessons = () => screen.getAllByRole('button').filter((b) => /\d+\. /.test(b.textContent ?? '') && !/^(Start|Continue): /.test(b.textContent?.replace(/^▶/, '') ?? ''));

describe('TypingLessons (#165)', () => {
  it('asks for a real keyboard first: a glass keyboard changes nothing, a physical key opens the lessons', () => {
    render(<TypingLessons onBack={() => {}} />);
    expect(screen.getByText('Press any key on your keyboard to begin.')).toBeInTheDocument();
    fireEvent.keyDown(window, { code: '', key: 'a' });
    expect(screen.getByText('Press any key on your keyboard to begin.')).toBeInTheDocument();
    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' });
    expect(screen.getByText('⌨️ Typing lessons')).toBeInTheDocument();
    expect(screen.getByText(`0 of ${TYPING_LESSONS.length} lessons cleared`)).toBeInTheDocument();
    // Only the first lesson is open.
    const buttons = openLessons();
    expect(buttons).toHaveLength(TYPING_LESSONS.length);
    expect(buttons[0]).toHaveAttribute('aria-disabled', 'false');
    // Locked rows stay in the Tab order, readable, and say so (review round 1).
    expect(buttons.slice(1).every((b) => b.getAttribute('aria-disabled') === 'true' && !(b as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole('button', { name: /Start: 1\. / })).toBeInTheDocument();
  });

  it('lesson 1: the hold nudges without the other hand, counts with it; cleared, it sets its flag, pays XP once and opens lesson 2', () => {
    useKeyboardStore.getState().seen();
    render(<TypingLessons onBack={() => {}} />);
    fireEvent.click(openLessons()[0]);
    expect(screen.getAllByText(/F and J, the bumpy keys/)[0]).toBeInTheDocument();
    fireEvent.click(screen.getByText('⌨️ Start typing'));
    expect(screen.getByText(`Line 1 of ${TYPING_LESSONS[0].lines.length}`)).toBeInTheDocument();

    // "f" without J held: a nudge, and the line hasn't moved.
    fireEvent.keyDown(window, { code: 'KeyF', key: 'f' });
    fireEvent.keyUp(window, { code: 'KeyF', key: 'f' });
    expect(screen.getByText(/Other hand home! Hold J/)).toHaveAttribute('role', 'status');
    expect(screen.getByText(`Line 1 of ${TYPING_LESSONS[0].lines.length}`)).toBeInTheDocument();

    for (const [i, line] of TYPING_LESSONS[0].lines.entries()) {
      expect(screen.getByText(`Line ${i + 1} of ${TYPING_LESSONS[0].lines.length}`)).toBeInTheDocument();
      typeLine(line);
    }
    expect(screen.getByText('Lesson cleared!')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '3 of 3 stars' })).toBeInTheDocument();
    expect(flags()[typingLessonFlag(TYPING_LESSONS[0].id)]).toBe(true);
    expect(addXp).toHaveBeenCalledWith(TYPING_LESSON_XP);
    expect(screen.getByText(`⭐ +${TYPING_LESSON_XP} XP`)).toBeInTheDocument();

    // Back on the list, lesson 2 is open; the first says cleared.
    fireEvent.click(screen.getByText('← Back to the lessons'));
    expect(screen.getByText(`1 of ${TYPING_LESSONS.length} lessons cleared`)).toBeInTheDocument();
    const buttons = openLessons();
    expect(buttons[1]).toHaveAttribute('aria-disabled', 'false');
    expect(buttons[2]).toHaveAttribute('aria-disabled', 'true');

    // Played again, it pays nothing more.
    addXp.mockClear();
    fireEvent.click(buttons[0]);
    fireEvent.click(screen.getByText('⌨️ Start typing'));
    for (const line of TYPING_LESSONS[0].lines) typeLine(line);
    expect(screen.getByText('Lesson cleared!')).toBeInTheDocument();
    expect(addXp).not.toHaveBeenCalled();
  });

  it('a key pressed in the beat after a line does nothing, and the result card follows its own beat (review round 4)', () => {
    useKeyboardStore.getState().seen();
    vi.useFakeTimers();
    render(<TypingLessons onBack={() => {}} />);
    fireEvent.click(openLessons()[0]);
    fireEvent.click(screen.getByText('⌨️ Start typing'));
    const [first, second] = TYPING_LESSONS[0].lines;
    for (const ch of first) pressChar(ch);
    // Typed in rhythm, straight into the beat: not counted against the next line.
    pressChar(second[0]);
    act(() => {
      vi.advanceTimersByTime(LINE_HOLD_MS + 10);
    });
    expect(screen.getByText(`Line 2 of ${TYPING_LESSONS[0].lines.length}`)).toBeInTheDocument();
    for (const ch of second.slice(0, -1)) pressChar(ch);
    expect(screen.getByText(`Line 2 of ${TYPING_LESSONS[0].lines.length}`)).toBeInTheDocument();
    pressChar(second[second.length - 1]);
    act(() => {
      vi.advanceTimersByTime(LINE_HOLD_MS + 10);
    });
    expect(screen.getByText(`Line 3 of ${TYPING_LESSONS[0].lines.length}`)).toBeInTheDocument();
    // The last line: cleared at once, the card after the beat.
    const rest = TYPING_LESSONS[0].lines.slice(2);
    for (const line of rest.slice(0, -1)) typeLine(line);
    for (const ch of rest[rest.length - 1]) pressChar(ch);
    expect(useSaveStore.getState().save!.flags[typingLessonFlag(TYPING_LESSONS[0].id)]).toBe(true);
    expect(screen.queryByText(/of 3 stars/)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(LINE_HOLD_MS + 10);
    });
    expect(screen.getByRole('img', { name: /of 3 stars/ })).toBeInTheDocument();
  });

  it('a wrong key is a miss with the glowing-key nudge, and costs a star', () => {
    useKeyboardStore.getState().seen();
    render(<TypingLessons onBack={() => {}} />);
    fireEvent.click(openLessons()[0]);
    fireEvent.click(screen.getByText('⌨️ Start typing'));
    // Three wrong keys among a 35-key lesson: under 95%, over 85% → two stars.
    for (let i = 0; i < 3; i++) {
      fireEvent.keyDown(window, { code: 'KeyG', key: 'g' });
      fireEvent.keyUp(window, { code: 'KeyG', key: 'g' });
    }
    expect(screen.getByText(/Not that one/)).toHaveAttribute('role', 'status');
    for (const line of TYPING_LESSONS[0].lines) typeLine(line);
    expect(screen.getByRole('img', { name: '2 of 3 stars' })).toBeInTheDocument();
  });

  it('with the home-row hold off, either hand will do — and the switch is on the list', () => {
    useKeyboardStore.getState().seen();
    render(<TypingLessons onBack={() => {}} />);
    const toggle = screen.getByRole('button', { name: /Home-row hold/ });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(useSaveStore.getState().save!.typingAnchor).toBe(false);
    expect(screen.getByRole('button', { name: /Home-row hold/ })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(openLessons()[0]);
    expect(screen.getByText(/The home-row hold is off/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('⌨️ Start typing'));
    for (const line of TYPING_LESSONS[0].lines) typeLine(line, false);
    expect(screen.getByText('Lesson cleared!')).toBeInTheDocument();
    expect(screen.queryByText(/Other hand home/)).toBeNull();
  });

  it('clearing the last lesson gives the Scribe\'s Quill badge, once', () => {
    useKeyboardStore.getState().seen();
    const last = TYPING_LESSONS[TYPING_LESSONS.length - 1];
    const done = Object.fromEntries(TYPING_LESSONS.slice(0, -1).map((l) => [typingLessonFlag(l.id), true]));
    useSaveStore.setState({ save: { ...defaultSave(), flags: { ...defaultSave().flags, ...done } } });
    render(<TypingLessons onBack={() => {}} />);
    const buttons = openLessons();
    expect(buttons[buttons.length - 1]).toHaveAttribute('aria-disabled', 'false');
    fireEvent.click(buttons[buttons.length - 1]);
    fireEvent.click(screen.getByText('⌨️ Start typing'));
    for (const line of last.lines) typeLine(line);
    expect(screen.getAllByText(/Scribe's Quill badge/)).toHaveLength(2);
    expect(useSaveStore.getState().save!.badges).toEqual([TYPING_BADGE_ID]);
    // No "Next lesson" after the last one.
    expect(screen.queryByText('➡️ Next lesson')).toBeNull();
    // Again: still one badge.
    fireEvent.click(screen.getByText('← Back to the lessons'));
    fireEvent.click(openLessons()[TYPING_LESSONS.length - 1]);
    fireEvent.click(screen.getByText('⌨️ Start typing'));
    for (const line of last.lines) typeLine(line);
    expect(useSaveStore.getState().save!.badges).toEqual([TYPING_BADGE_ID]);
  });

  it('Back to the shelf leaves', () => {
    useKeyboardStore.getState().seen();
    const onBack = vi.fn();
    render(<TypingLessons onBack={onBack} />);
    fireEvent.click(screen.getByText('📚 Back to the shelf'));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('round 1 review fixes (#165)', () => {
  it("Space on a focused button is the button's while a line is up — unless the line wants a space next", () => {
    useKeyboardStore.getState().seen();
    render(<TypingLessons onBack={() => {}} />);
    fireEvent.click(openLessons()[0]);
    fireEvent.click(screen.getByText('⌨️ Start typing'));
    const stop = screen.getByText('← Back to the lessons');
    stop.focus();
    // "f" is next: Space on the button is left alone (not prevented).
    expect(fireEvent.keyDown(stop, { key: ' ', code: 'Space' })).toBe(true);
    const line = TYPING_LESSONS[0].lines[0];
    for (const ch of line.slice(0, line.indexOf(' '))) pressChar(ch);
    // Now a space is wanted: the line takes it, even from a focused button.
    expect(fireEvent.keyDown(stop, { key: ' ', code: 'Space' })).toBe(false);
  });

  it('a wrapped line keeps its words whole: each word is one no-wrap group', () => {
    useKeyboardStore.getState().seen();
    const all: Record<string, boolean> = {};
    for (const l of TYPING_LESSONS) all[typingLessonFlag(l.id)] = true;
    useSaveStore.setState({ save: { ...defaultSave(), flags: all } });
    render(<TypingLessons onBack={() => {}} />);
    const last = TYPING_LESSONS[TYPING_LESSONS.length - 1];
    fireEvent.click(openLessons()[TYPING_LESSONS.length - 1]);
    fireEvent.click(screen.getByText('⌨️ Start typing'));
    // The line is spoken as spelled (round 5), and its tiles sit in word groups.
    const p = screen.getByText(`Type: ${spellLine(last.lines[0])}`).closest('p')!;
    expect(p).toHaveAttribute('data-line', last.lines[0]);
    const groups = Array.from(p.querySelectorAll(':scope > span.whitespace-nowrap'));
    expect(groups.map((g) => g.textContent)).toEqual(last.lines[0].split(/( )/).filter((w) => w !== ''));
  });

  it('the lessons list opens on a Continue button for the next lesson, focused', () => {
    useKeyboardStore.getState().seen();
    useSaveStore.setState({ save: { ...defaultSave(), flags: { [typingLessonFlag(TYPING_LESSONS[0].id)]: true, [typingLessonFlag(TYPING_LESSONS[1].id)]: true } } });
    render(<TypingLessons onBack={() => {}} />);
    const next = screen.getByRole('button', { name: /Continue: 3\. / });
    expect(document.activeElement).toBe(next);
    fireEvent.click(next);
    expect(screen.getByText(TYPING_LESSONS[2].title)).toBeInTheDocument();
  });

  it('a heading takes the focus where no button does: the keyboard gate, the list once every lesson is cleared, the result (review round 7)', () => {
    render(<TypingLessons onBack={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Typing lessons' }));
    cleanup();
    useKeyboardStore.getState().seen();
    const all: Record<string, boolean> = {};
    for (const l of TYPING_LESSONS) all[typingLessonFlag(l.id)] = true;
    useSaveStore.setState({ save: { ...defaultSave(), flags: all } });
    render(<TypingLessons onBack={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '⌨️ Typing lessons' }));
    const last = TYPING_LESSONS[TYPING_LESSONS.length - 1];
    fireEvent.click(openLessons()[TYPING_LESSONS.length - 1]);
    fireEvent.click(screen.getByText('⌨️ Start typing'));
    for (const l of last.lines) typeLine(l);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Lesson cleared!' }));
    fireEvent.click(screen.getByText('← Back to the lessons'));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '⌨️ Typing lessons' }));
  });
});
