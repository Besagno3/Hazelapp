import { supabase } from './supabase';
import { errorMessage } from './errors';
import { readLocalProfile } from './profile';
import { calcAge, clampLevel, MAX_PLAYER_AGE, skillLevelFor } from './age';
import { kidIcon, MAX_KID_NAME } from '../content/family';
import type { Kid, QuestionSeat, SkillLevels, Topic } from '../types';

/**
 * Player 2 (#177): who plays beside the kid playing — in a 🆚 Quiz Duel, and in
 * co-op battles. Either another kid of the family, who plays at their own age
 * and level (their questions are asked for under their own id, so the server
 * pitches them to their age and keeps their seen questions their own), or a
 * guest — a friend or a grown-up with no player of their own. The server
 * works a kid's age out from their birth date and never takes an age from the
 * app (B8), so a guest's questions are written for the kid playing's age; the
 * guest picks how tricky, against the kid playing's own level.
 *
 * Nothing about Player 2 is saved: no XP, no levels, nothing written to a
 * sibling's profile — the kid playing's game is the one that moves.
 */

/** How tricky a guest's questions are, against the kid playing's level. */
export type GuestPace = 'easier' | 'same' | 'harder';

/** Levels a guest's pace moves from the kid playing's own. */
export const GUEST_PACE_OFFSET: Record<GuestPace, number> = { easier: -2, same: 0, harder: 2 };

/** The paces in the order they're offered. */
export const GUEST_PACES: GuestPace[] = ['easier', 'same', 'harder'];

/** A guest's emoji, beside their name. */
export const GUEST_ICON = '🙂';

/** A guest with no name typed. */
export const GUEST_NAME = 'Guest';

export type PlayerTwo =
  | {
      kind: 'kid';
      id: string;
      name: string;
      icon: string | null;
      birthYear: number;
      birthMonth: number;
      /** Their question level per topic, read once they're picked (none read: their age's start). */
      skillLevels: SkillLevels;
    }
  | { kind: 'guest'; name: string; pace: GuestPace };

/** One side of a two-player game: who, and the questions they get. */
export interface Seat extends QuestionSeat {
  name: string;
  icon: string;
}

/** A guest's name as typed, tidied: trimmed, at most `MAX_KID_NAME` long, `GUEST_NAME` when empty. */
export function guestName(typed: string): string {
  return typed.trim().slice(0, MAX_KID_NAME).trim() || GUEST_NAME;
}

/** A player's name for the screen (a kid from before parent accounts has none). */
export function kidName(kid: Pick<Kid, 'name'> | undefined, fallback: string): string {
  return kid?.name?.trim() || fallback;
}

/** The kid playing's seat for `topic`: their own age and level (`kid` null — the kid playing). */
export function playerOneSeat(
  kid: Pick<Kid, 'name' | 'icon'> | undefined,
  profile: { birthYear: number; birthMonth: number; skillLevels: SkillLevels } | null,
  age: number,
  topic: Topic,
): Seat {
  return {
    name: kidName(kid, 'Player 1'),
    icon: kidIcon(kid?.icon ?? null),
    kid: null,
    age,
    skillLevel: skillLevelFor(profile?.skillLevels ?? {}, topic, age),
  };
}

/**
 * Player 2's seat for `topic`: a kid at their own age and level, asked for
 * under their own id; a guest under the kid playing's (`one`), at
 * `one`'s level moved by their pace.
 */
export function playerTwoSeat(two: PlayerTwo, one: Seat, topic: Topic): Seat {
  if (two.kind === 'guest') {
    return {
      name: guestName(two.name),
      icon: GUEST_ICON,
      kid: one.kid,
      age: one.age,
      skillLevel: clampLevel(one.skillLevel + GUEST_PACE_OFFSET[two.pace]),
    };
  }
  const age = Math.min(MAX_PLAYER_AGE, calcAge(two.birthYear, two.birthMonth));
  return { name: two.name, icon: kidIcon(two.icon), kid: two.id, age, skillLevel: skillLevelFor(two.skillLevels, topic, age) };
}

/** Player 2's name and emoji, for the screen. */
export function playerTwoLook(two: PlayerTwo): { name: string; icon: string } {
  return two.kind === 'guest' ? { name: guestName(two.name), icon: GUEST_ICON } : { name: two.name, icon: kidIcon(two.icon) };
}

/** The family's kids who can be Player 2: everyone but the kid playing. */
export function playerTwoChoices(kids: Kid[], activeKidId: string | null): Kid[] {
  return kids.filter((k) => k.id !== activeKidId);
}

/** Only finite levels survive from a `skill_levels` JSON. */
function levelsFrom(raw: unknown): SkillLevels {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [topic, level] of Object.entries(raw)) if (typeof level === 'number' && Number.isFinite(level)) out[topic] = level;
  return out as SkillLevels;
}

/** How long picking a kid as Player 2 waits for their levels before using this device's copy. */
export const LEVELS_WAIT_MS = 3000;

/**
 * A family kid's question levels, to play as Player 2 (read only — nothing of
 * theirs is ever written). From their `profiles` row; when that can't be read
 * within `LEVELS_WAIT_MS`, this device's copy of their profile; else none, so
 * each topic starts where a player of their age would. Never fails.
 */
export async function readKidLevels(kidId: string): Promise<SkillLevels> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = supabase.from('profiles').select('skill_levels').eq('id', kidId).maybeSingle();
    const slow = new Promise<never>((_, fail) => {
      timer = setTimeout(() => fail(new Error('took too long')), LEVELS_WAIT_MS);
    });
    const { data, error } = await Promise.race([read, slow]);
    if (error) throw error;
    if (data) return levelsFrom((data as { skill_levels: unknown }).skill_levels);
  } catch (e) {
    console.warn("Player 2's levels didn't load — using this device's copy:", errorMessage(e));
  } finally {
    clearTimeout(timer);
  }
  return levelsFrom(readLocalProfile(kidId)?.skillLevels);
}
