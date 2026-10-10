import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { BattleEnemy, Question } from '../../types';

const q: Question = {
  id: 'q1',
  topic: 'math',
  level: 3,
  text: 'What is 2 + 2?',
  options: ['4', '5', '6', '7'],
  correctIndex: 0,
};

vi.mock('../../hooks/useGeneratedQuestions', () => ({
  useGeneratedQuestions: () => ({ questions: [q], loading: false, error: null, reload: () => {} }),
}));
vi.mock('../../lib/questions', async (orig) => ({
  ...(await orig<typeof import('../../lib/questions')>()),
  fetchQuestions: () => new Promise(() => {}),
}));
vi.mock('canvas-confetti', () => ({ default: () => {} }));
vi.mock('../../machines/gameFlow', () => ({ sendFlow: vi.fn() }));

const { default: BattleArena } = await import('./BattleArena');
const { useBattleStore } = await import('../../store/battleStore');
const { useSaveStore } = await import('../../store/saveStore');
const { defaultSave } = await import('../../lib/save');
const { atTier } = await import('../../content/enemies');
const { BOAT_MENDED } = await import('../../content/boat');
const { heroOpening } = await import('../../lib/battleTurn');
const { counterDamage } = await import('../../lib/battleMath');

const enemy = {
  id: 'count-bat',
  instanceId: 'e1',
  name: 'Count Bat',
  sprite: '🦇',
  level: 3,
  maxHp: 200,
  topic: 'math',
  zoneId: 'numbria',
  isBoss: false,
  coins: 10,
} as BattleEnemy;

beforeEach(() => {
  useSaveStore.setState({
    userId: null,
    save: { ...defaultSave(), avatarId: 'a1', items: { ...defaultSave().items, potion: 1 } },
    status: 'ready',
    remoteError: null,
  });
  useBattleStore.getState().reset();
  useBattleStore.getState().start(enemy, 60, 100);
});

