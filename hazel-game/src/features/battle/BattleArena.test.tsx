import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import type { BattleEnemy, FightStyle, Profile, Question } from '../../types';

const q: Question = {
  id: 'q1',
  topic: 'math',
  level: 3,
  text: 'What is 2 + 2?',
  options: ['4', '5', '6', '7'],
  correctIndex: 0,
};

// The battle's question pool; a test may swap it (#153: starter questions).
// The spell pool (flavour 'spell') never arrives unless a test hands one over.
const pool = { questions: [q] };
const spellPool = { questions: [] as Question[] };
vi.mock('../../hooks/useBattleQuestions', () => ({
  useBattleQuestions: (_t: unknown, _c: unknown, _l: unknown, flavor?: string) => ({
    questions: flavor === 'spell' ? spellPool.questions : pool.questions,
    loading: false,
    error: null,
    reload: () => {},
  }),
}));
// The encounter flash is over at once here (BattleIntro.test plays it), unless
// a test holds it to see what waits for it.
const intro = { hold: false };
vi.mock('./BattleIntro', async () => {
  const { useEffect } = await import('react');
  return {
    BattleIntro: ({ onDone }: { onDone: () => void }) => {
      useEffect(() => {
        if (!intro.hold) onDone();
      }, [onDone]);
      return <button onClick={onDone}>end the flash</button>;
    },
  };
});
// The speed boost's harder pool (#97) never arrives unless a test hands one over.
const fetchQuestionsMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>(() => new Promise(() => {})));
vi.mock('../../lib/questions', async (orig) => ({
  ...(await orig<typeof import('../../lib/questions')>()),
  fetchQuestions: fetchQuestionsMock,
}));
vi.mock('canvas-confetti', () => ({ default: () => {} }));
vi.mock('../../machines/gameFlow', () => ({ sendFlow: vi.fn() }));

