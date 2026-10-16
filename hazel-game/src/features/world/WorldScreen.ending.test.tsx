import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { create } from 'zustand';

// The canvas is KaPlay — stand in a div that says which map it's drawing.
vi.mock('./WorldCanvas', () => ({
  default: (p: { zoneId: string; spireFloor: string | null }) => (
    <div data-testid="canvas" data-zone={p.zoneId} data-floor={p.spireFloor ?? ''} />
  ),
}));
vi.mock('canvas-confetti', () => ({ default: Object.assign(vi.fn(), { reset: vi.fn() }) }));
vi.mock('../../lib/questions', () => ({
  prefetchQuestions: vi.fn(),
  fetchQuestions: vi.fn(() => new Promise(() => {})),
  BATTLE_QUESTION_COUNT: 3,
}));
// The game-flow machine, reduced to which overlay is open.
const flow = create<{ overlay: string | null }>(() => ({ overlay: null }));
vi.mock('../../machines/gameFlow', () => ({
  sendFlow: (e: { type: string }) => {
    if (e.type === 'CLOSE') flow.setState({ overlay: null });
    if (e.type === 'OPEN_MENU') flow.setState({ overlay: 'menu' });
  },
  useFlow: <T,>(sel: (s: unknown) => T) => {
    const overlay = flow((s) => s.overlay);
    return sel({
      matches: (v: { world: string }) => overlay !== null && v.world === overlay,
      context: { npcId: null, service: null, pathTarget: null },
    });
  },
}));
// The Spire's own last panel: "The Spire is yours! … 🌟 See how it ends".
vi.mock('./SpireOverlay', async () => {
  const { sendFlow } = await import('../../machines/gameFlow');
  const { useSpireStore } = await import('../../store/spireStore');
  return {
    default: () => (
      <button
        onClick={() => {
          useSpireStore.getState().reset();
          sendFlow({ type: 'CLOSE' });
        }}
      >
        🌟 See how it ends
      </button>
    ),
  };
});

const { default: WorldScreen } = await import('./WorldScreen');
const { useSaveStore } = await import('../../store/saveStore');
const { useSpireStore } = await import('../../store/spireStore');
const { defaultSave, restAtHomeInn } = await import('../../lib/save');
const { HUB_ZONE } = await import('../../content/zones');
const { SPIRE_FLOORS } = await import('../../content/spire');
const { WAKE_MS } = await import('../../components/WakeFade');
const story = await import('../../content/story');
const { actCrystals, crystalFlag } = await import('../../content/topics');
const spellsMod = await import('../../content/spells');

/** Every story beat of Act I seen, and Umbra just beaten. */
function umbraBeaten(): Record<string, boolean> {
  const flags: Record<string, boolean> = {
    [story.INTRO_SEEN]: true,
    [story.EMBER_HATCHED]: true,
    [story.EMBER_HATCH_SEEN]: true,
    [story.SPIRE_AWAKE_SEEN]: true,
    [story.ENDING_SEEN]: true,
    [story.DAWNREACH_SEEN]: true,
    [story.SPIRE_CLEARED]: true,
  };
  for (const t of actCrystals(1)) {
    flags[crystalFlag(t.id)] = true;
    flags[story.crystalSceneFlag(t.id)] = true;
  }
  return flags;
}

/** Reads on through a story, waiting for each panel to fade in first. */
function readOn(times: number) {
  for (let i = 0; i < times; i++) {
    act(() => vi.advanceTimersByTime(1500));
    fireEvent.click(screen.getByRole('button', { name: '▼ Next' }));
  }
  act(() => vi.advanceTimersByTime(1500));
}

const menu = () => screen.getByRole('button', { name: '📜 Menu', hidden: true });
const canvas = () => screen.getByTestId('canvas').dataset;