describe('BattleArena (smoke)', () => {
  it('Attack → answer → continue lands the hit and fills charge', () => {
    render(<BattleArena />);
    fireEvent.click(screen.getByText('Attack'));
    fireEvent.click(screen.getByText('4'));
    fireEvent.click(screen.getByText('▶ Go!'));
    expect(screen.getByText(/strikes true/)).toBeInTheDocument();
    const s = useBattleStore.getState();
    expect(s.enemyHp).toBeLessThan(200);
    expect(s.charge).toBe(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('a potion used right after an enemy hit keeps both (#70)', () => {
    // Fake timers so the test can prove no delayed write lands afterwards —
    // the original bug was an HP write 260ms after the hit.
    vi.useFakeTimers();
    render(<BattleArena />);
    // Guard → wrong answer → enemy attacks → wrong defend answer.
    fireEvent.click(screen.getByText('Guard'));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('▶ Go!'));
    fireEvent.click(screen.getByText(/tap to continue/));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('▶ Go!'));
    const afterHit = useBattleStore.getState().playerHp;
    expect(afterHit).toBeLessThan(60);
    // Tap straight through (no waiting for the 260ms impact) and drink.
    fireEvent.click(screen.getByText(/tap to continue/));
    fireEvent.click(screen.getByText('Items'));
    fireEvent.click(screen.getByText('Berry Potion'));
    const healed = Math.min(100, afterHit + 50);
    expect(useBattleStore.getState().playerHp).toBe(healed);
    // Let every pending animation / impact timer fire: HP must not move.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(useBattleStore.getState().playerHp).toBe(healed);
    expect(useSaveStore.getState().save!.items.potion).toBe(0);
  });
});

describe('the Forget-Me-Knot (#75 item 14e)', () => {
  it('from the Items menu it spends a turn and ties on; the next wrong answer gets a second try, once', () => {
    useSaveStore.setState({ save: { ...defaultSave(), avatarId: 'a1', items: { ...defaultSave().items, knot: 1 } } });
    render(<BattleArena />);
    fireEvent.click(screen.getByText('Items'));
    fireEvent.click(screen.getByText('Forget-Me-Knot'));
    expect(useBattleStore.getState().knotted).toBe(true);
    expect(useSaveStore.getState().save!.items.knot).toBe(0);
    // The enemy's turn: a defend question — pick wrong, get a second try, pick right.
    fireEvent.click(screen.getByText(/tap to continue/));
    fireEvent.click(screen.getByText('5'));
    expect(screen.getByText(/second try/)).toBeInTheDocument();
    expect(useBattleStore.getState().knotted).toBe(false);
    // The defend timer waits for the second pick (review fix).
    expect(screen.getByText('⏸ Paused')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveAccessibleName('Timer paused — take your time');
    fireEvent.click(screen.getByText('4'));
    fireEvent.click(screen.getByText('▶ Go!'));
    // Defended (a right answer only grazes; a wrong one would hit for ~25).
    expect(useBattleStore.getState().playerHp).toBeGreaterThanOrEqual(55);
  });

  it('can\'t be tied twice', () => {
    useSaveStore.setState({ save: { ...defaultSave(), avatarId: 'a1', items: { ...defaultSave().items, knot: 2 } } });
    useBattleStore.getState().applyCombat({ ...useBattleStore.getState(), enemyMaxHp: 200, knotted: true } as never);
    render(<BattleArena />);
    fireEvent.click(screen.getByText('Items'));
    expect(screen.getByText(/Already tied/)).toBeInTheDocument();
  });
});

describe('opening lines (#75 item 12)', () => {
  const tough = { ...enemy, instanceId: 'e2', tier: 3 } as BattleEnemy;

  it("the first fight against a tier's marks explains them before the first command — once a session", () => {
    useBattleStore.getState().start(tough, 60, 100);
    const first = render(<BattleArena />);
    expect(screen.getByText('💪 See the !! by its level? Critters with ! marks hit harder — but they drop more coins!')).toBeInTheDocument();
    expect(screen.queryByText('Attack')).toBeNull();
    expect(useBattleStore.getState().toughMet).toEqual([3]);
    fireEvent.click(screen.getByText(/tap to continue/));
    expect(screen.getByText('Attack')).toBeInTheDocument();
    first.unmount();

    useBattleStore.getState().start({ ...tough, instanceId: 'e3' }, 60, 100);
    render(<BattleArena />);
    expect(screen.queryByText(/💪/)).toBeNull();
    expect(screen.getByText('Attack')).toBeInTheDocument();
  });

  it('past "!!!" one line explains the colour, once for tiers 5–7 (#75 item 14c)', () => {
    const veryTough = { ...enemy, instanceId: 'e6', tier: 6 } as BattleEnemy;
    useBattleStore.getState().start(veryTough, 60, 100);
    const first = render(<BattleArena />);
    expect(screen.getByText(/💪 See its purple !!! by its level\? A very tough critter/)).toBeInTheDocument();
    expect(useBattleStore.getState().toughMet).toEqual([5]);
    first.unmount();

    useBattleStore.getState().start({ ...veryTough, instanceId: 'e7', tier: 7 }, 60, 100);
    render(<BattleArena />);
    expect(screen.queryByText(/💪/)).toBeNull();
    expect(screen.getByText('Attack')).toBeInTheDocument();
  });

  it("after two losses a far critter's fight is eased, and a 💛 line says how", () => {
    useBattleStore.getState().recordLoss('count-bat@3');
    useBattleStore.getState().recordLoss('count-bat@3');
    useBattleStore.getState().start(atTier(tough, 1), 60, 100);
    render(<BattleArena />);
    expect(
      screen.getByText('💛 Tough one last time? Count Bat will go easier on you now — gentler hits and easier questions.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/💪/)).toBeNull(); // it fights at tier 1 now: no marks to explain
  });
});

describe('a battle at sea (#75 item 14d)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const backdrop = (c: HTMLElement) =>
    Array.from(c.querySelectorAll<HTMLElement>('[aria-hidden]')).map((el) => el.style.backgroundImage).find((b) => b.includes('/backgrounds/'));

  it('a sea critter is fought from Marlow\'s boat, out on the open water', () => {
    const puffer = { ...enemy, id: 'bubble-puffer', instanceId: 'sea1', name: 'Bubble Puffer', topic: 'nature', zoneId: 'silver-shallows', habitat: 'sea' } as BattleEnemy;
    useBattleStore.getState().start(puffer, 60, 100);
    const { container } = render(<BattleArena />);
    expect(backdrop(container)).toContain('/backgrounds/silver-shallows-sea.png');
    // The boat behind the hero and the front of its hull over their feet — decoration only.
    const boat = screen.getByTestId('battle-boat');
    expect(boat).toHaveAttribute('aria-hidden');
    expect(boat.style.backgroundImage).toContain('/tiles/boat.png');
    expect(screen.getByTestId('battle-boat-front')).toHaveAttribute('aria-hidden');
  });

  it('lost at sea: Old Marlow rows the boat home to his dock, and the defeat screen says so', () => {
    vi.useFakeTimers();
    const puffer = { ...enemy, id: 'bubble-puffer', instanceId: 'sea2', name: 'Bubble Puffer', topic: 'nature', zoneId: 'silver-shallows', habitat: 'sea' } as BattleEnemy;
    const save = useSaveStore.getState().save!;
    useSaveStore.setState({
      save: { ...save, zoneId: 'silver-shallows', pos: { x: 15 * 32 + 16, y: 28 * 32 + 16 }, aboard: true, boat: null, flags: { ...save.flags, [BOAT_MENDED]: true } },
    });
    useBattleStore.getState().start(puffer, 1, 100);
    render(<BattleArena />);
    // Guard → wrong → the puffer attacks → a wrong defend answer: the hero (1 HP) goes down.
    fireEvent.click(screen.getByText('Guard'));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('▶ Go!'));
    fireEvent.click(screen.getByText(/tap to continue/));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('▶ Go!'));
    fireEvent.click(screen.getByText(/tap to continue/));
    expect(screen.getByText(/Whew/)).toBeInTheDocument();
    expect(screen.getByText(/Old Marlow rowed/)).toBeInTheDocument();
    // Not moored mid-sea where the fight was (`moorBoat` would leave it at 15,28): home.
    const after = useSaveStore.getState().save!;
    expect(after.aboard).toBe(false);
    expect(after.boat).toBeNull();
    expect(after.zoneId).not.toBe('silver-shallows');
  });

  it('lost ashore: no word of the boat, and it stays where it\'s moored', () => {
    vi.useFakeTimers();
    const save = useSaveStore.getState().save!;
    const moored = { zoneId: 'silver-shallows' as const, x: 19, y: 20 };
    useSaveStore.setState({ save: { ...save, aboard: false, boat: moored, flags: { ...save.flags, [BOAT_MENDED]: true } } });
    useBattleStore.getState().start(enemy, 1, 100);
    render(<BattleArena />);
    fireEvent.click(screen.getByText('Guard'));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('▶ Go!'));
    fireEvent.click(screen.getByText(/tap to continue/));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('▶ Go!'));
    fireEvent.click(screen.getByText(/tap to continue/));
    expect(screen.getByText(/Whew/)).toBeInTheDocument();
    expect(screen.queryByText(/Old Marlow rowed/)).toBeNull();
    expect(useSaveStore.getState().save!.boat).toEqual(moored);
  });

  it('a land critter keeps its zone\'s backdrop and no boat', () => {
    const { container } = render(<BattleArena />);
    expect(backdrop(container)).toContain('/backgrounds/numbria.png');
    expect(screen.queryByTestId('battle-boat')).toBeNull();
    expect(screen.queryByTestId('battle-boat-front')).toBeNull();
  });
});

