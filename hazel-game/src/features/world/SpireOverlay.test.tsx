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
      text: `${i} + 2?`,
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 0,
    })),
  ),
}));
const sendFlow = vi.fn();
vi.mock('../../machines/gameFlow', () => ({ sendFlow: (e: unknown) => sendFlow(e) }));

const { default: SpireOverlay } = await import('./SpireOverlay');
const { useSaveStore } = await import('../../store/saveStore');
const { defaultSave } = await import('../../lib/save');
const { actCrystals, crystalFlag } = await import('../../content/topics');
const { addFakeActTwoCrystal } = await import('../../test/fakeCrystal');
const { useProfileStore } = await import('../../store/profileStore');
const { useSpireStore } = await import('../../store/spireStore');
const { SPIRE_FLOORS, SPIRE_CLEAR_XP, floorWards } = await import('../../content/spire');
const { SPIRE_CLEARED } = await import('../../content/story');

/** Read through the Spire's opening lines (each panel ignores a tap in its first 250 ms). */
async function readUntil(name: string | RegExp) {
  for (let i = 0; i < 12 && !screen.queryByRole('button', { name }); i++) {
    await act(() => new Promise((r) => setTimeout(r, 260)));
    const next = screen.queryByText('▼ tap to continue');
    if (next) fireEvent.click(next);
  }
  await waitFor(() => expect(screen.getByRole('button', { name })).toBeInTheDocument());
}