describe('after Umbra: the walk home, a night at the inn, Act II in the morning (#75 item 14)', () => {
  const flush = vi.fn(async () => {});
  beforeEach(() => {
    vi.useFakeTimers();
    flush.mockClear();
    useSaveStore.setState({
      userId: null,
      status: 'ready',
      save: { ...defaultSave(), avatarId: 'a3', zoneId: 'crystal-spire', flags: umbraBeaten() },
      flush,
    });
  });
  afterEach(() => vi.useRealTimers());

  it('waits for "See how it ends", walks home from the Spire\'s door, and wakes inside the inn', () => {
    // Umbra has just fallen: the Spire's own panel is up on the throne floor.
    flow.setState({ overlay: 'spire' });
    render(<WorldScreen />);
    act(() => useSpireStore.getState().enterFloor(SPIRE_FLOORS.length - 1));
    expect(canvas().floor).toBe(SPIRE_FLOORS[SPIRE_FLOORS.length - 1].theme);
    expect(screen.queryByRole('dialog', { name: 'Story' })).toBeNull();

    // The finale plays once the climb closes — at the Spire's door, not the throne.
    fireEvent.click(screen.getByRole('button', { name: '🌟 See how it ends' }));
    expect(screen.getByRole('dialog', { name: 'Story' })).toBeInTheDocument();
    expect([canvas().zone, canvas().floor]).toEqual(['crystal-spire', '']);
    // The HUD behind the story can't be reached.
    expect(menu().closest('[inert]')).not.toBeNull();

    // Three finale panels, three pictures, then bed.
    readOn(5);
    fireEvent.click(screen.getByRole('button', { name: '💤 Good night' }));
    const s = useSaveStore.getState().save!;
    expect([s.zoneId, s.pos, s.lastRest, s.flags[story.SPIRE_VICTORY_SEEN]]).toEqual([
      HUB_ZONE,
      restAtHomeInn().pos,
      HUB_ZONE,
      true,
    ]);
    expect(flush).toHaveBeenCalled(); // saved at once
    expect([canvas().zone, canvas().floor]).toEqual([HUB_ZONE, '']);

    // The dark, then the morning: no taps or Tab through to the HUD meanwhile.
    expect(screen.getByTestId('wake-fade')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Story' })).toBeNull();
    expect(menu().closest('[inert]')).not.toBeNull();
    act(() => vi.advanceTimersByTime(WAKE_MS - 100));
    expect(screen.queryByText(/You wake to sunshine/)).toBeNull();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByTestId('wake-fade')).toBeNull();
    expect(screen.getByText(/You wake to sunshine at the Sleepy Sheep Inn/)).toBeInTheDocument();

    // Act II, then the world is the kid's again.
    readOn(story.ACT2_PANELS.length - 1);
    fireEvent.click(screen.getByRole('button', { name: '⛵ Find Old Marlow' }));
    expect(useSaveStore.getState().save!.flags[story.ACT2_SEEN]).toBe(true);
    expect(screen.queryByRole('dialog', { name: 'Story' })).toBeNull();
    expect(document.querySelector('[inert]')).toBeNull();
    expect(flow.getState().overlay).toBeNull();
  });
});

describe('the Memoria Key (#75 item 14f)', () => {
  const inEldergrove = (extra: Record<string, boolean>) => {
    const flags = { ...umbraBeaten(), [story.SPIRE_VICTORY_SEEN]: true, [story.ACT2_SEEN]: true, ...extra };
    useSaveStore.setState({
      userId: null,
      status: 'ready',
      save: { ...defaultSave(), avatarId: 'a3', zoneId: 'eldergrove', flags },
      flush: vi.fn(async () => {}),
    });
  };
  beforeEach(() => {
    vi.useFakeTimers();
    flow.setState({ overlay: null });
  });
  afterEach(() => vi.useRealTimers());

  it('plays its two panels once the Ringkeeper gives it up — and only once', () => {
    inEldergrove({ 'key-memoria': true });
    const { unmount } = render(<WorldScreen />);
    expect(screen.getByText(/The Memoria Key is cold and silver/)).toBeInTheDocument();
    readOn(story.MEMORIA_PANELS.length - 1);
    fireEvent.click(screen.getByRole('button', { name: '🗝️ Keep it safe' }));
    expect(useSaveStore.getState().save!.flags[story.MEMORIA_SEEN]).toBe(true);
    expect(screen.queryByRole('dialog', { name: 'Story' })).toBeNull();
    unmount();
    render(<WorldScreen />);
    expect(screen.queryByRole('dialog', { name: 'Story' })).toBeNull();
  });

  it('says nothing before the key is won', () => {
    inEldergrove({});
    render(<WorldScreen />);
    expect(screen.queryByText(/The Memoria Key is cold and silver/)).toBeNull();
  });
});

