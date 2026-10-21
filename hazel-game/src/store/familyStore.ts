import { create } from 'zustand';
import { forgetStoredSession, supabase } from '../lib/supabase';
import { errorMessage, NETWORK_MESSAGE, OFFLINE_MESSAGE, sessionRanOut } from '../lib/errors';
import { plainErrorOr } from '../lib/familyErrors';
import {
  forgetAllLocks,
  forgetLock,
  functionMissing,
  grownUpLockKey,
  kidLockKey,
  pinLocksFrom,
  pinVerdict,
  type PinLocks,
  type PinVerdict,
} from '../lib/pinLock';
import { CloseAccountFailure, noteAccountClosed, requestCloseAccount } from '../lib/closeAccount';
import { lockGrownUps, noteDeviceSession, openForFirstRun } from '../lib/grownUps';
import { GrownUpsLockedError } from '../lib/grownUpsGate';
import { asGrownUp, resetGrownUps } from './grownUpsStore';
import { saveKey } from '../lib/save';
import { profileKey } from '../lib/profile';
import { forgetPlayDays } from '../lib/playDays';
import { CONSENT_VERSION } from '../content/family';
import { sendFlow } from '../machines/gameFlow';
import { useProfileStore } from './profileStore';
import { useSaveStore } from './saveStore';
import { useFinaleStore } from './finaleStore';
import { useBattleStore } from './battleStore';
import { useAuthStore } from './authStore';
import type { Kid, KidInput } from '../types';

/** A kid's `profiles` row, as the family screens read it (snake_case). */
interface KidRow {
  id: string;
  display_name: string | null;
  icon: string | null;
  has_pin: boolean | null;
  birth_year: number;
  birth_month: number;
}

const KID_COLUMNS = 'id, display_name, icon, has_pin, birth_year, birth_month';

function fromRow(r: KidRow): Kid {
  return {
    id: r.id,
    name: r.display_name,
    icon: r.icon,
    hasPin: r.has_pin === true,
    birthYear: r.birth_year,
    birthMonth: r.birth_month,
  };
}

/** The row's own columns; the PIN goes through `set_kid_pin` (hashed, hidden). */
function toRow(k: KidInput) {
  return {
    display_name: k.name.trim(),
    icon: k.icon,
    birth_year: k.birthYear,
    birth_month: k.birthMonth,
  };
}

/**
 * A Supabase error as a thrown `Error` that keeps its `code`, `details`,
 * `hint` and `status`: a screen shows `friendlyMessage(err)` (the words
 * alone) and logs `errorMessage(err)` (all of it) — #130 S6.
 */
function asError(err: unknown, fallback = "That didn't save — try again."): Error {
  if (err instanceof Error) return err;
  if (typeof err !== 'object' || err === null) return new Error(typeof err === 'string' && err ? err : fallback);
  const o = err as Record<string, unknown>;
  const e = new Error(typeof o.message === 'string' && o.message ? o.message : fallback);
  for (const k of ['code', 'details', 'hint', 'status', 'name'] as const) {
    if (o[k] !== undefined && o[k] !== null) Object.assign(e, { [k]: o[k] });
  }
  return e;
}

/**
 * The family didn't load: plain words for the screen. `App`'s error screen
 * has "Try again" — or, when the sign-in itself ran out (`sessionGone`),
 * "Sign in again", which is what these words then ask for.
 */
export function familyLoadMessage(err: unknown): string {
  const words = plainErrorOr(err, `We couldn't open your family just now. Tap "Try again" — your players and their games are safe.`);
  if (words === OFFLINE_MESSAGE) return `You're offline. Check your internet connection, then tap "Try again".`;
  if (words === NETWORK_MESSAGE) return `We couldn't reach Hazel Quest. Check your internet connection, then tap "Try again".`;
  return words;
}

/**
 * A new player was added, but their PIN didn't save (👪 Grown-ups locked in
 * between and the grown-up chose "Not now", or the connection dropped): the
 * player is listed without one, so the form becomes "Change <name>" and a
 * second try sets the PIN instead of adding the player again
 * (#167 review round 1). `pinError` is why the PIN didn't save.
 */
export class KidAddedWithoutPin extends Error {
  readonly kid: Kid;
  readonly pinError: unknown;
  constructor(kid: Kid, pinError: unknown) {
    super(`kid_added_without_pin: ${kid.name ?? 'the player'} was added, but their PIN didn't save`);
    this.name = 'KidAddedWithoutPin';
    this.kid = kid;
    this.pinError = pinError;
  }
}