const { default: BattleArena } = await import('./BattleArena');
const { useBattleStore } = await import('../../store/battleStore');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { defaultSave } = await import('../../lib/save');
const { atTier } = await import('../../content/enemies');
const { BOAT_MENDED } = await import('../../content/boat');
const { heroOpening } = await import('../../lib/battleTurn');
const { counterDamage } = await import('../../lib/battleMath');
const { XP_PER_CORRECT } = await import('../../lib/level');

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
  pool.questions = [q];
  spellPool.questions = [];
  intro.hold = false;
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

  it('the level and streak sit in their own row above the status boxes, in the page (#75 item 14f review)', () => {
    render(<BattleArena />);
    const bar = screen.getByTestId('battle-topbar');
    expect(bar.querySelector('.fixed')).toBeNull();
    expect(bar.textContent).toMatch(/LEVEL|Level/);
    // Before the enemy's status box, not floating over it.
    const enemyName = screen.getByTitle('Count Bat');
    expect(bar.compareDocumentPosition(enemyName) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
      save: { ...save, zoneId: 'silver-shallows', pos: { x: 15 * 32 + 16, y: 28 * 32 + 16 }, vehicle: 'boat', boat: null, flags: { ...save.flags, [BOAT_MENDED]: true } },
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
    expect(after.vehicle).toBe('foot');
    expect(after.boat).toBeNull();
    expect(after.zoneId).not.toBe('silver-shallows');
  });

  it('lost ashore: no word of the boat, and it stays where it\'s moored', () => {
    vi.useFakeTimers();
    const save = useSaveStore.getState().save!;
    const moored = { zoneId: 'silver-shallows' as const, x: 19, y: 20 };
    useSaveStore.setState({ save: { ...save, vehicle: 'foot', boat: moored, flags: { ...save.flags, [BOAT_MENDED]: true } } });
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

  it('the Last Fogbank gives its Foglight Badge the first time it falls, and only then (#75 item 14g)', () => {
    const fogbank = boss({ id: 'last-fogbank', name: 'The Last Fogbank', topic: 'history', role: 'miniboss' });
    useBattleStore.getState().start(fogbank, 60, 100);
    const flags = winIt();
    expect(flags['boss:last-fogbank:defeated']).toBe(true);
    expect(useSaveStore.getState().save!.badges).toEqual(['foglight']);
    expect(screen.getByText(/You won the Foglight Badge/)).toBeInTheDocument();
  });

  it('a boss badge already on the shelf is not won again', () => {
    const save = useSaveStore.getState().save!;
    useSaveStore.setState({ save: { ...save, badges: ['foglight'] } });
    useBattleStore.getState().start(boss({ id: 'last-fogbank', name: 'The Last Fogbank', topic: 'history', role: 'miniboss' }), 60, 100);
    winIt();
    expect(useSaveStore.getState().save!.badges).toEqual(['foglight']);
    expect(screen.queryByText(/You won the Foglight Badge/)).toBeNull();
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

describe('the encounter flash and a pool that grows (#158 review)', () => {
  it('nothing starts behind the flash: the command menu and a Fiend\'s monologue wait for it', () => {
    intro.hold = true;
    useBattleStore.getState().start({ ...enemy, id: 'null-fiend', instanceId: 'nf', name: 'The Null Fiend', isBoss: true, role: 'fiend' } as BattleEnemy, 60, 100);
    render(<BattleArena />);
    expect(screen.queryByText('Attack')).toBeNull();
    expect(screen.queryByText(/tap to continue/)).toBeNull();
    fireEvent.click(screen.getByText('end the flash'));
    expect(screen.getByText(/tap to continue/)).toBeInTheDocument();
  });

  it('questions that arrive mid-fight are asked next, in order', () => {
    const q2: Question = { ...q, id: 'q2', text: 'What is 3 + 1?' };
    const { rerender } = render(<BattleArena />);
    fireEvent.click(screen.getByText('Attack'));
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
    pool.questions = [q, q2];
    rerender(<BattleArena />);
    fireEvent.click(screen.getByText('4'));
    fireEvent.click(screen.getByText('▶ Go!'));
    // The enemy's turn asks the next question: the one that just arrived.
    for (let i = 0; i < 5 && !screen.queryByText('What is 3 + 1?'); i++) {
      const next = screen.queryByText(/tap to continue/);
      if (next) fireEvent.click(next);
      else if (screen.queryByText('Attack')) fireEvent.click(screen.getByText('Attack'));
    }
    expect(screen.getByText('What is 3 + 1?')).toBeInTheDocument();
  });
});

describe('signature abilities in battle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function asHero(avatarId: string, style: FightStyle, hint = 0, hp = 60) {
    useSaveStore.setState({ save: { ...defaultSave(), avatarId, items: { ...defaultSave().items, hint } } });
    useBattleStore.getState().reset();
    useBattleStore.getState().start(enemy, hp, 100, heroOpening(style));
  }

  it("Kira's Counter Strike: a right defend answer strikes back", () => {
    asHero('a4', 'swift');
    render(<BattleArena />);
    // Guard → wrong, so the blow isn't simply blocked; then defend right.
    fireEvent.click(screen.getByText('Guard'));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('▶ Go!'));
    fireEvent.click(screen.getByText(/tap to continue/));
    fireEvent.click(screen.getByText('4'));
    fireEvent.click(screen.getByText('▶ Go!'));
    expect(screen.getByText(/Counter Strike! Kira strikes right back/)).toBeInTheDocument();
    expect(useBattleStore.getState().enemyHp).toBe(200 - counterDamage('swift', {}));
  });

  it('Kira defending wrong does not counter', () => {
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

  it("Kira's Fox Sense: one free hint a battle, used before her feathers", () => {
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

  it("Selene's Spark Start: she opens the fight with charge, and says so", () => {
    vi.useFakeTimers();
    asHero('a5', 'mystic');
    render(<BattleArena />);
    expect(useBattleStore.getState().charge).toBe(2);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText('✨ +2◆')).toBeInTheDocument();
  });

  it("Valor's Battle Cry: his first landed Attack hits double, the next doesn't", () => {
    asHero('a1', 'aggressive');
    render(<BattleArena />);
    fireEvent.click(screen.getByText('Attack'));
    fireEvent.click(screen.getByText('4'));
    fireEvent.click(screen.getByText('▶ Go!'));
    expect(screen.getByText(/Focused — double damage/)).toBeInTheDocument();
    const first = 200 - useBattleStore.getState().enemyHp;
    expect(useBattleStore.getState().focused).toBe(false);
    expect(first).toBe(80);
  });

  it("Valor's Lionheart: below half HP his Attack hits harder", () => {
    asHero('a1', 'aggressive', 0, 40);
    useBattleStore.getState().applyCombat({ ...useBattleStore.getState(), enemyMaxHp: 200, focused: false } as never);
    render(<BattleArena />);
    fireEvent.click(screen.getByText('Attack'));
    fireEvent.click(screen.getByText('4'));
    fireEvent.click(screen.getByText('▶ Go!'));
    expect(screen.getByText(/Lionheart/)).toBeInTheDocument();
    expect(useBattleStore.getState().enemyHp).toBe(200 - 60);
  });

  it("Bastion's Shell Up: he opens the fight guarded", () => {
    asHero('a2', 'defensive');
    render(<BattleArena />);
    expect(useBattleStore.getState().guarded).toBe(true);
  });

  it("Talon's Keen Eye mends on a right answer, and Second Wind catches a knockout", () => {
    asHero('a3', 'balanced', 0, 1);
    render(<BattleArena />);
    // Guard → right: Keen Eye mends 3.
    fireEvent.click(screen.getByText('Guard'));
    fireEvent.click(screen.getByText('4'));
    expect(useBattleStore.getState().playerHp).toBe(4);
    fireEvent.click(screen.getByText('▶ Go!'));
    // Drop the guard so the next blow lands, at 1 HP.
    useBattleStore.getState().applyCombat({ ...useBattleStore.getState(), enemyMaxHp: 200, guarded: false, playerHp: 1 } as never);
    fireEvent.click(screen.getByText(/tap to continue/));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('▶ Go!'));
    expect(screen.getByText(/Second Wind! Talon hangs on with 1 HP/)).toBeInTheDocument();
    expect(useBattleStore.getState()).toMatchObject({ playerHp: 1, secondWind: false });
  });
});

describe('the Glimmer Candle (#75 item 14g)', () => {
  it('lights a free hint that works even on a trickster', () => {
    const save = useSaveStore.getState().save!;
    useSaveStore.setState({ save: { ...save, items: { ...save.items, candle: 1, hint: 0 } } });
    useBattleStore.getState().start({ ...enemy, behavior: 'trickster' } as BattleEnemy, 60, 100);
    render(<BattleArena />);
    for (let i = 0; i < 4 && !screen.queryByText('Items'); i++) fireEvent.click(screen.getByText(/tap to continue/));
    fireEvent.click(screen.getByText('Items'));
    fireEvent.click(screen.getByText('Glimmer Candle'));
    expect(useBattleStore.getState().candleLit).toBe(true);
    expect(useSaveStore.getState().save!.items.candle).toBe(0);
    // The enemy's turn: its defend question offers the candle's free hint.
    for (let i = 0; i < 4 && !screen.queryByText(/Glimmer Candle — use a free hint/); i++) {
      const next = screen.queryByText(/tap to continue/);
      if (next) fireEvent.click(next);
    }
    expect(screen.getByText(/Glimmer Candle — use a free hint/)).toBeInTheDocument();
  });

  it('after its free hint, Hint Feathers still work on the trickster', () => {
    const save = useSaveStore.getState().save!;
    useSaveStore.setState({ save: { ...save, items: { ...save.items, candle: 1, hint: 1 } } });
    useBattleStore.getState().start({ ...enemy, behavior: 'trickster' } as BattleEnemy, 60, 100);
    render(<BattleArena />);
    for (let i = 0; i < 4 && !screen.queryByText('Items'); i++) fireEvent.click(screen.getByText(/tap to continue/));
    fireEvent.click(screen.getByText('Items'));
    fireEvent.click(screen.getByText('Glimmer Candle'));
    for (let i = 0; i < 4 && !screen.queryByText(/Glimmer Candle — use a free hint/); i++) {
      const next = screen.queryByText(/tap to continue/);
      if (next) fireEvent.click(next);
    }
    fireEvent.click(screen.getByText(/Glimmer Candle — use a free hint/));
    expect(useBattleStore.getState().candleHint).toBe(false);
    expect(useSaveStore.getState().save!.items.hint).toBe(1);
    // The next question: the trickster can't block the feather now.
    fireEvent.click(screen.getByText('4'));
    fireEvent.click(screen.getByText('▶ Go!'));
    for (let i = 0; i < 4 && !screen.queryByText('Attack'); i++) {
      const next = screen.queryByText(/tap to continue/);
      if (next) fireEvent.click(next);
    }
    fireEvent.click(screen.getByText('Attack'));
    expect(screen.getByText(/Use a Hint Feather \(1 left\)/)).toBeInTheDocument();
  });
});

describe('the Sunken Archive in battle (#75 item 14h)', () => {
  afterEach(() => {
    fetchQuestionsMock.mockImplementation(() => new Promise(() => {}));
  });

  it('a swift critter strikes first: the fight opens with its blow, blocked by a defend question as ever', () => {
    const imp = { ...enemy, id: 'quill-imp', instanceId: 'qi', name: 'Quill Imp', behavior: 'swift' } as BattleEnemy;
    useBattleStore.getState().start(imp, 60, 100);
    render(<BattleArena />);
    // No command menu yet: it darts in first.
    expect(screen.getByText('⚡ Quill Imp darts in before you can move!')).toBeInTheDocument();
    expect(screen.queryByText('Attack')).toBeNull();
    fireEvent.click(screen.getByText(/tap to continue/));
    // A defend question, the usual way: a wrong answer lets the blow land.
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('▶ Go!'));
    expect(useBattleStore.getState().playerHp).toBeLessThan(60);
    fireEvent.click(screen.getByText(/tap to continue/));
    // Then the hero's turn.
    expect(screen.getByText('Attack')).toBeInTheDocument();
  });

  it('a critter that isn\'t swift lets the hero go first', () => {
    render(<BattleArena />);
    expect(screen.queryByText(/darts in/)).toBeNull();
    expect(screen.getByText('Attack')).toBeInTheDocument();
  });

  it("Sage Chronicle's Time Ripple lands a strike and the enemy loses its next turn", async () => {
    spellPool.questions = [q, q, q, q];
    useSaveStore.setState({ save: { ...defaultSave(), avatarId: 'a1', sages: ['history'] } });
    useBattleStore.getState().start(enemy, 60, 100);
    useBattleStore.setState({ charge: 3 });
    render(<BattleArena />);
    // Let the spell pool arrive.
    await act(async () => {});
    fireEvent.click(screen.getByText('Spells'));
    fireEvent.click(screen.getByText(/Time Ripple/));
    fireEvent.click(screen.getByText('4'));
    fireEvent.click(screen.getByText('▶ Go!'));
    expect(screen.getByText(/Time ripples round Count Bat — it loses its next turn!/)).toBeInTheDocument();
    const s = useBattleStore.getState();
    expect(s.enemyHp).toBeLessThan(200);
    // 3◆ spent, and the right answer earns one back, as every right answer does.
    expect(s.charge).toBe(1);
    fireEvent.click(screen.getByText(/tap to continue/));
    // Straight back to the hero: no defend question, no blow.
    expect(screen.getByText('Attack')).toBeInTheDocument();
    expect(useBattleStore.getState().playerHp).toBe(60);
  });

  it('rested at the Quiet Shelf Inn and beaten elsewhere: carried back there, not "Binder finds you" (review fix)', () => {
    useSaveStore.setState({ save: { ...defaultSave(), avatarId: 'a1', zoneId: 'numbria', lastRest: 'sunken-archive' } });
    useBattleStore.getState().start(enemy, 1, 100);
    render(<BattleArena />);
    fireEvent.click(screen.getByText('Guard'));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('▶ Go!'));
    fireEvent.click(screen.getByText(/tap to continue/));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('▶ Go!'));
    fireEvent.click(screen.getByText(/tap to continue/));
    expect(screen.getByText(/carry you back to the Quiet Shelf Inn in the Sunken Archive, where you last rested/)).toBeInTheDocument();
    expect(screen.queryByText(/Binder finds you/)).toBeNull();
    expect(useSaveStore.getState().save!.zoneId).toBe('sunken-archive');
  });
});

describe('starter questions never move the saved skill level (#153 review round 1)', () => {
  const starter: Question = { ...q, id: 'starter-math-easy-1' };
  const setSkillLevel = vi.fn();

  beforeEach(() => {
    setSkillLevel.mockReset();
    fetchQuestionsMock.mockClear();
    useProfileStore.setState({
      profile: {
        id: 'kid', birthYear: 2017, birthMonth: 1, skillLevels: { math: 3 }, xp: 0, powerUps: {},
        currentStreak: 0, longestStreak: 0, lastPlayedOn: null,
      } as Profile,
      setSkillLevel,
      addXp: vi.fn(),
      recordActivity: vi.fn(),
    });
  });
  afterEach(() => {
    useProfileStore.setState({ profile: null });
    fetchQuestionsMock.mockImplementation(() => new Promise(() => {}));
  });

  /** Answer `n` questions right, quickly, through attacks and defends alike. */
  function answerRight(n: number) {
    render(<BattleArena />);
    let answered = 0;
    for (let i = 0; i < 80 && answered < n; i++) {
      if (screen.queryByText('Attack')) {
        fireEvent.click(screen.getByText('Attack'));
      } else if (screen.queryByText('4')) {
        fireEvent.click(screen.getByText('4'));
        fireEvent.click(screen.getByText('▶ Go!'));
        answered++;
      } else {
        fireEvent.click(screen.getByText(/tap to continue/));
      }
    }
    expect(answered).toBe(n);
  }

  /** One right Attack on a 1-HP critter, read on to the win. */
  function winWithOneAnswer() {
    useBattleStore.getState().start({ ...enemy, maxHp: 1 }, 60, 100);
    answerRight(1);
    for (let i = 0; i < 8 && !screen.queryByText('Victory!'); i++) {
      const next = screen.queryByText(/tap to continue/);
      if (next) fireEvent.click(next);
    }
    expect(screen.getByText('Victory!')).toBeInTheDocument();
  }

  it('a win on a bank question raises it; the same win on a starter question leaves it', () => {
    winWithOneAnswer();
    expect(setSkillLevel).toHaveBeenCalledWith('math', 5);

    cleanup();
    setSkillLevel.mockReset();
    pool.questions = [starter];
    useBattleStore.getState().reset();
    winWithOneAnswer();
    expect(setSkillLevel).not.toHaveBeenCalled();
  });

  it('a right starter answer pays no XP; the win itself still does', () => {
    const addXp = vi.fn();
    useProfileStore.setState({ addXp });
    winWithOneAnswer();
    const bankWin = addXp.mock.calls[0][0] as number;

    cleanup();
    addXp.mockClear();
    pool.questions = [starter];
    useBattleStore.getState().reset();
    winWithOneAnswer();
    const starterWin = addXp.mock.calls[0][0] as number;
    // The same win, less the one answer's XP.
    expect(bankWin - starterWin).toBe(XP_PER_CORRECT);
    expect(starterWin).toBeGreaterThan(0);
  });

  it('five quick right starter answers don’t trip the speed trigger', () => {
    pool.questions = [starter];
    answerRight(5);
    expect(fetchQuestionsMock.mock.calls.filter((c) => c[4] === 'battle')).toEqual([]);
  });

  it('…as five quick right bank answers do', () => {
    answerRight(5);
    expect(fetchQuestionsMock.mock.calls.filter((c) => c[4] === 'battle')).toHaveLength(1);
  });

  it('a win on one right bank answer among more starter answers leaves it (review round 2)', () => {
    // A short batch: one bank question, the rest starters.
    pool.questions = [q, { ...q, id: 'starter-math-easy-1' }, { ...q, id: 'starter-math-easy-2' }];
    useBattleStore.getState().start({ ...enemy, maxHp: 1 }, 60, 100);
    render(<BattleArena />);
    // Guard (the bank question), defend (a starter), then Attack (a starter) for the win.
    let guards = 1;
    let answered = 0;
    for (let i = 0; i < 40 && !screen.queryByText('Victory!'); i++) {
      if (screen.queryByText('Attack')) {
        fireEvent.click(screen.getByText(guards-- > 0 ? 'Guard' : 'Attack'));
      } else if (screen.queryByText('4')) {
        fireEvent.click(screen.getByText('4'));
        fireEvent.click(screen.getByText('▶ Go!'));
        answered++;
      } else {
        fireEvent.click(screen.getByText(/tap to continue/));
      }
    }
    expect(screen.getByText('Victory!')).toBeInTheDocument();
    expect(answered).toBe(3);
    // One bank answer of three: too few to judge — the level holds (it was +2).
    expect(setSkillLevel).not.toHaveBeenCalled();
  });

  it('a speed boost the service can only fill with starter questions keeps the bank’s pool (review round 2)', async () => {
    fetchQuestionsMock.mockImplementation((...args: unknown[]) =>
      args[4] === 'battle'
        ? Promise.resolve([{ ...q, id: 'starter-math-middle-1', text: 'What is 3 + 3?', options: ['6', '5', '7', '8'] }])
        : new Promise(() => {}),
    );
    answerRight(5);
    await act(async () => {});
    // No "harder questions" promise for starters: the level still goes up after the battle.
    expect(screen.getByText(/Your level goes up to 4 after this battle/)).toBeInTheDocument();
    expect(screen.queryByText(/just got harder/)).toBeNull();
  });
});

// --- ✍️ Scribe bursts (#159 item 2) ----------------------------------------------
const { useKeyboardStore } = await import('../../store/keyboardStore');
const { BURST_MS, SCRIBE_ATTACK_MULT, SCRIBE_BLOCK_CHARGE, TYPING_LESSONS, charKey, typingLessonFlag } = await import('../../content/typing');

/** A keyboard seen and the first lesson cleared — the burst's two conditions. */
function unlockTyping(hold = false) {
  useKeyboardStore.getState().seen();
  const save = useSaveStore.getState().save!;
  useSaveStore.setState({ save: { ...save, typingAnchor: hold, flags: { ...save.flags, [typingLessonFlag(TYPING_LESSONS[0].id)]: true } } });
}

/** Type the burst's word (read off the card: the arena picks it at random). */
function typeBurstWord() {
  const word = screen.getByLabelText(/^Type: /).getAttribute('aria-label')!.slice('Type: '.length);
  for (const ch of word) {
    const code = charKey(ch)!.key.code;
    fireEvent.keyDown(window, { code, key: ch });
    fireEvent.keyUp(window, { code, key: ch });
  }
  return word;
}

function attackAndAnswer() {
  fireEvent.click(screen.getByText('Attack'));
  fireEvent.click(screen.getByText('4'));
}

describe('✍️ scribe bursts (#159 item 2)', () => {
  afterEach(() => {
    vi.useRealTimers();
    useKeyboardStore.getState().reset();
  });

  it('no burst without a keyboard, nor before the first lesson is cleared', () => {
    render(<BattleArena />);
    attackAndAnswer();
    expect(screen.queryByTestId('type-burst')).toBeNull();
    cleanup();
    useKeyboardStore.getState().seen();
    useBattleStore.getState().reset();
    useBattleStore.getState().start(enemy, 60, 100);
    render(<BattleArena />);
    attackAndAnswer();
    expect(screen.queryByTestId('type-burst')).toBeNull();
  });

  it(`after a right Attack answer the burst appears; its word typed in time, the hit is ×${SCRIBE_ATTACK_MULT} and says so`, () => {
    // The same first Attack without a burst, for the baseline.
    render(<BattleArena />);
    attackAndAnswer();
    fireEvent.click(screen.getByText('▶ Go!'));
    const plain = 200 - useBattleStore.getState().enemyHp;
    expect(plain).toBeGreaterThan(0);
    cleanup();

    useBattleStore.getState().reset();
    // Full HP: the enemy's blow below mustn't wake Valor's Lionheart and muddle the second Attack's number.
    useBattleStore.getState().start(enemy, 100, 100);
    unlockTyping();
    render(<BattleArena />);
    attackAndAnswer();
    expect(screen.getByTestId('type-burst')).toBeInTheDocument();
    const word = typeBurstWord();
    expect(['valor', 'ember', 'count bat']).toContain(word);
    expect(screen.getByTestId('type-burst')).toHaveTextContent(/Done!/);
    fireEvent.click(screen.getByText('▶ Go!'));
    expect(screen.getByText(/the word was true/)).toBeInTheDocument();
    expect(200 - useBattleStore.getState().enemyHp).toBe(Math.round(plain * SCRIBE_ATTACK_MULT));
    // The next Attack starts clean: no power carried over.
    fireEvent.click(screen.getByText(/tap to continue/));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('▶ Go!'));
    fireEvent.click(screen.getByText(/tap to continue/));
    const before = useBattleStore.getState().enemyHp;
    attackAndAnswer();
    fireEvent.click(screen.getByText('▶ Go!'));
    expect(screen.queryByText(/the word was true/)).toBeNull();
    expect(before - useBattleStore.getState().enemyHp).toBeLessThan(Math.round(plain * SCRIBE_ATTACK_MULT));
  });

  it('▶ Go! before the word is typed, or the clock running out, gives no bonus', () => {
    vi.useFakeTimers();
    unlockTyping();
    render(<BattleArena />);
    attackAndAnswer();
    expect(screen.getByTestId('type-burst')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(BURST_MS + 100);
    });
    expect(screen.getByTestId('type-burst')).toHaveTextContent(/ink dried/);
    fireEvent.click(screen.getByText('▶ Go!'));
    expect(screen.queryByText(/the word was true/)).toBeNull();
    expect(screen.getByText(/strikes true/)).toBeInTheDocument();
  });

  it(`a block followed by its word adds ${SCRIBE_BLOCK_CHARGE} ◆ at once`, () => {
    unlockTyping();
    render(<BattleArena />);
    // Guard → wrong → the enemy attacks → a right defend answer.
    fireEvent.click(screen.getByText('Guard'));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('▶ Go!'));
    fireEvent.click(screen.getByText(/tap to continue/));
    fireEvent.click(screen.getByText('4'));
    const charge = useBattleStore.getState().charge;
    expect(screen.getByTestId('type-burst')).toBeInTheDocument();
    typeBurstWord();
    expect(useBattleStore.getState().charge).toBe(charge + SCRIBE_BLOCK_CHARGE);
    fireEvent.click(screen.getByText('▶ Go!'));
    expect(screen.getByText(/Count Bat attacks/)).toBeInTheDocument();
    expect(useBattleStore.getState().charge).toBe(charge + SCRIBE_BLOCK_CHARGE);
  });

  it('with the home-row hold on, the burst asks for the other hand too', () => {
    unlockTyping(true);
    render(<BattleArena />);
    attackAndAnswer();
    const word = screen.getByLabelText(/^Type: /).getAttribute('aria-label')!.slice('Type: '.length);
    const first = charKey(word[0])!.key.code;
    fireEvent.keyDown(window, { code: first, key: word[0] });
    expect(screen.getByTestId('type-burst')).toHaveTextContent(/Other hand home/);
  });
});