describe('the Hall of Names and Wisp (#75 item 14i)', () => {
  const { HALL_DEDICATED, spellsKnown } = spellsMod;
  const at = (zoneId: 'remembrance-hill' | 'lumina-village' | 'whispering-woods', extra: Record<string, boolean>) => {
    const flags = {
      ...umbraBeaten(),
      [story.SPIRE_VICTORY_SEEN]: true,
      [story.ACT2_SEEN]: true,
      [crystalFlag('history')]: true,
      [story.crystalSceneFlag('history')]: true,
      ...extra,
    };
    useSaveStore.setState({
      userId: null,
      status: 'ready',
      save: { ...defaultSave(), avatarId: 'a3', zoneId, flags },
      flush: vi.fn(async () => {}),
    });
  };
  beforeEach(() => {
    vi.useFakeTimers();
    flow.setState({ overlay: null });
  });
  afterEach(() => vi.useRealTimers());

  it("plays the dedication once Mnem has called you in, and teaches Remembrance", () => {
    at('remembrance-hill', { [story.WISP_STIRRING]: true });
    const { unmount } = render(<WorldScreen />);
    expect(screen.queryByText(/Letters glow on it all by themselves/)).toBeNull();
    unmount();
    at('remembrance-hill', { [story.WISP_STIRRING]: true, [story.HALL_CALLED]: true });
    render(<WorldScreen />);
    expect(screen.getByText(/Letters glow on it all by themselves/)).toBeInTheDocument();
    readOn(story.HALL_PANELS.length - 1);
    fireEvent.click(screen.getByRole('button', { name: '🏛️ Thank you, Mnem' }));
    const save = useSaveStore.getState().save!;
    expect(save.flags[HALL_DEDICATED]).toBe(true);
    expect(spellsKnown(save).map((s) => s.name)).toContain('Remembrance');
  });

  it('waits for his talk to close', () => {
    at('remembrance-hill', { [story.WISP_STIRRING]: true, [story.HALL_CALLED]: true });
    flow.setState({ overlay: 'dialogue' });
    render(<WorldScreen />);
    expect(screen.queryByText(/Letters glow on it all by themselves/)).toBeNull();
  });

  it('the Woods before Memory plays no Wisp beat (#129l)', () => {
    at('whispering-woods', { [crystalFlag('history')]: false });
    render(<WorldScreen />);
    expect(screen.queryByText(/Something is remembering ME/)).toBeNull();
  });

  it('Wisp stirs in the Whispering Woods after Memory — nowhere else, even fighting beside you (#129l)', () => {
    at('lumina-village', { [HALL_DEDICATED]: true });
    const { unmount } = render(<WorldScreen />);
    expect(screen.queryByText(/Something is remembering ME/)).toBeNull();
    unmount();
    // In the party but not fighting beside you: still not here.
    at('lumina-village', { [HALL_DEDICATED]: true, 'quest:grove-moonwell:done': true });
    const benched = render(<WorldScreen />);
    expect(screen.queryByText(/Something is remembering ME/)).toBeNull();
    benched.unmount();
    at('lumina-village', { [HALL_DEDICATED]: true, 'quest:grove-moonwell:done': true });
    useSaveStore.setState((st) => ({ save: { ...st.save!, companionId: 'wisp' } }));
    const second = render(<WorldScreen />);
    expect(screen.queryByText(/Something is remembering ME/)).toBeNull();
    second.unmount();
    at('whispering-woods', { [HALL_DEDICATED]: true });
    render(<WorldScreen />);
    readOn(story.WISP_PANELS.length - 1);
    fireEvent.click(screen.getByRole('button', { name: "🧚 I'll remember for you" }));
    expect(useSaveStore.getState().save!.flags[story.WISP_STIRRING]).toBe(true);
  });
});

describe('the Blank Chart (#75 item 15h)', () => {
  const onTheRest = (extra: Record<string, boolean>) => {
    const flags: Record<string, boolean> = { ...umbraBeaten(), [story.SPIRE_VICTORY_SEEN]: true, [story.ACT2_SEEN]: true, [story.MEMORIA_SEEN]: true, [spellsMod.HALL_DEDICATED]: true };
    for (const id of ['history', 'words'] as const) {
      flags[crystalFlag(id)] = true;
      flags[story.crystalSceneFlag(id)] = true;
    }
    useSaveStore.setState({
      userId: null,
      status: 'ready',
      save: { ...defaultSave(), avatarId: 'a3', zoneId: 'chartmakers-rest', flags: { ...flags, ...extra } },
      flush: vi.fn(async () => {}),
    });
  };
  beforeEach(() => {
    vi.useFakeTimers();
    flow.setState({ overlay: null });
  });
  afterEach(() => vi.useRealTimers());

  it('plays the Chartmaker\'s four panels once the chart is handed over — and only once', () => {
    onTheRest({ 'blank-chart-held': true });
    const { unmount } = render(<WorldScreen />);
    expect(story.CHART_PANELS).toHaveLength(4);
    expect(screen.getByText(/The Blank Chart is all of Lumina/)).toBeInTheDocument();
    readOn(story.CHART_PANELS.length - 1);
    fireEvent.click(screen.getByRole('button', { name: '🗺️ Keep it safe' }));
    expect(useSaveStore.getState().save!.flags[story.CHART_SEEN]).toBe(true);
    expect(screen.queryByRole('dialog', { name: 'Story' })).toBeNull();
    unmount();
    render(<WorldScreen />);
    expect(screen.queryByRole('dialog', { name: 'Story' })).toBeNull();
  });

  it('says nothing before the chart is held', () => {
    onTheRest({});
    render(<WorldScreen />);
    expect(screen.queryByText(/The Blank Chart is all of Lumina/)).toBeNull();
  });
});