/**
 * Set a kid's PIN (the database hashes it and checks the kid is the caller's).
 * A new PIN unlocks a locked one. A grown-up action: asks for the gate if
 * 👪 Grown-ups has locked again (#167).
 */
async function setKidPin(id: string, pin: string): Promise<void> {
  await asGrownUp(async () => {
    const { error } = await supabase.rpc('set_kid_pin', { p_kid: id, p_pin: pin });
    if (error) throw asError(error);
  });
  forgetLock(kidLockKey(id));
}

/** The screens before "Who's playing?" that a family still being set up sees (consent, first kid, a kid's PIN). */
function settingUp(consentAt: string | null, kids: Kid[]): boolean {
  return !consentAt || kids.length === 0 || kidNeedingPin(kids) !== null;
}

/**
 * Try a PIN through the database's count (`try_*`, migration 0022, #124c);
 * before that migration is applied, the old unlimited check (`check_*`) so
 * kids can still get in.
 */
async function tryPin(tryFn: string, checkFn: string, args: Record<string, string>): Promise<PinVerdict> {
  const tried = await supabase.rpc(tryFn, args);
  if (!tried.error) return pinVerdict(tried.data);
  if (!functionMissing(tried.error)) throw asError(tried.error);
  console.warn(`${tryFn} is missing (is migration 0022 applied?) — checking without a limit:`, errorMessage(tried.error));
  const checked = await supabase.rpc(checkFn, args);
  if (checked.error) throw asError(checked.error);
  return pinVerdict(checked.data === true);
}

/** The kid playing in this tab, kept across a reload (not across tabs or sign-outs). */
function activeKey(userId: string): string {
  return `hazel-active-kid-${userId}`;
}

function readActive(userId: string): string | null {
  try {
    return sessionStorage.getItem(activeKey(userId));
  } catch {
    return null;
  }
}

function writeActive(userId: string, kidId: string | null): void {
  try {
    if (kidId) sessionStorage.setItem(activeKey(userId), kidId);
    else sessionStorage.removeItem(activeKey(userId));
  } catch {
    // Private mode — the kid just picks again after a reload.
  }
}

/** This device's copies of the family's games (saves, profiles) and the tab's playing kid go. */
function forgetFamilyHere(userId: string | null, kids: Kid[]): void {
  try {
    for (const k of kids) {
      localStorage.removeItem(saveKey(k.id));
      localStorage.removeItem(profileKey(k.id));
    }
  } catch {
    // Storage unavailable — nothing was kept here.
  }
  // Their unsent days too, from storage and memory (never throws).
  for (const k of kids) forgetPlayDays(k.id);
  if (userId) writeActive(userId, null);
}

/**
 * Sign out on this device, whatever the server says (#124b review round 2).
 * supabase-js asks the server to end the session even for a local sign-out,
 * and when that call fails (offline, a 5xx, a 429) it keeps the session — the
 * screen waiting for the sign-in page would wait for ever. So then the stored
 * session is dropped here and the sign-out asked again: with no session left
 * it needs no server, and tells the app (SIGNED_OUT) as usual. Should even
 * that fail, the stores are cleared by hand.
 */
export async function signOutHere(why: string): Promise<void> {
  const signOut = () =>
    supabase.auth.signOut({ scope: 'local' }).then(
      ({ error }) => error as unknown,
      (err: unknown) => err ?? new Error('sign-out failed'),
    );
  const first = await signOut();
  if (!first) return;
  console.warn(`${why}:`, errorMessage(first));
  forgetStoredSession();
  const again = await signOut();
  if (!again) return;
  console.warn(`${why} (here only):`, errorMessage(again));
  useAuthStore.getState().clearSession();
  useFamilyStore.getState().clear();
  putAwayGame();
}

/**
 * A grown-up's "Sign out" (👪 Grown-ups and the setup screens): 👪 Grown-ups
 * is shut on this sign-in first (#167) — a token outlives its sign-out by up
 * to an hour — then the usual sign-out.
 */
export async function signOutGrownUp(): Promise<void> {
  // Never held up by it: a call that hangs gives way after a moment (the window runs out anyway).
  await Promise.race([lockGrownUps(), new Promise((done) => setTimeout(done, LOCK_BEFORE_SIGN_OUT_MS))]);
  await supabase.auth.signOut();
}

/** How long a grown-up's Sign out waits for 👪 Grown-ups to be shut before going on regardless. */
export const LOCK_BEFORE_SIGN_OUT_MS = 2_000;

