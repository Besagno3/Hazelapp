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
const { addFakeLaterCrystal } = await import('../../test/fakeCrystal');
const { useProfileStore } = await import('../../store/profileStore');
const { useSpireStore } = await import('../../store/spireStore');
const { SPIRE_FLOORS, SPIRE_CLEAR_XP, SPIRE_LIVES, floorWards, spireFalls } = await import('../../content/spire');
const { SPIRE_CLEARED } = await import('../../content/story');
const { fetchQuestions } = await import('../../lib/questions');

/** Read through the Spire's opening lines (each panel ignores a tap in its first 250 ms). */
async function readUntil(name: string | RegExp) {
  for (let i = 0; i < 12 && !screen.queryByRole('button', { name }); i++) {
    await act(() => new Promise((r) => setTimeout(r, 260)));
    const next = screen.queryByText('▼ tap to continue');
    if (next) fireEvent.click(next);
  }
  await waitFor(() => expect(screen.getByRole('button', { name })).toBeInTheDocument());
}

/**
 * Climb the real Spire until `until` heads the panel: read every panel, break
 * each floor's seals, take the stairs, and answer `answer` every time ('a' is
 * right, 'b' wrong). The panels' 250 ms tap guard reads `performance.now`, so
 * callers mock it to run a second per call.
 */