describe('Act IV opens (#75 item 16a)', () => {
  const at = (zoneId: 'crystal-spire' | 'whispering-woods' | 'chartmakers-rest', extra: Record<string, boolean>) => {
    const flags: Record<string, boolean> = { ...umbraBeaten(), [story.SPIRE_VICTORY_SEEN]: true, [story.ACT2_SEEN]: true, [story.MEMORIA_SEEN]: true, [spellsMod.HALL_DEDICATED]: true, [story.WISP_STIRRING]: true };
    for (const id of ['history', 'words'] as const) {
      flags[crystalFlag(id)] = true;
      flags[story.crystalSceneFlag(id)] = true;
    }
    useSaveStore.setState({
      userId: null,
      status: 'ready',
      save: { ...defaultSave(), avatarId: 'a3', zoneId, flags: { ...flags, 'blank-chart-held': true, [story.CHART_SEEN]: true, ...extra } },
      flush: vi.fn(async () => {}),
    });
  };
  beforeEach(() => {
    vi.useFakeTimers();
    flow.setState({ overlay: null });
  });
  afterEach(() => vi.useRealTimers());

  it("plays Act IV's five panels on the Spire's grounds with the Blank Chart — once", () => {
    at('crystal-spire', {});
    const { unmount } = render(<WorldScreen />);
    expect(story.ACT4_PANELS).toHaveLength(5);
    expect(screen.getByText(/the Blank Chart grows warm in your hands/)).toBeInTheDocument();
    readOn(story.ACT4_PANELS.length - 1);
    fireEvent.click(screen.getByRole('button', { name: '🌳 Look below' }));
    expect(useSaveStore.getState().save!.flags[story.ACT4_SEEN]).toBe(true);
    unmount();
    render(<WorldScreen />);
    expect(screen.queryByRole('dialog', { name: 'Story' })).toBeNull();
  });

  it("waits for the Chartmaker's own panels, and for the Spire's grounds", () => {
    at('crystal-spire', { [story.CHART_SEEN]: false });
    const { unmount } = render(<WorldScreen />);
    expect(screen.getByText(/The Blank Chart is all of Lumina/)).toBeInTheDocument();
    unmount();
    at('chartmakers-rest', {});
    render(<WorldScreen />);
    expect(screen.queryByText(/the Blank Chart grows warm/)).toBeNull();
    // …and anywhere else, with the chart's panels long seen (round 3).
    cleanup();
    at('whispering-woods', {});
    render(<WorldScreen />);
    expect(screen.queryByText(/the Blank Chart grows warm/)).toBeNull();
  });

  it("never over the Spire's own climb (its floors borrow the grounds' id)", () => {
    at('crystal-spire', {});
    flow.setState({ overlay: 'spire' });
    render(<WorldScreen />);
    expect(screen.queryByText(/the Blank Chart grows warm/)).toBeNull();
  });

  it("Wisp's new face: three panels once the name is learned — once", () => {
    at('whispering-woods', { [story.ACT4_SEEN]: true, 'name-learned': true });
    const { unmount } = render(<WorldScreen />);
    expect(screen.getByText(/Wisp says it slowly/)).toBeInTheDocument();
    readOn(story.WISP_FACE_PANELS.length - 1);
    fireEvent.click(screen.getByRole('button', { name: '🌼 Aster!' }));
    expect(useSaveStore.getState().save!.flags[story.WISP_FACE_SEEN]).toBe(true);
    unmount();
    render(<WorldScreen />);
    expect(screen.queryByRole('dialog', { name: 'Story' })).toBeNull();
  });
});

describe('the Nameless Hall (#75 item 16c)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    flow.setState({ overlay: null });
  });
  afterEach(() => vi.useRealTimers());

  it('plays its three panels the first time you walk in — once', () => {
    useSaveStore.setState({
      userId: null,
      status: 'ready',
      save: { ...defaultSave(), avatarId: 'a3', zoneId: 'nameless-hall', flags: { ...umbraBeaten(), [story.SPIRE_VICTORY_SEEN]: true, [story.ACT2_SEEN]: true, 'key-asters-key': true } },
      flush: vi.fn(async () => {}),
    });
    const { unmount } = render(<WorldScreen />);
    expect(story.NAMELESS_PANELS).toHaveLength(3);
    expect(screen.getByText(/Every single one is blank/)).toBeInTheDocument();
    readOn(story.NAMELESS_PANELS.length - 1);
    fireEvent.click(screen.getByRole('button', { name: '🏛️ Look around' }));
    expect(useSaveStore.getState().save!.flags[story.NAMELESS_SEEN]).toBe(true);
    unmount();
    render(<WorldScreen />);
    expect(screen.queryByRole('dialog', { name: 'Story' })).toBeNull();
  });
});
