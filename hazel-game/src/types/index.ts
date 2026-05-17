export type Topic = 'math' | 'science' | 'engineering' | 'creativity';

export interface Question {
  id: string;
  topic: Topic;
  level: number;
  text: string;
  options: string[];
  correctIndex: number;
}

export interface QuizRound {
  topic: Topic;
  questions: Question[];
  score: number;
  passed: boolean;
}

export type FightStyle = 'aggressive' | 'defensive' | 'balanced';

export interface Avatar {
  id: string;
  name: string;
  sprite: string;
  fightStyle: FightStyle;
  hp: number;
  maxHp: number;
}

export interface NPC {
  id: string;
  name: string;
  sprite: string;
  level: number;
  topic: Topic;
  hp: number;
  maxHp: number;
  questions: Question[];
}

export interface BattleAction {
  type: 'attack' | 'defense';
  questionsAnswered: number;
  correctAnswers: number;
  damage: number;
}

export interface BattleState {
  npc: NPC | null;
  playerHp: number;
  npcHp: number;
  round: number;
  log: BattleAction[];
  result: 'win' | 'lose' | null;
}

export type GamePhase = 'auth' | 'topic-select' | 'quiz' | 'world' | 'battle';

export interface GameProgress {
  completedRounds: QuizRound[];
  worldUnlocked: boolean;
  currentTopic: Topic | null;
}

/** Per-topic skill level (integers, see lib/age.ts MIN/MAX_SKILL_LEVEL). */
export type SkillLevels = Partial<Record<Topic, number>>;

/** A player's Supabase profile (see supabase/migrations/0001_create_profiles.sql). */
export interface Profile {
  id: string;
  birthYear: number;
  birthMonth: number;
  skillLevels: SkillLevels;
}
