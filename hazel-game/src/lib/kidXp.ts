import { supabase } from './supabase';
import { errorMessage } from './errors';
import { gainXp, levelState } from './level';
import { readLocalProfile, writeLocalProfile } from './profile';
import { nextStreak, todayIso } from './streak';
import { addDayXp, flushPlayDays, notePlayDay } from './playDays';

/**
 * XP for a family kid who isn't the one playing (the owner's call,
 * 2026-10-22): a sibling who played as Player 2 — in a 🆚 Quiz Duel or a
 * co-op battle — earns XP as themselves. It goes straight to their `profiles`
 * row (XP, level and streak are the kid's own play, so no 👪 window is needed;
 * RLS keeps it to the family's own kids): a read, then an update guarded on the
 * XP it read, so a write from their own device in between is never written
 * over (read again and try again, `GUARD_TRIES`). One kid's writes go one at a
 * time, and each read or update gives up after `WRITE_TIMEOUT_MS`; an update
 * whose answer was lost is checked before it's kept owed (it may have landed).
 * Once saved, the day counts as played for them too, with its XP (their
 * streak, 📈 Progress's day — `addDayXp`, sent at once: nothing else sends
 * another kid's day from here). This device's copy of their profile moves
 * with the row, so it never looks behind it.
 *
 * Nothing is lost to a hung connection or a closed tab (#188 review): while
 * it's being written the gift is kept as *sending* (`hazel-owed-xp-sending-
 * <kid>`, with when); what can't be written is owed (`hazel-owed-xp-<kid>`).
 * Both are paid with the next XP given them here or when that kid's profile
 * next loads here (`takeOwedXp`, from `profileStore`'s `payOwedXp`) — a
 * sending gift only once it's `SENDING_STALE_MS` old, so one still being
 * written is never paid twice.
 */

/** How many times a write is tried when the row changed between the read and the update. */
export const GUARD_TRIES = 3;

/** How long one read or update of a sibling's row may take before it counts as failed. */
export const WRITE_TIMEOUT_MS = 10_000;

/** A gift still marked as sending after this long was left by a tab that closed or stuck mid-write: it's owed. */
export const SENDING_STALE_MS = 2 * 60_000;

/** How a gift of XP went: written (their level after it, and if it went up), or owed on this device. */
export type KidXpResult = { saved: true; level: number; leveledUp: boolean } | { saved: false };

const OWED_PREFIX = 'hazel-owed-xp-';
const SENDING_PREFIX = 'hazel-owed-xp-sending-';

export function owedXpKey(kidId: string): string {
  return `${OWED_PREFIX}${kidId}`;
}

export function sendingXpKey(kidId: string): string {
  return `${SENDING_PREFIX}${kidId}`;
}

/** XP owed to a kid on this device (0: none) — not counting a gift still being written. */
export function owedXp(kidId: string): number {
  try {
    const n = Number(localStorage.getItem(owedXpKey(kidId)));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/** One gift being written: how much, and since when. */
interface Sending {
  xp: number;
  at: number;
}

function readSending(kidId: string): Sending[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(sendingXpKey(kidId)) ?? '[]');
    if (!Array.isArray(kept)) return [];
    return kept.filter((g): g is Sending => typeof g === 'object' && g !== null && Number.isInteger(g.xp) && g.xp > 0 && Number.isFinite(g.at));
  } catch {
    return [];
  }
}

function writeSending(kidId: string, list: Sending[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(sendingXpKey(kidId));
    else localStorage.setItem(sendingXpKey(kidId), JSON.stringify(list));
  } catch {
    // Storage blocked: the gift lives in this tab only.
  }
}

/**
 * XP owed to a kid on this device, taken: it's theirs to add now — what
 * couldn't be written, and any gift a closed or stuck tab left sending.
 */
export function takeOwedXp(kidId: string, now = Date.now()): number {
  const owed = owedXp(kidId);
  try {
    localStorage.removeItem(owedXpKey(kidId));
  } catch {
    // Storage blocked: nothing was kept to take.
  }
  const sending = readSending(kidId);
  const stale = sending.filter((g) => now - g.at >= SENDING_STALE_MS);
  if (stale.length > 0) writeSending(kidId, sending.filter((g) => now - g.at < SENDING_STALE_MS));
  return owed + stale.reduce((sum, g) => sum + g.xp, 0);
}

