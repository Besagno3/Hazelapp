import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { saveKey } from '../lib/save';
import { profileKey } from '../lib/profile';
import { CONSENT_VERSION } from '../content/family';
import { sendFlow } from '../machines/gameFlow';
import { useProfileStore } from './profileStore';
import { useSaveStore } from './saveStore';
import { useBattleStore } from './battleStore';
import { useQuizSessionStore } from './quizSessionStore';
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

/** Set a kid's PIN (the database hashes it and checks the kid is the caller's). */
async function setKidPin(id: string, pin: string): Promise<void> {
  const { error } = await supabase.rpc('set_kid_pin', { p_kid: id, p_pin: pin });
  if (error) throw new Error(errorMessage(error));
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

/** Put away the game in progress: profile, save, battle, quiz round, flow. */
export function putAwayGame(): void {
  useProfileStore.getState().clearProfile();
  useSaveStore.getState().clear();
  useBattleStore.getState().reset();
  useQuizSessionStore.getState().reset();
  sendFlow({ type: 'RESET' });
}

interface FamilyStore {
  /** The grown-up's login this family was loaded for. */
  userId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  /** When the grown-up agreed to the privacy notice (null = not yet). */
  consentAt: string | null;
  /** The grown-up has their own PIN for 👪 Grown-ups (their password works too). */
  hasParentPin: boolean;
  kids: Kid[];
  /** The kid playing now (null = "Who's playing?"). */
  activeKidId: string | null;
  /** The Grown-ups area is open (from "Who's playing?"). */
  grownUpsOpen: boolean;
  /** Load the grown-up's consent and kids after sign-in. */
  load: (userId: string) => Promise<void>;
  /** Record that the grown-up agrees to the privacy notice (server-stamped). */
  agree: () => Promise<void>;
  /** Add a kid (and their PIN); throws with a message to show. */
  addKid: (input: KidInput) => Promise<Kid>;
  updateKid: (id: string, input: KidInput) => Promise<void>;
  /** Whether `pin` is this kid's PIN (checked by the database). */
  checkKidPin: (id: string, pin: string) => Promise<boolean>;
  setParentPin: (pin: string) => Promise<void>;
  checkParentPin: (pin: string) => Promise<boolean>;
  /** Remove a kid and everything they own, for good. */
  removeKid: (id: string) => Promise<void>;
  /** Start playing as a kid: loads their profile and save. */
  choose: (id: string) => void;
  /** Save, put the game away and go back to "Who's playing?". */
  switchPlayer: () => Promise<void>;
  setGrownUpsOpen: (open: boolean) => void;
  clear: () => void;
}

export const useFamilyStore = create<FamilyStore>((set, get) => ({
  userId: null,
  status: 'idle',
  error: null,
  consentAt: null,
  hasParentPin: false,
  kids: [],
  activeKidId: null,
  grownUpsOpen: false,

  load: async (userId) => {
    set({ userId, status: 'loading', error: null, kids: [], activeKidId: null, grownUpsOpen: false });
    const [parent, kids] = await Promise.all([
      supabase.from('parents').select('consent_at, has_pin').eq('id', userId).maybeSingle(),
      supabase.from('profiles').select(KID_COLUMNS).eq('parent_id', userId).order('created_at'),
    ]);
    if (get().userId !== userId) return; // signed out meanwhile
    const failed = parent.error ?? kids.error;
    if (failed) {
      set({ status: 'error', error: errorMessage(failed) });
      return;
    }
    const list = ((kids.data ?? []) as KidRow[]).map(fromRow);
    const row = parent.data as { consent_at: string | null; has_pin: boolean | null } | null;
    set({ status: 'ready', consentAt: row?.consent_at ?? null, hasParentPin: row?.has_pin === true, kids: list });
    // A reload keeps the kid who was playing in this tab.
    const last = readActive(userId);
    if (last && list.some((k) => k.id === last)) get().choose(last);
  },

  agree: async () => {
    const { error } = await supabase.rpc('record_consent', { p_version: CONSENT_VERSION });
    if (error) throw new Error(errorMessage(error));
    set({ consentAt: new Date().toISOString() });
  },

  addKid: async (input) => {
    const { data, error } = await supabase.from('profiles').insert(toRow(input)).select(KID_COLUMNS).single();
    if (error || !data) throw new Error(errorMessage(error ?? "The new player didn't save — try again."));
    const kid = fromRow(data as KidRow);
    set((s) => ({ kids: [...s.kids, kid] }));
    // Listed first: if the PIN fails, "finish setting up" asks for it again.
    if (!input.pin) return kid;
    await setKidPin(kid.id, input.pin);
    set((s) => ({ kids: s.kids.map((k) => (k.id === kid.id ? { ...k, hasPin: true } : k)) }));
    return { ...kid, hasPin: true };
  },

  updateKid: async (id, input) => {
    const { error } = await supabase
      .from('profiles')
      .update({ ...toRow(input), updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(errorMessage(error));
    if (input.pin) await setKidPin(id, input.pin);
    const row = toRow(input);
    set((s) => ({
      kids: s.kids.map((k) =>
        k.id === id
          ? { ...k, name: row.display_name, icon: row.icon, birthYear: row.birth_year, birthMonth: row.birth_month, hasPin: k.hasPin || !!input.pin }
          : k,
      ),
    }));
  },

  checkKidPin: async (id, pin) => {
    const { data, error } = await supabase.rpc('check_kid_pin', { p_kid: id, p_pin: pin });
    if (error) throw new Error(errorMessage(error));
    return data === true;
  },

  setParentPin: async (pin) => {
    const { error } = await supabase.rpc('set_parent_pin', { p_pin: pin });
    if (error) throw new Error(errorMessage(error));
    set({ hasParentPin: true });
  },

  checkParentPin: async (pin) => {
    const { data, error } = await supabase.rpc('check_parent_pin', { p_pin: pin });
    if (error) throw new Error(errorMessage(error));
    return data === true;
  },

  removeKid: async (id) => {
    // Their save, seen questions and flags go with them (on delete cascade).
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) throw new Error(errorMessage(error));
    set((s) => ({ kids: s.kids.filter((k) => k.id !== id) }));
    // …and so do the copies on this device.
    try {
      localStorage.removeItem(saveKey(id));
      localStorage.removeItem(profileKey(id));
    } catch {
      // Storage unavailable — nothing was kept here.
    }
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

  setGrownUpsOpen: (grownUpsOpen) => set({ grownUpsOpen }),

  clear: () =>
    set({
      userId: null,
      status: 'idle',
      error: null,
      consentAt: null,
      hasParentPin: false,
      kids: [],
      activeKidId: null,
      grownUpsOpen: false,
    }),
}));

/** The screens before the game (#118), in the order they're checked. */
export type FamilyScreen = 'loading' | 'error' | 'consent' | 'grownUps' | 'firstKid' | 'kidSetup' | 'pick' | 'play';

/** The first kid still without a PIN (one from before PINs, or whose PIN didn't save). */
export function kidNeedingPin(kids: Kid[]): Kid | null {
  return kids.find((k) => !k.hasPin) ?? null;
}

export function familyScreen(
  s: Pick<FamilyStore, 'status' | 'consentAt' | 'kids' | 'activeKidId' | 'grownUpsOpen'>,
): FamilyScreen {
  if (s.status === 'error') return 'error';
  if (s.status !== 'ready') return 'loading';
  if (!s.consentAt) return 'consent';
  if (s.grownUpsOpen) return 'grownUps';
  if (s.kids.length === 0) return 'firstKid';
  // Every kid needs a PIN before anyone plays.
  if (kidNeedingPin(s.kids)) return 'kidSetup';
  if (!s.activeKidId || !s.kids.some((k) => k.id === s.activeKidId)) return 'pick';
  return 'play';
}