async function climb({ answer = 'a', until = /The Spire is yours!|You beat Umbra again!/ }: { answer?: 'a' | 'b'; until?: RegExp } = {}): Promise<void> {
  for (let step = 0; step < 400; step++) {
    if (screen.queryByRole('heading', { name: until })) return;
    const next = screen.queryByText('▼ tap to continue');
    const option = screen.queryByRole('button', { name: answer });
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
  throw new Error(`the climb never reached ${until}: floor ${floor}, broken ${broken.length}, exploring ${exploring}, pending ${JSON.stringify(pending)} — ${document.body.textContent?.slice(0, 300)}`);
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
    const remove = addFakeLaterCrystal();
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

describe('the Spire is fairer: gentler levels, an easier climb after each fall (B4, #150)', () => {
  // With no profile the kid is 10, so every topic starts at question level 5.
  const OWN_LEVEL = 5;
  const crystals = Object.fromEntries(actCrystals(1).map((t) => [crystalFlag(t.id), true]));
  const start = (flags: Record<string, boolean>) =>
    useSaveStore.setState({ userId: null, status: 'ready', save: { ...defaultSave(), avatarId: 'a1', flags: { ...crystals, ...flags } }, flush: vi.fn(async () => {}) });
  /** The level the first floor's questions were asked at. */
  const firstLevel = () => (vi.mocked(fetchQuestions).mock.calls[0] as unknown as [string, number, number])[2];
  const flags = () => useSaveStore.getState().save!.flags;

  let clock = 0;
  let slot: HTMLElement;
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 1000));
    vi.mocked(fetchQuestions).mockClear();
    useProfileStore.setState({ profile: null, addXp: vi.fn(async () => {}), recordActivity: vi.fn(async () => {}) });
    slot = document.createElement('div');
    document.body.appendChild(slot);
    return () => slot.remove();
  });

  it('a first climb asks the first floor at the kid\'s own level, with the usual candles and no "remembers" line', async () => {
    start({});
    render(<SpireOverlay hudSlot={slot} />);
    const seen: string[] = [];
    for (let i = 0; i < 6 && !screen.queryByRole('button', { name: '🚪 Leave the Spire' }); i++) {
      seen.push(document.body.textContent ?? '');
      const next = screen.queryByText('▼ tap to continue');
      if (next) fireEvent.click(next);
      await act(() => new Promise((r) => setTimeout(r, 0)));
    }
    await waitFor(() => expect(screen.getByRole('button', { name: '🚪 Leave the Spire' })).toBeInTheDocument());
    expect(seen.join(' ')).not.toMatch(/The Spire remembers you tried/);
    expect(firstLevel()).toBe(OWN_LEVEL); // was OWN_LEVEL + 2
    expect(screen.getByRole('img', { name: `${SPIRE_LIVES} of ${SPIRE_LIVES} candle-lights left` })).toBeInTheDocument();
  });

  it('back after a fall: one line says so, one more candle, a level lower', async () => {
    start({ 'spire-falls-1': true });
    render(<SpireOverlay hudSlot={slot} />);
    await readUntil(/The Spire remembers you tried\. One more candle — and the riddles are a little easier\./);
    await readUntil('🚪 Leave the Spire');
    expect(firstLevel()).toBe(OWN_LEVEL - 1);
    expect(screen.getByRole('img', { name: `${SPIRE_LIVES + 1} of ${SPIRE_LIVES + 1} candle-lights left` })).toBeInTheDocument();
    expect(useSpireStore.getState().lives).toBe(SPIRE_LIVES + 1);
  });

  it('losing a climb is remembered for the next one', async () => {
    start({});
    render(<SpireOverlay hudSlot={null} />);
    await climb({ answer: 'b', until: /Down, but never out/ });
    expect(spireFalls(flags())).toBe(1);
    expect(flags()['spire-falls-1']).toBe(true);
  }, 20000);

  it('the Spire remembers two falls at most', async () => {
    start({ 'spire-falls-1': true, 'spire-falls-2': true });
    const before = { ...flags() };
    render(<SpireOverlay hudSlot={null} />);
    await readUntil(/Two more candles — and the riddles are easier still/);
    await climb({ answer: 'b', until: /Down, but never out/ });
    expect(spireFalls(flags())).toBe(2);
    // A third fall writes nothing at all — no stray flag (B4 review round 1).
    expect(flags()).toEqual(before);
    expect(firstLevel()).toBe(OWN_LEVEL - 2);
  }, 20000);

  it('leaving on purpose, a candle down, is not a fall (B4 review round 1)', async () => {
    sendFlow.mockClear();
    start({});
    const before = { ...flags() };
    render(<SpireOverlay hudSlot={slot} />);
    await readUntil('🚪 Leave the Spire');
    // Lose a candle on the first seal…
    const ward = floorWards(SPIRE_FLOORS[0].theme)[0].id;
    act(() => useSpireStore.getState().bump({ kind: 'ward', id: ward }));
    fireEvent.click(await screen.findByRole('button', { name: 'b' }));
    fireEvent.click(screen.getByRole('button', { name: '🔮 Break the seal' }));
    await readUntil('🚪 Leave the Spire');
    expect(useSpireStore.getState().lives).toBe(SPIRE_LIVES - 1);
    // …then leave, and read the way-out line through to the door.
    fireEvent.click(screen.getByRole('button', { name: '🚪 Leave the Spire' }));
    fireEvent.click(screen.getByRole('button', { name: '🚪 Leave' }));
    fireEvent.click(screen.getByText('▼ tap to continue'));
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
    expect(spireFalls(flags())).toBe(0);
    expect(flags()).toEqual(before);
  });

  it('a kid at level 10 gets every floor a level lower after a fall, Umbra\'s too (B4 review round 2)', async () => {
    const { ALL_TOPICS } = await import('../../content/topics');
    useProfileStore.setState({
      profile: {
        id: 'kid',
        birthYear: 2014,
        birthMonth: 1,
        skillLevels: Object.fromEntries(ALL_TOPICS.map((t) => [t, 10])),
        xp: 0,
        powerUps: {},
        currentStreak: 0,
        longestStreak: 0,
        lastPlayedOn: null,
      },
    });
    start({ 'spire-falls-1': true });
    render(<SpireOverlay hudSlot={null} />);
    await climb();
    const asked = vi.mocked(fetchQuestions).mock.calls.map((c) => (c as unknown as [string, number, number])[2]);
    // Every floor and all seven of Umbra's topics: 10 on a first climb, 9 now (it was 10 again past floor 1).
    expect(asked.length).toBe(SPIRE_FLOORS.reduce((n, f) => n + f.topics.length, 0));
    expect(new Set(asked)).toEqual(new Set([9]));
  }, 20000);

  it('clearing the Spire forgets the falls; Act IV\'s spire-cleared is set as ever', async () => {
    start({ 'spire-falls-1': true, 'spire-falls-2': true });
    render(<SpireOverlay hudSlot={null} />);
    await climb();
    expect(spireFalls(flags())).toBe(0);
    expect(flags()[SPIRE_CLEARED]).toBe(true);
    expect(Object.keys(flags())).not.toContain('spire-falls-1');
  }, 20000);
});
