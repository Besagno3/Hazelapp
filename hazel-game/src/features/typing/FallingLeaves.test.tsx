import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('canvas-confetti', () => ({ default: () => {} }));

const { default: FallingLeaves } = await import('./FallingLeaves');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { useKeyboardStore } = await import('../../store/keyboardStore');
const { defaultSave } = await import('../../lib/save');
const { TYPING_LESSONS, charKey, typingLessonFlag } = await import('../../content/typing');
const { LEAVES_TUNING, LEAVES_XP, leafPace, leavesFlag } = await import('../../lib/leaves');

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
    save: { ...defaultSave(), typingAnchor: false, flags: { [typingLessonFlag(TYPING_LESSONS[0].id)]: true } },
  });
});
afterEach(() => vi.useRealTimers());

const leaves = () => screen.queryAllByTestId('leaf');
/** Time passes — one tick more than asked, so a wait of exactly a spawn's or a fall's length lands on its tick. */
const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms + LEAVES_TUNING.tickMs);
  });
/** Press the lowest leaf's letter. */
function catchLowest() {
  const ch = leaves()[0].textContent!;
  const code = charKey(ch)!.key.code;
  fireEvent.keyDown(window, { code, key: ch });
  fireEvent.keyUp(window, { code, key: ch });
}

