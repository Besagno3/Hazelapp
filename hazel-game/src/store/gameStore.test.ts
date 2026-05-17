import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { ROUNDS_TO_UNLOCK } from '../lib/utils';
import type { NPC, QuizRound } from '../types';

const passedRound: QuizRound = { topic: 'math', questions: [], score: 1, passed: true };
const failedRound: QuizRound = { topic: 'math', questions: [], score: 0.2, passed: false };
const npc: NPC = { id: 'n1', name: 'Test', sprite: '🤖', level: 1, topic: 'math', maxHp: 80 };

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('setTopic updates the current topic', () => {
    useGameStore.getState().setTopic('science');
    expect(useGameStore.getState().progress.currentTopic).toBe('science');
  });

  it('completeRound appends the round', () => {
    useGameStore.getState().completeRound(passedRound);
    expect(useGameStore.getState().progress.completedRounds).toHaveLength(1);
  });

  it('unlocks the world after enough passed rounds', () => {
    for (let i = 0; i < ROUNDS_TO_UNLOCK; i++) {
      useGameStore.getState().completeRound(passedRound);
    }
    expect(useGameStore.getState().progress.worldUnlocked).toBe(true);
  });

  it('does not count failed rounds toward the unlock', () => {
    for (let i = 0; i < ROUNDS_TO_UNLOCK; i++) {
      useGameStore.getState().completeRound(failedRound);
    }
    expect(useGameStore.getState().progress.worldUnlocked).toBe(false);
  });

  it('startBattle enters the battle phase with the NPC at full HP', () => {
    useGameStore.getState().startBattle(npc, 100);
    const s = useGameStore.getState();
    expect(s.phase).toBe('battle');
    expect(s.battle.npcHp).toBe(80);
    expect(s.battle.playerHp).toBe(100);
  });

  it('endBattle records the result and returns to the world', () => {
    useGameStore.getState().startBattle(npc, 100);
    useGameStore.getState().endBattle('win');
    const s = useGameStore.getState();
    expect(s.battle.result).toBe('win');
    expect(s.phase).toBe('world');
  });

  it('reset restores defaults', () => {
    useGameStore.getState().setTopic('science');
    useGameStore.getState().completeRound(passedRound);
    useGameStore.getState().reset();
    const s = useGameStore.getState();
    expect(s.phase).toBe('auth');
    expect(s.progress.completedRounds).toHaveLength(0);
    expect(s.avatar).toBeNull();
  });
});
