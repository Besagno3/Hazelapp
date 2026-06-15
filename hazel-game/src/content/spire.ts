import type { Topic } from '../types';
import { VILLAIN_NAME } from './story';

/**
 * The Crystal Spire endgame (#55): a multi-floor question climb, unlocked only
 * once all four crystals are restored. Each floor is harder than the last
 * (higher level, escalating taunts) and draws from different question topics;
 * the top floor is the final boss — Umbra, the Forgotten One, the hidden evil
 * who fed the world to the fog and pulls the strings from the Spire's peak.
 *
 * Kid-friendly fail rule: the hero carries `SPIRE_LIVES` candle-lights; each
 * wrong answer snuffs one. Run out and the Spire gently casts you back to
 * Lumina Field, fully healed — climb again any time, no penalty.
 */

export interface SpireFloor {
  /** Floor title shown on the landing. */
  name: string;
  /** Umbra's taunt as the floor begins. */
  taunt: string;
  /** Question topics this floor draws from (mixed + shuffled). */
  topics: Topic[];
  /** Question level = base (age) + this bonus, clamped 1-10. */
  levelBonus: number;
  /** Questions that must be cleared to ascend. */
  questions: number;
  isBoss?: boolean;
}

/** Candle-lights (wrong answers allowed) for the whole climb. */
export const SPIRE_LIVES = 4;

/** XP awarded for clearing the Spire and beating Umbra. */
export const SPIRE_CLEAR_XP = 600;

/** Spoken before the first floor (one box at a time). */
export const SPIRE_INTRO: string[] = [
  'The Spire door swings shut behind you. The dark at the top breathes out, slow and patient.',
  `"Welcome, little spark," says ${VILLAIN_NAME}. "Four crystals bought you these stairs. Every step costs an answer. Climb — and let us see how much you truly remember."`,
];

export const SPIRE_FLOORS: SpireFloor[] = [
  {
    name: 'Floor 1 — The Whispering Stair',
    taunt: '"This first stair is made of old, forgotten things. Name them, if you can."',
    topics: ['history'],
    levelBonus: 1,
    questions: 3,
  },
  {
    name: 'Floor 2 — The Overgrown Landing',
    taunt: '"Vines and creatures I let the fog eat. You think you know them better than I forgot them?"',
    topics: ['nature'],
    levelBonus: 2,
    questions: 3,
  },
  {
    name: 'Floor 3 — The Star Gallery',
    taunt: '"Up here I smothered the very stars. Reach them — if your little mind can stretch that far."',
    topics: ['space'],
    levelBonus: 3,
    questions: 4,
  },
  {
    name: 'Floor 4 — The Engine Vault',
    taunt: '"Numbers, gears, wild ideas — I jammed them all. Untangle my locks. They get nastier from here."',
    topics: ['math', 'engineering', 'creativity'],
    levelBonus: 4,
    questions: 4,
  },
  {
    name: 'Floor 5 — The Forgotten Throne',
    taunt: `"No more stairs, spark. Only me. I am ${VILLAIN_NAME} — and I will out-last every answer you have left."`,
    topics: ['math', 'science', 'engineering', 'creativity', 'nature', 'space', 'history'],
    levelBonus: 5,
    questions: 5,
    isBoss: true,
  },
];

/** Umbra's last words when the final floor is cleared (before the cutscene). */
export const SPIRE_BOSS_DEFEAT =
  '"Out-remembered… by a child… perhaps being remembered is not so terrible after all…"';