describe('🍂 Falling Leaves (#159 item 7)', () => {
  it('needs a keyboard, then lesson 1; the intro names the leaves that can fall', () => {
    useKeyboardStore.getState().reset();
    render(<FallingLeaves onBack={() => {}} />);
    expect(screen.getByText('Press any key on your keyboard to begin.')).toBeInTheDocument();
    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' });
    expect(screen.getByText('🍂 Play')).toBeInTheDocument();
    expect(screen.getByText(/Your letters so far/)).toHaveTextContent('f j');
    act(() => {
      useSaveStore.setState({ save: { ...useSaveStore.getState().save!, flags: {} } });
    });
    expect(screen.getByText(/Clear typing lesson 1/)).toBeInTheDocument();
  });

  it('leaves fall from the taught keys; the right key catches the lowest, a wrong key nudges; three on the ground end the round', () => {
    vi.useFakeTimers();
    render(<FallingLeaves onBack={() => {}} />);
    fireEvent.click(screen.getByText('🍂 Play'));
    expect(leaves()).toHaveLength(0);
    tick(LEAVES_TUNING.spawnMs);
    expect(leaves()).toHaveLength(1);
    expect(['f', 'j']).toContain(leaves()[0].textContent);
    // The leaf that counts wears the ring (review round 1).
    expect(leaves()[0]).toHaveAttribute('data-lowest', 'true');
    // A key with no leaf: a nudge, nothing caught.
    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' });
    expect(screen.getByRole('status')).toHaveTextContent(/No leaf says "a"/);
    catchLowest();
    expect(leaves()).toHaveLength(0);
    expect(screen.getByTestId('leaf-tally')).toHaveTextContent('Caught 1');
    // Left alone, leaves keep coming and landing: the third on the ground ends
    // the round, long before the clock would.
    tick(leafPace(1).spawnMs);
    expect(leaves().length).toBeGreaterThan(0);
    tick(leafPace(1).fallMs);
    expect(screen.getByTestId('leaf-tally')).toHaveTextContent(`Missed 1/${LEAVES_TUNING.maxMissed}`);
    tick(LEAVES_TUNING.roundMs / 2);
    expect(screen.getByText('The leaves have settled!')).toBeInTheDocument();
    expect(screen.getByText(/You caught/)).toHaveTextContent('1 leaf');
    expect(addXp).not.toHaveBeenCalled();
    expect(screen.getByText('🍂 Play again')).toBeInTheDocument();
  });

  it('ten in one round pays its XP once and sets its flag; the next round pays nothing for ten again', () => {
    vi.useFakeTimers();
    render(<FallingLeaves onBack={() => {}} />);
    fireEvent.click(screen.getByText('🍂 Play'));
    for (let i = 0; i < 10; i++) {
      tick(leafPace(i).spawnMs);
      catchLowest();
    }
    expect(screen.getByTestId('leaf-tally')).toHaveTextContent('Caught 10');
    fireEvent.click(screen.getByText('⏹ Stop the round'));
    expect(screen.getByText(/10 in one round/)).toBeInTheDocument();
    expect(addXp).toHaveBeenCalledTimes(1);
    expect(addXp).toHaveBeenCalledWith(LEAVES_XP);
    expect(useSaveStore.getState().save!.flags[leavesFlag(10)]).toBe(true);
    expect(screen.getByText(/Next: 25/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('🍂 Play again'));
    for (let i = 0; i < 10; i++) {
      tick(leafPace(i).spawnMs);
      catchLowest();
    }
    fireEvent.click(screen.getByText('⏹ Stop the round'));
    expect(screen.queryByText(/10 in one round/)).toBeNull();
    expect(addXp).toHaveBeenCalledTimes(1);
  });

  it('two milestones in one round pay with one XP write; a capital nudges about Shift or Caps Lock (review round 2)', () => {
    vi.useFakeTimers();
    render(<FallingLeaves onBack={() => {}} />);
    fireEvent.click(screen.getByText('🍂 Play'));
    for (let i = 0; i < 25; i++) {
      tick(leafPace(i).spawnMs);
      if (i === 3) {
        const ch = leaves()[0].textContent!;
        const code = charKey(ch)!.key.code;
        fireEvent.keyDown(window, { code, key: ch.toUpperCase() });
        fireEvent.keyUp(window, { code, key: ch.toUpperCase() });
        expect(screen.getByRole('status')).toHaveTextContent(/let go of Shift/);
        fireEvent.keyDown(window, { code, key: ch.toUpperCase(), modifierCapsLock: true });
        fireEvent.keyUp(window, { code, key: ch.toUpperCase() });
        expect(screen.getByRole('status')).toHaveTextContent(/Caps Lock is on/);
        expect(screen.getByTestId('leaf-tally')).toHaveTextContent('Caught 3');
      }
      catchLowest();
    }
    expect(screen.getByTestId('leaf-tally')).toHaveTextContent('Caught 25');
    // A screen reader hears the count with the lowest leaf (review round 3).
    expect(screen.getByRole('status')).toHaveTextContent(/Caught 25, missed 0\./);
    fireEvent.click(screen.getByText('⏹ Stop the round'));
    expect(screen.getByText(/25 in one round/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Stopped early\./);
    expect(addXp).toHaveBeenCalledTimes(1);
    expect(addXp).toHaveBeenCalledWith(LEAVES_XP * 2);
    expect(useSaveStore.getState().save!.flags[leavesFlag(10)]).toBe(true);
    expect(useSaveStore.getState().save!.flags[leavesFlag(25)]).toBe(true);
  });

  it('with the hold on, a leaf wants the other hand on its bump key', () => {
    vi.useFakeTimers();
    useSaveStore.setState({ save: { ...useSaveStore.getState().save!, typingAnchor: true } });
    render(<FallingLeaves onBack={() => {}} />);
    fireEvent.click(screen.getByText('🍂 Play'));
    tick(LEAVES_TUNING.spawnMs);
    const ch = leaves()[0].textContent!;
    const code = charKey(ch)!.key.code;
    fireEvent.keyDown(window, { code, key: ch });
    expect(screen.getByRole('status')).toHaveTextContent(/Other hand home/);
    expect(leaves()).toHaveLength(1);
    const anchor = ch === 'f' ? 'KeyJ' : 'KeyF';
    fireEvent.keyDown(window, { code: anchor, key: ch === 'f' ? 'j' : 'f' });
    fireEvent.keyDown(window, { code, key: ch });
    expect(leaves()).toHaveLength(0);
  });
});
