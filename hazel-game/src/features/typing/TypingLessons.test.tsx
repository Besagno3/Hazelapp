import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('canvas-confetti', () => ({ default: () => {} }));

const { default: TypingLessons } = await import('./TypingLessons');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { useKeyboardStore } = await import('../../store/keyboardStore');
const { defaultSave } = await import('../../lib/save');
const { TYPING_BADGE_ID, TYPING_LESSONS, TYPING_LESSON_XP, anchorsFor, charKey, typingLessonFlag } = await import('../../content/typing');

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

function typeLine(line: string, hold = true) {
  for (const ch of line) pressChar(ch, hold);
}

const flags = () => useSaveStore.getState().save!.flags;
const openLessons = () => screen.getAllByRole('button').filter((b) => /\d+\. /.test(b.textContent ?? ''));

describe('TypingLessons (#159)', () => {
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
    expect(buttons[0]).toBeEnabled();
    expect(buttons.slice(1).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('lesson 1: the hold nudges without the other hand, counts with it; cleared, it sets its flag, pays XP once and opens lesson 2', () => {
    useKeyboardStore.getState().seen();
    render(<TypingLessons onBack={() => {}} />);
    fireEvent.click(openLessons()[0]);
    expect(screen.getByText(/F and J, the bumpy keys/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('⌨️ Start typing'));
    expect(screen.getByText(`Line 1 of ${TYPING_LESSONS[0].lines.length}`)).toBeInTheDocument();

    // "f" without J held: a nudge, and the line hasn't moved.
    fireEvent.keyDown(window, { code: 'KeyF', key: 'f' });
    fireEvent.keyUp(window, { code: 'KeyF', key: 'f' });
    expect(screen.getByRole('status')).toHaveTextContent(/Other hand home! Hold J/);
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
    fireEvent.click(screen.getByText('📚 Back to the lessons'));
    expect(screen.getByText(`1 of ${TYPING_LESSONS.length} lessons cleared`)).toBeInTheDocument();
    const buttons = openLessons();
    expect(buttons[1]).toBeEnabled();
    expect(buttons[2]).toBeDisabled();

    // Played again, it pays nothing more.
    addXp.mockClear();
    fireEvent.click(buttons[0]);
    fireEvent.click(screen.getByText('⌨️ Start typing'));
    for (const line of TYPING_LESSONS[0].lines) typeLine(line);
    expect(screen.getByText('Lesson cleared!')).toBeInTheDocument();
    expect(addXp).not.toHaveBeenCalled();
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
    expect(screen.getByRole('status')).toHaveTextContent(/Not that one/);
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
    expect(buttons[buttons.length - 1]).toBeEnabled();
    fireEvent.click(buttons[buttons.length - 1]);
    fireEvent.click(screen.getByText('⌨️ Start typing'));
    for (const line of last.lines) typeLine(line);
    expect(screen.getByText(/Scribe's Quill badge/)).toBeInTheDocument();
    expect(useSaveStore.getState().save!.badges).toEqual([TYPING_BADGE_ID]);
    // No "Next lesson" after the last one.
    expect(screen.queryByText('➡️ Next lesson')).toBeNull();
    // Again: still one badge.
    fireEvent.click(screen.getByText('📚 Back to the lessons'));
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
