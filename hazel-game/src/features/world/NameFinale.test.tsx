import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('canvas-confetti', () => ({ default: Object.assign(vi.fn(), { reset: vi.fn() }) }));
vi.mock('../../lib/audio', () => ({ playMusic: vi.fn(), sfx: vi.fn() }));
vi.mock('../../lib/questions', () => ({
  fetchQuestions: vi.fn(async (topic: string, _age: number, level: number, count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `${topic}-${i}`,
      topic,
      level,
      text: `${topic} question ${i}?`,
      options: ['right', 'wrong 1', 'wrong 2', 'wrong 3'],
      correctIndex: 0,
    })),
  ),
}));
const sendFlow = vi.fn();
vi.mock('../../machines/gameFlow', () => ({ sendFlow: (e: unknown) => sendFlow(e) }));

const { default: NameFinale } = await import('./NameFinale');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { defaultSave } = await import('../../lib/save');
const { NAME_LEARNED, UMBRA_NAMED } = await import('../../content/questFlags');
const { NAME_CLEAR_XP, NAME_LIVES, NAME_QUESTIONS } = await import('../../content/finale');
const { useFinaleStore } = await import('../../store/finaleStore');

/** Taps a story line once it has been up long enough to read (a quick double-tap is ignored). */
async function tapLine(text: RegExp) {
  await act(() => new Promise((r) => setTimeout(r, 260)));
  fireEvent.click(screen.getByText(text));
}

function start(flags: Record<string, boolean>) {
  useSaveStore.setState({
    userId: null,
    status: 'ready',
    save: { ...defaultSave(), avatarId: 'a1', zoneId: 'deep-root-7', flags },
    flush: vi.fn(async () => {}),
  });
}

/** Answer Umbra's questions — `wrongAt`: the ones answered wrong. */
async function answerAll(wrongAt: number[] = []) {
  await act(() => new Promise((r) => setTimeout(r, 260)));
  fireEvent.click(screen.getByRole('button', { name: /Answer it|Try again/ }));
  for (let i = 0; i < NAME_QUESTIONS; i++) {
    await waitFor(() => expect(screen.getByText(`The shadow's question ${i + 1}/${NAME_QUESTIONS}`)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: wrongAt.includes(i) ? /wrong 1/ : /^right/ }));
    fireEvent.click(screen.getByRole('button', { name: /Stand firm/ }));
    if (screen.queryByText(/Your last candle goes out/)) return;
    if (wrongAt.includes(i)) await tapLine(/A candle flickers out/);
  }
}

describe("Umbra Remembered's finale (#75 item 16e)", () => {
  beforeEach(() => {
    sendFlow.mockClear();
    useFinaleStore.getState().reset();
    useProfileStore.setState({ profile: null, addXp: vi.fn(async () => {}), recordActivity: vi.fn(async () => {}) } as never);
  });

  it('his questions, then "What was my name?" — a wrong name costs nothing, "Aster" sets umbra-named and pays the reward', async () => {
    start({ [NAME_LEARNED]: true });
    render(<NameFinale />);
    await answerAll([1]);
    expect(screen.getByRole('img', { name: `${NAME_LIVES - 1} of ${NAME_LIVES} candle-lights left` })).toBeInTheDocument();
    await tapLine(/Then answer the only question I have left/);
    expect(screen.getByText('"What was my name?"')).toBeInTheDocument();

    // No name is focused (a stray Enter mustn't say one), and after a wrong one focus moves to Umbra's reply.
    expect(screen.getByText('"What was my name?"')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lumen' }));
    expect(screen.getByRole('status')).toHaveTextContent(/That isn't my name/);
    expect(screen.getByRole('status')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Lumen' })).toBeDisabled();
    expect(useSaveStore.getState().save!.flags[UMBRA_NAMED]).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Aster' }));
    expect(useSaveStore.getState().save!.flags[UMBRA_NAMED]).toBe(true);
    // Paid as the name panels end, not now (a level-up mustn't cover the story): 4 right + the reward.
    expect(useProfileStore.getState().addXp).not.toHaveBeenCalled();
    expect(useFinaleStore.getState().pendingXp).toBe(NAME_CLEAR_XP + 4 * 10);
    // The miss went to the Library.
    expect(useSaveStore.getState().save!.library).toHaveLength(1);
    await act(() => new Promise((r) => setTimeout(r, 260)));
    // No grey Leave at the happy moment (16e review round 3) — before it, there is one.
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '🌼 See what happens' }));
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
  });

  it("without the five memories, he sends you back gently — nothing set, nothing lost", async () => {
    start({});
    render(<NameFinale />);
    await answerAll();
    await tapLine(/Then answer the only question I have left/);
    expect(screen.getByText(/you don't know it/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aster' })).toBeNull();
    expect(useSaveStore.getState().save!.flags[UMBRA_NAMED]).toBeUndefined();
  });

  it('the last candle out: the shadow lights them again — nothing lost, no walk back down', async () => {
    start({ [NAME_LEARNED]: true });
    render(<NameFinale />);
    await answerAll([0, 1, 2]);
    expect(screen.getByText(/Your last candle goes out/)).toHaveTextContent(/flicker back/);
    expect(useSaveStore.getState().save!.zoneId).toBe('deep-root-7');
    await answerAll();
    expect(screen.getByRole('img', { name: `${NAME_LIVES} of ${NAME_LIVES} candle-lights left` })).toBeInTheDocument();
  });

  it('left at the name question, the questions are not asked again this session', async () => {
    start({ [NAME_LEARNED]: true });
    const first = render(<NameFinale />);
    await answerAll();
    first.unmount();
    // Leaving pays the right answers at once.
    expect(useProfileStore.getState().addXp).toHaveBeenCalledWith(NAME_QUESTIONS * 10);
    render(<NameFinale />);
    fireEvent.click(screen.getByRole('button', { name: "🌼 I'm ready" }));
    expect(screen.getByText('"What was my name?"')).toBeInTheDocument();
  });
});