/** A kid's XP kept on this device goes (the kid removed, the account closed). */
export function forgetOwedXp(kidId: string): void {
  try {
    localStorage.removeItem(owedXpKey(kidId));
    localStorage.removeItem(sendingXpKey(kidId));
  } catch {
    // Storage unavailable — nothing was kept.
  }
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

type Got = { data: unknown; error: unknown };

/** A read or update (built with the signal that calls it off) within `WRITE_TIMEOUT_MS`, else a failure. */
async function timed(build: (signal: AbortSignal) => PromiseLike<Got>): Promise<Got> {
  const stop = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Got>((resolve) => {
    timer = setTimeout(() => {
      stop.abort();
      resolve({ data: null, error: new Error(`no answer in ${WRITE_TIMEOUT_MS / 1000} s`) });
    }, WRITE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([build(stop.signal), late]);
  } finally {
    clearTimeout(timer);
  }
}

function readXp(kidId: string): Promise<Got> {
  return timed((signal) =>
    supabase
      .from('profiles')
      .select('xp, level, level_xp, current_streak, longest_streak, last_played_on')
      .eq('id', kidId)
      .abortSignal(signal)
      .maybeSingle(),
  );
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

/** The XP part of a kid's row, as this device last read or wrote it. */
export type RowXp = Pick<XpRow, 'xp' | 'level' | 'level_xp'>;

/**
 * Add `amount` XP to a kid's row, never writing over a write it didn't read
 * (#188, #190): an update guarded on the XP the row holds — `known`, as this
 * device last read or wrote it, else read first — and, when it changed in
 * between (another device's write), read again and added on top, up to
 * `GUARD_TRIES`. Each read and update gives up after `WRITE_TIMEOUT_MS`; an
 * update whose answer was lost is read back (it may have landed). `more`
 * adds columns worked out from the row read (a sibling's streak); with it,
 * the row is always read first. Resolves with the row it went onto and what
 * it is now; rejects when it couldn't be written.
 */
export async function addRowXp(
  kidId: string,
  amount: number,
  { known = null, more }: { known?: RowXp | null; more?: (row: XpRow) => Partial<XpRow> } = {},
): Promise<{ before: RowXp; now: { xp: number; level: number; level_xp: number } }> {
  let row: XpRow | null = known && !more ? { ...known, current_streak: null, longest_streak: null, last_played_on: null } : null;
  for (let i = 0; i < GUARD_TRIES; i++) {
    if (!row) {
      const read = await readXp(kidId);
      if (read.error) throw read.error;
      if (!read.data) throw new Error('no profile row for this player');
      row = read.data as XpRow;
    }
    const base = row;
    const after = gainXp(levelState({ xp: base.xp ?? 0, level: base.level ?? undefined, levelXp: base.level_xp ?? undefined }), amount);
    const xp = (base.xp ?? 0) + amount;
    const { data, error } = await timed((signal) => {
      const update = supabase
        .from('profiles')
        .update({ xp, level: after.level, level_xp: after.levelXp, ...more?.(base), updated_at: new Date().toISOString() })
        .eq('id', kidId);
      // Only over the XP just read: a write from another device in between means read again.
      return (base.xp === null ? update.is('xp', null) : update.eq('xp', base.xp)).select('id').abortSignal(signal);
    });
    let landed = !error && Array.isArray(data) && data.length > 0;
    if (error) {
      // The answer was lost, not necessarily the write: look before calling it failed (it'd be paid twice).
      const again = await readXp(kidId);
      landed = !again.error && (again.data as XpRow | null)?.xp === xp;
      if (!landed) throw error;
    }
    if (landed) return { before: { xp: base.xp, level: base.level, level_xp: base.level_xp }, now: { xp, level: after.level, level_xp: after.levelXp } };
    row = null; // changed since it was read: read it again
  }
  throw new Error('the XP kept changing');
}

async function write(kidId: string, gift: number): Promise<KidXpResult> {
  const amount = gift + takeOwedXp(kidId);
  const today = todayIso();
  // Kept as sending first: a closed tab or a hung connection loses nothing.
  const mine: Sending = { xp: amount, at: Date.now() };
  writeSending(kidId, [...readSending(kidId), mine]);
  const unmark = () => writeSending(kidId, readSending(kidId).filter((g) => g.at !== mine.at || g.xp !== mine.xp));
  try {
    const { before, now } = await addRowXp(kidId, amount, {
      more: (row) => {
        const currentStreak = nextStreak(row.current_streak ?? 0, row.last_played_on, today);
        return { current_streak: currentStreak, longest_streak: Math.max(row.longest_streak ?? 0, currentStreak), last_played_on: today };
      },
    });
    unmark();
    moveLocalCopy(kidId, amount, today);
    void addDayXp(kidId, today, amount, { played: true }).then(() => flushPlayDays(kidId, { now: true }));
    const was = levelState({ xp: before.xp ?? 0, level: before.level ?? undefined, levelXp: before.level_xp ?? undefined }).level;
    return { saved: true, level: now.level, leveledUp: now.level > was };
  } catch (e) {
    console.warn(`XP for player ${kidId} couldn't be saved — kept on this device for next time:`, errorMessage(e));
    unmark();
    owe(kidId, amount);
    // They played today all the same; the XP is recorded when it's paid.
    void notePlayDay(kidId, today);
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

/** A family kid whose save couldn't be read earns no XP (it may not be open, #122) — said instead of a number. */
export function xpUnknownLine(name: string): string {
  return `${name}'s XP couldn't be counted this time.`;
}

/** A family kid whose world isn't open yet earns no XP (#122) — said instead of a number. */
export function xpStartsLine(name: string): string {
  return `XP starts for ${name} once ${name} opens the world.`;
}
