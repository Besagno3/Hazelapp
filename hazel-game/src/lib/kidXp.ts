import { supabase } from './supabase';
import { errorMessage } from './errors';
import { gainXp, levelState } from './level';
import { readLocalProfile, writeLocalProfile } from './profile';
import { nextStreak, todayIso } from './streak';
import { addDayXp, notePlayDay } from './playDays';

/**
 * XP for a family kid who isn't the one playing (the owner's call,
 * 2026-10-22): a sibling who played as Player 2 — in a 🆚 Quiz Duel or a
 * co-op battle — earns XP as themselves. It goes straight to their `profiles`
 * row (XP, level and streak are the kid's own play, so no 👪 window is needed;
 * RLS keeps it to the family's own kids): a read, then an update guarded on the
 * XP it read, so a write from their own device in between is never written
 * over (read again and try again, `GUARD_TRIES`). One kid's writes go one at a
 * time. The day counts as played for them too (their streak, 📈 Progress's
 * week — `notePlayDay`), and its XP goes into their day's record (`addDayXp`,
 * once saved — XP owed is recorded when `addXp` pays it). This device's copy
 * of their profile moves with the row, so it never looks behind it.
 *
 * What can't be written (offline, a read that fails) is owed on this device
 * (`hazel-owed-xp-<kid>`): added to the next XP given them here, or paid when
 * that kid's profile next loads here (`takeOwedXp`, from
 * `profileStore.loadProfile`).
 */

/** How many times a write is tried when the row changed between the read and the update. */
export const GUARD_TRIES = 3;

/** How a gift of XP went: written (their level after it, and if it went up), or owed on this device. */
export type KidXpResult = { saved: true; level: number; leveledUp: boolean } | { saved: false };

const OWED_PREFIX = 'hazel-owed-xp-';

export function owedXpKey(kidId: string): string {
  return `${OWED_PREFIX}${kidId}`;
}

/** XP owed to a kid on this device (0: none). */
export function owedXp(kidId: string): number {
  try {
    const n = Number(localStorage.getItem(owedXpKey(kidId)));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/** XP owed to a kid on this device, taken: it's theirs to add now. */
export function takeOwedXp(kidId: string): number {
  const owed = owedXp(kidId);
  try {
    localStorage.removeItem(owedXpKey(kidId));
  } catch {
    // Storage blocked: nothing was kept to take.
  }
  return owed;
}

function owe(kidId: string, amount: number): void {
  try {
    localStorage.setItem(owedXpKey(kidId), String(owedXp(kidId) + amount));
  } catch {
    // Storage blocked: this gift is lost with the tab.
  }
}

interface XpRow {
  xp: number | null;
  level: number | null;
  level_xp: number | null;
  current_streak: number | null;
  longest_streak: number | null;
  last_played_on: string | null;
}

/** One kid's writes, one after another. */
const chains = new Map<string, Promise<unknown>>();

/**
 * Give `kidId` `amount` XP (and today played). Resolves with how it went;
 * never rejects. Anything owed to them on this device goes with it.
 */
export function giveKidXp(kidId: string, amount: number): Promise<KidXpResult> {
  const gift = Math.floor(amount);
  if (!(gift > 0)) return Promise.resolve({ saved: false });
  const run = (chains.get(kidId) ?? Promise.resolve()).then(() => write(kidId, gift));
  chains.set(kidId, run);
  return run;
}

async function write(kidId: string, gift: number): Promise<KidXpResult> {
  const amount = gift + takeOwedXp(kidId);
  const today = todayIso();
  void notePlayDay(kidId, today);
  try {
    for (let i = 0; i < GUARD_TRIES; i++) {
      const read = await supabase
        .from('profiles')
        .select('xp, level, level_xp, current_streak, longest_streak, last_played_on')
        .eq('id', kidId)
        .maybeSingle();
      if (read.error) throw read.error;
      if (!read.data) throw new Error('no profile row for this player');
      const row = read.data as XpRow;
      const before = levelState({ xp: row.xp ?? 0, level: row.level ?? undefined, levelXp: row.level_xp ?? undefined });
      const after = gainXp(before, amount);
      const currentStreak = nextStreak(row.current_streak ?? 0, row.last_played_on, today);
      const update = supabase
        .from('profiles')
        .update({
          xp: (row.xp ?? 0) + amount,
          level: after.level,
          level_xp: after.levelXp,
          current_streak: currentStreak,
          longest_streak: Math.max(row.longest_streak ?? 0, currentStreak),
          last_played_on: today,
          updated_at: new Date().toISOString(),
        })
        .eq('id', kidId);
      // Only over the XP just read: a write from their own device in between means read again.
      const { data, error } = await (row.xp === null ? update.is('xp', null) : update.eq('xp', row.xp)).select('id');
      if (error) throw error;
      if (data && data.length > 0) {
        moveLocalCopy(kidId, amount, today);
        void addDayXp(kidId, today, amount, { played: true });
        return { saved: true, level: after.level, leveledUp: after.level > before.level };
      }
    }
    throw new Error('their XP kept changing');
  } catch (e) {
    console.warn(`XP for player ${kidId} couldn't be saved — kept on this device for next time:`, errorMessage(e));
    owe(kidId, amount);
    return { saved: false };
  }
}

/** This device's copy of the kid's profile, moved as the row was (when there is one). */
function moveLocalCopy(kidId: string, amount: number, today: string): void {
  const local = readLocalProfile(kidId);
  if (!local) return;
  const { level, levelXp } = gainXp(levelState(local), amount);
  const currentStreak = nextStreak(local.currentStreak, local.lastPlayedOn, today);
  writeLocalProfile({
    ...local,
    xp: local.xp + amount,
    level,
    levelXp,
    currentStreak,
    longestStreak: Math.max(local.longestStreak, currentStreak),
    lastPlayedOn: today,
  });
}

/** What the screen says about a sibling's XP: on its way, saved (a new level said), or kept for next time. */
export function kidXpWords(name: string, saved: KidXpResult | null): string {
  if (saved === null) return 'Saving…';
  if (!saved.saved) return `It'll be added the next time ${name} plays on this device.`;
  return saved.leveledUp ? `⭐ ${name} reached level ${saved.level}!` : `Saved to ${name}'s game.`;
}

/** A family kid whose world isn't open yet earns no XP (#122) — said instead of a number. */
export function xpStartsLine(name: string): string {
  return `XP starts for ${name} once ${name} opens the world.`;
}
