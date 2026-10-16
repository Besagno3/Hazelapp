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
  fireEvent.click(screen.getByRole('button', { name: '🕯️ Answer his questions' }));
  for (let i = 0; i < NAME_QUESTIONS; i++) {
    await waitFor(() => expect(screen.getByText(`Umbra's question ${i + 1}/${NAME_QUESTIONS}`)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: wrongAt.includes(i) ? /wrong 1/ : /^right/ }));
    fireEvent.click(screen.getByRole('button', { name: /Stand firm/ }));
    if (screen.queryByText(/Your last candle goes out/)) return;
    if (wrongAt.includes(i)) await tapLine(/A candle snuffs out/);
  }
}

describe("Umbra Remembered's finale (#75 item 16e)", () => {
  beforeEach(() => {
    sendFlow.mockClear();
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
    fireEvent.click(screen.getByRole('button', { name: 'Lumen' }));
    expect(screen.getByRole('status')).toHaveTextContent(/That isn't my name/);
    expect(screen.getByRole('status')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Lumen' })).toBeDisabled();
    expect(useSaveStore.getState().save!.flags[UMBRA_NAMED]).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Aster' }));
    expect(useSaveStore.getState().save!.flags[UMBRA_NAMED]).toBe(true);
    expect(useProfileStore.getState().addXp).toHaveBeenCalledWith(NAME_CLEAR_XP);
    // The miss went to the Library.
    expect(useSaveStore.getState().save!.library).toHaveLength(1);
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

  it("the last candle out wakes you healed in Glim's Nook on B4", async () => {
    start({ [NAME_LEARNED]: true });
    render(<NameFinale />);
    await answerAll([0, 1, 2]);
    expect(screen.getByText(/Your last candle goes out/)).toHaveTextContent(/Glim's Nook/);
    // Already there — leaving any way can't skip it.
    const save = useSaveStore.getState().save!;
    expect(save.zoneId).toBe('deep-root-4');
    expect(save.hp).toBeNull();
    expect(save.flags[UMBRA_NAMED]).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: '🐛 To the nook' }));
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
  });
});
