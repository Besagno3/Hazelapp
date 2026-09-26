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
