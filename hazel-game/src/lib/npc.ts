import type { NPC, Topic } from '../types';
import { ageToStartLevel, clampLevel } from './age';

const TOPICS: Topic[] = ['math', 'science', 'engineering', 'creativity'];

/** Name + sprite archetypes for randomly-generated NPCs. */
const ARCHETYPES: { name: string; sprite: string }[] = [
  { name: 'Count Calculus', sprite: '🧙' },
  { name: 'Dr. Molecule', sprite: '🤖' },
  { name: 'Gear Master', sprite: '⚙️' },
  { name: 'Muse Maxine', sprite: '🧚' },
  { name: 'Pixel Witch', sprite: '🦹' },
  { name: 'Sir Sumsalot', sprite: '🐉' },
  { name: 'Professor Spark', sprite: '👾' },
  { name: 'Captain Cosmos', sprite: '🚀' },
  { name: 'Lady Logic', sprite: '🦊' },
  { name: 'Brainiac Bob', sprite: '🧠' },
];

/** Random integer in [min, max], inclusive. */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Builds a fresh set of random NPCs for the world map. Each NPC's level is
 * randomised around the player's age-appropriate level; HP scales with level.
 */
export function generateNpcs(age: number, count = 4): NPC[] {
  const base = ageToStartLevel(age);
  return shuffle(ARCHETYPES)
    .slice(0, count)
    .map((a, i) => {
      const level = clampLevel(base + randInt(-1, 2));
      return {
        id: `npc-${Date.now()}-${i}`,
        name: a.name,
        sprite: a.sprite,
        topic: TOPICS[randInt(0, TOPICS.length - 1)],
        level,
        maxHp: 60 + level * 12,
      };
    });
}