/**
 * Sign out on this device only — what a dead sign-in needs; the app then
 * shows the sign-in page. Never stuck on the server's answer (`signOutHere`).
 */
export async function signInAgain(): Promise<void> {
  await signOutHere('Signing out to sign in again');
}

/** Put away the game in progress: profile, save, battle, flow. */
export function putAwayGame(): void {
  useProfileStore.getState().clearProfile();
  useSaveStore.getState().clear();
  useBattleStore.getState().reset();
  useFinaleStore.getState().reset();
  sendFlow({ type: 'RESET' });
}

interface FamilyStore {
  /** The grown-up's login this family was loaded for. */
  userId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  /** The family didn't load because the sign-in itself ran out: "Sign in again", not "Try again". */
  sessionGone: boolean;
  /** When the grown-up agreed to the privacy notice (null = not yet). */
  consentAt: string | null;
  /** The grown-up has their own PIN for 👪 Grown-ups (their password works too). */
  hasParentPin: boolean;
  kids: Kid[];
  /** The kid playing now (null = "Who's playing?"). */
  activeKidId: string | null;
  /** The Grown-ups area is open (from "Who's playing?"). */
  grownUpsOpen: boolean;
  /**
   * A player just added whose PIN didn't save (`KidAddedWithoutPin`): the
   * setup page says why it's asking for their PIN (#167 review round 2).
   */
  pinNotSavedFor: string | null;
  /**
   * The page was opened with `?review` (the link in a review alert, #147):
   * open 👪 Grown-ups, and once it's unlocked, 🛡️ Question review.
   */
  reviewRequested: boolean;
  /** Load the grown-up's consent and kids after sign-in. */
  load: (userId: string) => Promise<void>;
  /** Record that the grown-up agrees to the privacy notice (server-stamped). */
  agree: () => Promise<void>;
  /** Add a kid (and their PIN); throws with a message to show. */
  addKid: (input: KidInput) => Promise<Kid>;
  updateKid: (id: string, input: KidInput) => Promise<void>;
  /** Whether `pin` is this kid's PIN, and the database's count (#124c: locked, tries left). */
  checkKidPin: (id: string, pin: string) => Promise<PinVerdict>;
  setParentPin: (pin: string) => Promise<void>;
  checkParentPin: (pin: string) => Promise<PinVerdict>;
  /**
   * What the database has locked right now — each kid, the grown-up PIN —
   * with the seconds left (`pin_lock_status`); null when it can't say (an
   * older database, a failed call). A pad that shows a lock asks this, so a
   * new PIN set on another device opens it.
   */
  pinLocks: () => Promise<PinLocks | null>;
  /** Remove a kid and everything they own, for good. */
  removeKid: (id: string) => Promise<void>;
  /**
   * Close the whole account (#124b): the `delete-account` function checks the
   * password again and deletes the family and the login; then this device's
   * copies go and the grown-up is signed out (the sign-in page says so).
   * Throws with the function's refusal (`CloseAccountFailure`); after
   * `login_not_deleted` the family's data is gone though the login stays, so
   * this device's copies go and the family here is emptied to match.
   */
  closeAccount: (password: string) => Promise<void>;
  /** Start playing as a kid: loads their profile and save. */
  choose: (id: string) => void;
  /** Save, put the game away and go back to "Who's playing?". */
  switchPlayer: () => Promise<void>;
  setGrownUpsOpen: (open: boolean) => void;
  /** The review link has been followed (or the area closed): forget it, and take `?review` off the address. */
  clearReviewRequest: () => void;
  clear: () => void;
}