describe('what beating a boss does follows its role (#75 item 14c)', () => {
  const boss = (over: Partial<BattleEnemy>) =>
    ({ ...enemy, instanceId: `boss-${over.id}`, isBoss: true, maxHp: 1, coins: 50, ...over }) as BattleEnemy;

  /** Tap through any opening lines, land one right answer, and read on to the result. */
  function winIt() {
    render(<BattleArena />);
    for (let i = 0; i < 8 && !screen.queryByText('Attack'); i++) fireEvent.click(screen.getByText(/tap to continue/));
    fireEvent.click(screen.getByText('Attack'));
    fireEvent.click(screen.getByText('4'));
    fireEvent.click(screen.getByText('▶ Go!'));
    for (let i = 0; i < 8 && !screen.queryByText('Victory!'); i++) {
      const next = screen.queryByText(/tap to continue/);
      if (next) fireEvent.click(next);
    }
    expect(screen.getByText('Victory!')).toBeInTheDocument();
    return useSaveStore.getState().save!.flags;
  }

  it('a miniboss with no key and no lines, on a topic with no Fiend, fights without a crash and restores nothing', () => {
    useBattleStore.getState().start(boss({ id: 'test-miniboss', name: 'Mossback', topic: 'nature', role: 'miniboss' }), 60, 100);
    const flags = winIt();
    expect(flags['boss:test-miniboss:defeated']).toBe(true);
    expect(Object.keys(flags).filter((f) => f.startsWith('crystal-'))).toEqual([]);
    expect(screen.queryByText(/shines again/)).toBeNull();
  });

  it("an echo on a crystal topic keeps its own name and never restores that crystal", () => {
    useBattleStore.getState().start(boss({ id: 'test-echo', name: 'Echo of the Null Fiend', topic: 'math', role: 'echo' }), 60, 100);
    const flags = winIt();
    expect(screen.getAllByText(/Echo of the Null Fiend/).length).toBeGreaterThan(0);
    expect(flags['crystal-math-restored']).toBeUndefined();
    expect(flags['boss:test-echo:defeated']).toBe(true);
  });

  it('a Fiend still speaks first and restores its crystal', () => {
    useBattleStore.getState().start(boss({ id: 'null-fiend', name: 'The Null Fiend', topic: 'math', role: 'fiend' }), 60, 100);
    const flags = winIt();
    expect(flags['crystal-math-restored']).toBe(true);
    expect(flags['boss:null-fiend:defeated']).toBeUndefined();
    expect(screen.getByText(/The Crystal of Numbers shines again!/)).toBeInTheDocument();
  });
});

