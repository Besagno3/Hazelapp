import { supabase } from './supabase';
import { errorMessage } from './errors';
import { readLocalProfile } from './profile';
import { saveKey } from './save';
import { calcAge, clampLevel, MAX_PLAYER_AGE, skillLevelFor } from './age';
import { XP_PER_CORRECT } from './level';
import { xpBonusPerCorrect } from './powerups';
import { kidIcon, MAX_KID_NAME } from '../content/family';
import type { Kid, PowerUps, QuestionSeat, SkillLevels, Topic } from '../types';

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
 * A sibling earns XP as themselves (the owner's call, 2026-10-22: their own
 * PIN first, `PlayerTwoPicker`; `lib/kidXp.ts` writes it), at their own XP a
 * right answer — their 📖 Scholar power-ups in — and only once their world is
 * open (XP starts in the world, #122). Nothing else of theirs moves: no
 * question levels, no Library. A guest has no player, so earns nothing.
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
      /** Their power-ups (the 📖 Scholar bonus on the XP they earn), read with their levels. */
      powerUps: PowerUps;
      /** Their world is open, so they earn XP (#122) — read from their save. */
      worldOpen: boolean;
    }
  | { kind: 'guest'; name: string; pace: GuestPace };

/** One side of a two-player game: who, the questions they get, and the XP a right answer pays them. */
export interface Seat extends QuestionSeat {
  name: string;
  icon: string;
  /** XP a right answer pays (`seatXpPerRight`); 0 for a guest, or a kid whose world isn't open yet. */
  xpPerRight: number;
  /** A family kid whose world is open — the one thing between them and XP (a guest: false). */
  worldOpen: boolean;
}

/** XP a right answer pays a family kid: `XP_PER_CORRECT` and their Scholar bonus, once their world is open (#122). */
export function seatXpPerRight(powerUps: PowerUps, worldOpen: boolean): number {
  return worldOpen ? XP_PER_CORRECT + xpBonusPerCorrect(powerUps) : 0;
}

/** A guest's name as typed, tidied: trimmed, at most `MAX_KID_NAME` long, `GUEST_NAME` when empty. */
export function guestName(typed: string): string {
  return typed.trim().slice(0, MAX_KID_NAME).trim() || GUEST_NAME;
}

/** A player's name for the screen (a kid from before parent accounts has none). */
export function kidName(kid: Pick<Kid, 'name'> | undefined, fallback: string): string {
  return kid?.name?.trim() || fallback;
}

/**
 * The kid playing's seat for `topic`: their own age and level (`kid` null —
 * the kid playing), and their XP a right answer once `worldOpen`.
 */
export function playerOneSeat(
  kid: Pick<Kid, 'name' | 'icon'> | undefined,
  profile: { birthYear: number; birthMonth: number; skillLevels: SkillLevels; powerUps?: PowerUps } | null,
  age: number,
  topic: Topic,
  worldOpen = false,
): Seat {
  return {
    name: kidName(kid, 'Player 1'),
    icon: kidIcon(kid?.icon ?? null),
    kid: null,
    age,
    skillLevel: skillLevelFor(profile?.skillLevels ?? {}, topic, age),
    xpPerRight: seatXpPerRight(profile?.powerUps ?? {}, worldOpen),
    worldOpen,
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
      xpPerRight: 0,
      worldOpen: false,
    };
  }
  const age = Math.min(MAX_PLAYER_AGE, calcAge(two.birthYear, two.birthMonth));
  return {
    name: two.name,
    icon: kidIcon(two.icon),
    kid: two.id,
    age,
    skillLevel: skillLevelFor(two.skillLevels, topic, age),
    xpPerRight: seatXpPerRight(two.powerUps, two.worldOpen),
    worldOpen: two.worldOpen,
  };
}

/** Player 2's name and emoji, for the screen. */
export function playerTwoLook(two: PlayerTwo): { name: string; icon: string } {
  return two.kind === 'guest' ? { name: guestName(two.name), icon: GUEST_ICON } : { name: two.name, icon: kidIcon(two.icon) };
}

/** The family's kids who can be Player 2: everyone but the kid playing. */
export function playerTwoChoices(kids: Kid[], activeKidId: string | null): Kid[] {
  return kids.filter((k) => k.id !== activeKidId);
}

/** Only finite numbers survive from a `skill_levels` / `power_ups` JSON. */
function numbersFrom<T>(raw: unknown): T {
  if (!raw || typeof raw !== 'object') return {} as T;
  const out: Record<string, number> = {};
  for (const [key, n] of Object.entries(raw)) if (typeof n === 'number' && Number.isFinite(n)) out[key] = n;
  return out as T;
}

/** How long picking a kid as Player 2 waits for each read before using this device's copy. */
export const LEVELS_WAIT_MS = 3000;

/** What playing as Player 2 needs of a family kid: their levels, their power-ups, and whether their world is open. */
export interface KidPlay {
  skillLevels: SkillLevels;
  powerUps: PowerUps;
  worldOpen: boolean;
}

/** `read` within `LEVELS_WAIT_MS`, its row (null: none) — or it throws. */
async function within(read: PromiseLike<{ data: unknown; error: unknown }>): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const slow = new Promise<never>((_, fail) => {
      timer = setTimeout(() => fail(new Error('took too long')), LEVELS_WAIT_MS);
    });
    const { data, error } = await Promise.race([read, slow]);
    if (error) throw error;
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** This device's copy of a kid's save says their world is open. */
function localWorldOpen(kidId: string): boolean {
  try {
    const raw = localStorage.getItem(saveKey(kidId));
    return raw ? (JSON.parse(raw) as { worldUnlocked?: unknown }).worldUnlocked === true : false;
  } catch {
    return false;
  }
}

/**
 * What a family kid needs to play as Player 2, read once they're picked:
 * their `profiles` row's levels and power-ups, and their save's
 * `worldUnlocked` (both read only — their XP is `lib/kidXp.ts`'s). A read
 * that fails or takes past `LEVELS_WAIT_MS` falls back to this device's copy
 * (else none: each topic starts where a player of their age would, no
 * power-ups, the world closed — so no XP rather than XP they hadn't earned).
 * Never fails.
 */
export async function readKidPlay(kidId: string): Promise<KidPlay> {
  const [profile, world] = await Promise.all([
    within(supabase.from('profiles').select('skill_levels, power_ups').eq('id', kidId).maybeSingle())
      .then((data) => {
        const row = data as { skill_levels: unknown; power_ups: unknown } | null;
        return row ? { skillLevels: numbersFrom<SkillLevels>(row.skill_levels), powerUps: numbersFrom<PowerUps>(row.power_ups) } : null;
      })
      .catch((e) => {
        console.warn("Player 2's levels didn't load — using this device's copy:", errorMessage(e));
        return null;
      }),
    within(supabase.from('saves').select('world:data->worldUnlocked').eq('profile_id', kidId).maybeSingle())
      .then((data) => (data ? (data as { world: unknown }).world === true : null))
      .catch((e) => {
        console.warn("Player 2's save didn't load — using this device's copy:", errorMessage(e));
        return null;
      }),
  ]);
  const local = profile ? null : readLocalProfile(kidId);
  return {
    skillLevels: profile?.skillLevels ?? numbersFrom<SkillLevels>(local?.skillLevels),
    powerUps: profile?.powerUps ?? numbersFrom<PowerUps>(local?.powerUps),
    worldOpen: world ?? localWorldOpen(kidId),
  };
}