export const useFamilyStore = create<FamilyStore>((set, get) => ({
  userId: null,
  status: 'idle',
  error: null,
  sessionGone: false,
  consentAt: null,
  hasParentPin: false,
  kids: [],
  activeKidId: null,
  grownUpsOpen: false,
  pinNotSavedFor: null,
  reviewRequested: reviewLinkFollowed(),

  load: async (userId) => {
    set({ userId, status: 'loading', error: null, sessionGone: false, kids: [], activeKidId: null, grownUpsOpen: false, pinNotSavedFor: null });
    const [parent, kids] = await Promise.all([
      supabase.from('parents').select('consent_at, has_pin').eq('id', userId).maybeSingle(),
      supabase.from('profiles').select(KID_COLUMNS).eq('parent_id', userId).order('created_at'),
      // This sign-in is the family device's: however fresh, it never names
      // another sign-in to open or closes the account (#167 review round 1).
      noteDeviceSession(),
    ]);
    if (get().userId !== userId) return; // signed out meanwhile
    const failed = parent.error ?? kids.error;
    if (failed) {
      // Plain words on the error screen, the whole error in the console (#130 S6).
      console.warn('Loading the family failed:', errorMessage(failed));
      set({ status: 'error', error: familyLoadMessage(failed), sessionGone: sessionRanOut(failed) });
      return;
    }
    const list = ((kids.data ?? []) as KidRow[]).map(fromRow);
    const row = parent.data as { consent_at: string | null; has_pin: boolean | null } | null;
    const consentAt = row?.consent_at ?? null;
    // Still being set up, right after signing up or in: that fresh sign-in
    // opens 👪 Grown-ups for itself, so consent, the first kid and their PIN
    // need no gate (#167). The database decides; not fresh, nothing opens.
    if (settingUp(consentAt, list)) await openForFirstRun();
    if (get().userId !== userId) return; // signed out meanwhile
    set({ status: 'ready', consentAt, hasParentPin: row?.has_pin === true, kids: list });
    // A reload keeps the kid who was playing in this tab.
    const last = readActive(userId);
    if (last && list.some((k) => k.id === last)) get().choose(last);
  },

  agree: async () => {
    await asGrownUp(async () => {
      const { error } = await supabase.rpc('record_consent', { p_version: CONSENT_VERSION });
      if (error) throw asError(error);
    });
    set({ consentAt: new Date().toISOString() });
  },

  addKid: async (input) => {
    const data = await asGrownUp(async () => {
      const res = await supabase.from('profiles').insert(toRow(input)).select(KID_COLUMNS).single();
      if (res.error || !res.data) throw asError(res.error, "The new player didn't save — try again.");
      return res.data;
    });
    const kid = fromRow(data as KidRow);
    // Listed once their PIN is in (#167 review round 2): listed before it, the
    // first-player page flashed "Finish setting up …" on every add. If the PIN
    // fails they're listed without one, so "finish setting up" asks for it
    // again — and a form that added them changes them from now on (never adds
    // twice).
    if (!input.pin) {
      set((s) => ({ kids: [...s.kids, kid] }));
      return kid;
    }
    try {
      await setKidPin(kid.id, input.pin);
    } catch (err) {
      set((s) => ({ kids: [...s.kids, kid], pinNotSavedFor: kid.id }));
      throw new KidAddedWithoutPin(kid, err);
    }
    const added = { ...kid, hasPin: true };
    set((s) => ({ kids: [...s.kids, added] }));
    return added;
  },

  updateKid: async (id, input) => {
    await asGrownUp(async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ ...toRow(input), updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw asError(error);
    });
    if (input.pin) await setKidPin(id, input.pin);
    const row = toRow(input);
    set((s) => ({
      pinNotSavedFor: input.pin && s.pinNotSavedFor === id ? null : s.pinNotSavedFor,
      kids: s.kids.map((k) =>
        k.id === id
          ? { ...k, name: row.display_name, icon: row.icon, birthYear: row.birth_year, birthMonth: row.birth_month, hasPin: k.hasPin || !!input.pin }
          : k,
      ),
    }));
  },

  checkKidPin: (id, pin) => tryPin('try_kid_pin', 'check_kid_pin', { p_kid: id, p_pin: pin }),

  setParentPin: async (pin) => {
    await asGrownUp(async () => {
      const { error } = await supabase.rpc('set_parent_pin', { p_pin: pin });
      if (error) throw asError(error);
    });
    forgetLock(grownUpLockKey(get().userId));
    set({ hasParentPin: true });
  },

  checkParentPin: (pin) => tryPin('try_parent_pin', 'check_parent_pin', { p_pin: pin }),

  pinLocks: async () => {
    try {
      const { data, error } = await supabase.rpc('pin_lock_status');
      if (error) {
        // Before 0022 there's no such function (and no database lock to ask about).
        if (!functionMissing(error)) console.warn('Asking which PINs are locked failed:', errorMessage(error));
        return null;
      }
      return pinLocksFrom(data);
    } catch (err) {
      console.warn('Asking which PINs are locked failed:', errorMessage(err));
      return null;
    }
  },

  removeKid: async (id) => {
    // Their save, seen questions and flags go with them (on delete cascade).
    await asGrownUp(async () => {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw asError(error);
    });
    set((s) => ({ kids: s.kids.filter((k) => k.id !== id) }));
    // …and so do the copies on this device.
    try {
      localStorage.removeItem(saveKey(id));
      localStorage.removeItem(profileKey(id));
    } catch {
      // Storage unavailable — nothing was kept here.
    }
    forgetPlayDays(id);
  },

  closeAccount: async (password) => {
    const { userId, kids } = get();
    const email = useAuthStore.getState().user?.email ?? '';
    try {
      // 👪 Grown-ups locked meanwhile and the grown-up chose "Not now": nothing was deleted (#167).
      await asGrownUp(() => requestCloseAccount(email, password)).catch((err: unknown) => {
        throw err instanceof GrownUpsLockedError ? new CloseAccountFailure('grown_ups_locked', 'the gate was left shut') : err;
      });
    } catch (err) {
      if (err instanceof CloseAccountFailure && err.code === 'login_not_deleted') {
        // The family's data is gone on the server; only the login is left.
        // This device's copies go too, and the family here is what the server
        // holds now — consent is kept, so the grown-up stays on this page to
        // finish (it would bounce them to the privacy notice).
        forgetFamilyHere(userId, kids);
        forgetAllLocks();
        set({ kids: [], activeKidId: null, hasParentPin: false });
      }
      throw err;
    }
    // Gone on the server (or already was): the copies on this device go too.
    forgetFamilyHere(userId, kids);
    noteAccountClosed();
    // The login is gone: sign out here, even if the server can't be told.
    await signOutHere('Signing out after closing the account');
  },

  choose: (id) => {
    const { userId, kids } = get();
    const kid = kids.find((k) => k.id === id);
    if (!userId || !kid) return;
    set({ activeKidId: id });
    writeActive(userId, id);
    void useProfileStore.getState().loadProfile(id, { birthYear: kid.birthYear, birthMonth: kid.birthMonth });
    void useSaveStore.getState().load(id);
  },

  switchPlayer: async () => {
    // Push any pending save before this kid's game is put away.
    await useSaveStore.getState().flush();
    const { userId } = get();
    if (userId) writeActive(userId, null);
    set({ activeKidId: null });
    putAwayGame();
  },

  setGrownUpsOpen: (grownUpsOpen) => {
    set({ grownUpsOpen });
    if (!grownUpsOpen) get().clearReviewRequest();
  },

  clearReviewRequest: () => {
    set({ reviewRequested: false });
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('review')) {
        url.searchParams.delete('review');
        window.history.replaceState(window.history.state, '', url.toString());
      }
    } catch {
      // No address to tidy (not in a browser).
    }
  },

  clear: () => {
    // A lock this tab remembered is never the next login's (#124c review).
    forgetAllLocks();
    // …nor a grown-up action waiting on the gate (#167).
    resetGrownUps();
    set({
      userId: null,
      status: 'idle',
      error: null,
      sessionGone: false,
      consentAt: null,
      hasParentPin: false,
      kids: [],
      activeKidId: null,
      grownUpsOpen: false,
      pinNotSavedFor: null,
      reviewRequested: false,
    });
  },
}));