describe('the heroines in battle: Skye and Nyx', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function asHero(avatarId: string, style: 'swift' | 'mystic', hint = 0) {
    useSaveStore.setState({ save: { ...defaultSave(), avatarId, items: { ...defaultSave().items, hint } } });
    useBattleStore.getState().reset();
    useBattleStore.getState().start(enemy, 60, 100, heroOpening(style));
  }

  it("Skye's Counter Strike: a right defend answer strikes back", () => {
    asHero('a4', 'swift');
    render(<BattleArena />);
    // Guard → wrong, so the blow isn't simply blocked; then defend right.
    fireEvent.click(screen.getByText('Guard'));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('▶ Go!'));
    fireEvent.click(screen.getByText(/tap to continue/));
    fireEvent.click(screen.getByText('4'));
    fireEvent.click(screen.getByText('▶ Go!'));
    expect(screen.getByText(/Counter Strike! Skye strikes right back/)).toBeInTheDocument();
    expect(useBattleStore.getState().enemyHp).toBe(200 - counterDamage('swift', {}));
  });

  it('Skye defending wrong does not counter', () => {
    asHero('a4', 'swift');
    render(<BattleArena />);
    fireEvent.click(screen.getByText('Guard'));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('▶ Go!'));
    fireEvent.click(screen.getByText(/tap to continue/));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('▶ Go!'));
    expect(screen.queryByText(/Counter Strike/)).toBeNull();
    expect(useBattleStore.getState().enemyHp).toBe(200);
  });

  it("Skye's Fox Sense: one free hint a battle, used before her feathers", () => {
    asHero('a4', 'swift', 1);
    render(<BattleArena />);
    fireEvent.click(screen.getByText('Attack'));
    fireEvent.click(screen.getByText('🦊 Fox Sense — use a free hint!'));
    expect(useBattleStore.getState().freeHint).toBe(false);
    expect(useSaveStore.getState().save!.items.hint).toBe(1);
    fireEvent.click(screen.getByText('4'));
    fireEvent.click(screen.getByText('▶ Go!'));
    fireEvent.click(screen.getByText(/tap to continue/));
    // The next question offers her own feather, the ordinary way.
    expect(screen.getByText('🪶 Use a Hint Feather (1 left)')).toBeInTheDocument();
  });

  it('a hero without Fox Sense and no feathers gets no hint button', () => {
    useSaveStore.setState({ save: { ...defaultSave(), avatarId: 'a1', items: { ...defaultSave().items, hint: 0 } } });
    render(<BattleArena />);
    fireEvent.click(screen.getByText('Attack'));
    expect(screen.queryByText(/Hint Feather|Fox Sense/)).toBeNull();
  });

  it("Nyx's Spark Start: she opens the fight with charge, and says so", () => {
    vi.useFakeTimers();
    asHero('a5', 'mystic');
    render(<BattleArena />);
    expect(useBattleStore.getState().charge).toBe(2);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText('✨ +2◆')).toBeInTheDocument();
  });
});
