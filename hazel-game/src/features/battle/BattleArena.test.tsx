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

  it('a land critter keeps its zone\'s backdrop and no boat', () => {
    const { container } = render(<BattleArena />);
    expect(backdrop(container)).toContain('/backgrounds/numbria.png');
    expect(screen.queryByTestId('battle-boat')).toBeNull();
    expect(screen.queryByTestId('battle-boat-front')).toBeNull();
  });
});