/** Whether the page was opened from a review alert's link (`?review`, #147). */
function reviewLinkFollowed(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('review');
  } catch {
    return false;
  }
}

/** The screens before the game (#124), in the order they're checked. */
export type FamilyScreen = 'loading' | 'error' | 'consent' | 'grownUps' | 'firstKid' | 'kidSetup' | 'pick' | 'play';

/** The first kid still without a PIN (one from before PINs, or whose PIN didn't save). */
export function kidNeedingPin(kids: Kid[]): Kid | null {
  return kids.find((k) => !k.hasPin) ?? null;
}

export function familyScreen(
  s: Pick<FamilyStore, 'status' | 'consentAt' | 'kids' | 'activeKidId' | 'grownUpsOpen'> &
    Partial<Pick<FamilyStore, 'reviewRequested'>>,
): FamilyScreen {
  if (s.status === 'error') return 'error';
  if (s.status !== 'ready') return 'loading';
  if (!s.consentAt) return 'consent';
  if (s.grownUpsOpen || s.reviewRequested) return 'grownUps';
  if (s.kids.length === 0) return 'firstKid';
  // Every kid needs a PIN before anyone plays.
  if (kidNeedingPin(s.kids)) return 'kidSetup';
  if (!s.activeKidId || !s.kids.some((k) => k.id === s.activeKidId)) return 'pick';
  return 'play';
}