describe('leaving the Spire asks first (#75 item 14b review)', () => {
  beforeEach(() => {
    sendFlow.mockClear();
    useSaveStore.setState({
      userId: null,
      status: 'ready',
      save: { ...defaultSave(), avatarId: 'a1', flags: Object.fromEntries(actCrystals(1).map((t) => [crystalFlag(t.id), true])) },
      flush: vi.fn(async () => {}),
    });
  });

  it('in the HUD row, Leave opens "Leave the Spire?" — Keep climbing goes back to the floor, Leave says the climb starts over', async () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    render(<SpireOverlay hudSlot={slot} />);
    await readUntil('🚪 Leave the Spire');
    // Exploring: the climb's status sits in the HUD slot.
    expect(slot.textContent).toContain('Seals 0/');
    expect(screen.getByRole('img', { name: '4 of 4 candle-lights left' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '🚪 Leave the Spire' }));
    expect(screen.getByRole('alertdialog', { name: 'Leave the Spire?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '🗼 Keep climbing' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '🗼 Keep climbing' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: '🚪 Leave the Spire' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '🚪 Leave the Spire' }));
    fireEvent.click(screen.getByRole('button', { name: '🚪 Leave' }));
    expect(screen.getByText(/next time, the climb starts again from the first floor/)).toBeInTheDocument();
    expect(sendFlow).not.toHaveBeenCalled();
    slot.remove();
  });
});

describe('the Spire opens on Act I\'s crystals (#75 item 14c)', () => {
  it('a later act\'s crystal, not yet restored, never seals it again', async () => {
    const remove = addFakeActTwoCrystal();
    try {
      useSaveStore.setState({
        userId: null,
        status: 'ready',
        save: { ...defaultSave(), avatarId: 'a1', flags: Object.fromEntries(actCrystals(1).map((t) => [crystalFlag(t.id), true])) },
        flush: vi.fn(async () => {}),
      });
      const slot = document.createElement('div');
      document.body.appendChild(slot);
      render(<SpireOverlay hudSlot={slot} />);
      expect(screen.queryByText('The Spire is sealed')).toBeNull();
      await readUntil('🚪 Leave the Spire');
      slot.remove();
    } finally {
      remove();
    }
  });

  it('with three of Act I\'s four, it is sealed and counts "3/4"', () => {
    useSaveStore.setState({
      save: { ...defaultSave(), avatarId: 'a1', flags: Object.fromEntries(actCrystals(1).slice(0, 3).map((t) => [crystalFlag(t.id), true])) },
    });
    render(<SpireOverlay hudSlot={null} />);
    expect(screen.getByText('The Spire is sealed')).toBeInTheDocument();
    expect(screen.getByText('3/4')).toBeInTheDocument();
  });
});

describe('beating Umbra pays the 600 XP clear bonus once (#109)', () => {
  const QUESTIONS = SPIRE_FLOORS.reduce((n, f) => n + f.questions, 0);

  /**
   * Climb the real Spire to the end: read every panel, break each floor's
   * seals, take the stairs, and answer Umbra right every time. The panels'
   * 250 ms tap guard reads `performance.now`, which runs a second per call here.
   */
  async function climb(): Promise<void> {
    for (let step = 0; step < 400; step++) {
      if (screen.queryByRole('heading', { name: /The Spire is yours!|You beat Umbra again!/ })) return;
      const next = screen.queryByText('▼ tap to continue');
      const option = screen.queryByRole('button', { name: 'a' });
      const go = screen.queryByRole('button', { name: /Break the seal|Stand firm/ });
      if (go) fireEvent.click(go);
      else if (option && !option.hasAttribute('disabled')) fireEvent.click(option);
      else if (next) fireEvent.click(next);
      else if (useSpireStore.getState().exploring) {
        const { floor, broken } = useSpireStore.getState();
        const f = SPIRE_FLOORS[floor!];
        const ward = floorWards(f.theme).map((w) => w.id).find((id) => !broken.includes(id));
        act(() => useSpireStore.getState().bump(f.isBoss ? { kind: 'umbra' } : ward ? { kind: 'ward', id: ward } : { kind: 'stairs' }));
      }
      await act(() => new Promise((r) => setTimeout(r, 0)));
    }
    const { floor, broken, exploring, pending } = useSpireStore.getState();
    throw new Error(`the climb never reached the top: floor ${floor}, broken ${broken.length}, exploring ${exploring}, pending ${JSON.stringify(pending)} — ${document.body.textContent?.slice(0, 300)}`);
  }

  let clock = 0;
  const addXp = vi.fn(async () => {});
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 1000));
    addXp.mockClear();
    useProfileStore.setState({ profile: null, addXp, recordActivity: vi.fn(async () => {}) });
  });

  const save = (cleared: boolean) => ({
    ...defaultSave(),
    avatarId: 'a1',
    flags: {
      ...Object.fromEntries(actCrystals(1).map((t) => [crystalFlag(t.id), true])),
      ...(cleared ? { [SPIRE_CLEARED]: true } : {}),
    },
  });

  it('the first clear pays it, with "See how it ends"', async () => {
    useSaveStore.setState({ userId: null, status: 'ready', save: save(false), flush: vi.fn(async () => {}) });
    render(<SpireOverlay hudSlot={null} />);
    await climb();
    expect(screen.getByRole('button', { name: '🌟 See how it ends' })).toBeInTheDocument();
    expect(addXp).toHaveBeenCalledTimes(1);
    const paid = (addXp.mock.calls[0] as unknown as [number])[0];
    expect(paid).toBeGreaterThanOrEqual(SPIRE_CLEAR_XP + QUESTIONS);
    // The panel says what the climb earned.
    expect(screen.getByText(`⭐ ${paid} XP`)).toBeInTheDocument();
    expect(useSaveStore.getState().save!.flags[SPIRE_CLEARED]).toBe(true);
  }, 20000);

  it('a re-clear pays the right answers only, and says so — Umbra remembers you', async () => {
    useSaveStore.setState({ userId: null, status: 'ready', save: save(true), flush: vi.fn(async () => {}) });
    render(<SpireOverlay hudSlot={null} />);
    await climb();
    const paid = (addXp.mock.calls[0] as unknown as [number])[0];
    // Praise first, and the XP it earned; the big prize is "already yours" (review fix).
    expect(screen.getByText(`You climbed every floor and beat Umbra again! Your bright answers earned ⭐ ${paid} XP.`)).toBeInTheDocument();
    expect(screen.getByText(/The big hero's prize comes once — and it's already yours!/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '🚪 Back to the Spire door' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '🌟 See how it ends' })).toBeNull();
    expect(paid).toBeLessThan(SPIRE_CLEAR_XP);
    expect(paid).toBeGreaterThan(0);
  }, 20000);
});
