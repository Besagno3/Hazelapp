import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FunctionsHttpError } from '@supabase/supabase-js';

// A fake Supabase query builder: records each call chain and resolves with
// whatever `answer(table, ops)` returns.
const db = vi.hoisted(() => {
  type Op = [string, unknown[]];
  const chains: { table: string; ops: Op[] }[] = [];
  const answer = vi.fn<(table: string, ops: Op[]) => { data: unknown; error: unknown }>(() => ({ data: null, error: null }));
  const from = (table: string) => {
    const chain = { table, ops: [] as Op[] };
    chains.push(chain);
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'insert', 'update', 'delete', 'single', 'maybeSingle']) {
      b[m] = (...args: unknown[]) => {
        chain.ops.push([m, args]);
        return b;
      };
    }
    b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
      Promise.resolve(answer(table, chain.ops)).then(ok, bad);
    return b;
  };
  const rpc = vi.fn<(fn: string, args?: unknown) => Promise<{ data: unknown; error: unknown }>>(async () => ({ data: null, error: null }));
  return { chains, answer, from, rpc };
});
const auth = vi.hoisted(() => ({
  signOut: vi.fn(async (): Promise<{ error: unknown }> => ({ error: null })),
  signInWithPassword: vi.fn(),
  getUser: vi.fn(async () => ({ data: { user: { id: 'grown-up-1' } }, error: null })),
  getSession: vi.fn(),
}));
// The one-off client the close checks the password on (#124b review round 2).
const checkAuth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(async () => ({ data: { session: { access_token: 'fresh-token' } }, error: null })),
  signOut: vi.fn(async () => ({ error: null })),
}));
const checkRpc = vi.hoisted(() => vi.fn(async () => ({ data: { unlocked: true, seconds: 900 }, error: null })));
const functions = vi.hoisted(() => ({ invoke: vi.fn() }));
const forgetStoredSession = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({
  supabase: { from: db.from, rpc: db.rpc, auth, functions },
  passwordCheckClient: () => ({ auth: checkAuth, rpc: checkRpc }),
  forgetStoredSession,
}));

const { useFamilyStore, familyScreen, familyLoadMessage, signInAgain, signOutHere } = await import('./familyStore');
const { forgetAllLocks, grownUpLockKey, kidLockKey, lockLeft, rememberLock } = await import('../lib/pinLock');
const { useAuthStore } = await import('./authStore');
const { takeAccountClosedNotice } = await import('../lib/closeAccount');
const { NETWORK_MESSAGE, SIGNED_OUT_MESSAGE } = await import('../lib/errors');
const { useProfileStore } = await import('./profileStore');
const { useSaveStore } = await import('./saveStore');
const { CONSENT_VERSION } = await import('../content/family');
const { DEVICE_SESSION, deviceSession } = await import('../test/grownUps');

const SAM = { id: 'kid-sam', display_name: 'Sam', icon: 'fox', has_pin: true, birth_year: 2017, birth_month: 3 };
const KIT = { id: 'kid-kit', display_name: 'Kit', icon: 'panda', has_pin: true, birth_year: 2019, birth_month: 8 };

/** Answer the family load: the grown-up's consent (and PIN) and their kids. */
function family(consentAt: string | null, kids: unknown[], hasPin = false) {
  db.answer.mockImplementation((table) => {
    if (table === 'parents') return { data: { consent_at: consentAt, has_pin: hasPin }, error: null };
    if (table === 'profiles') return { data: kids, error: null };
    return { data: null, error: null };
  });
}

let loadProfile: ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<void>>>;
let loadSave: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
let flush: ReturnType<typeof vi.fn<() => Promise<void>>>;
let clearSave: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  db.chains.length = 0;
  db.answer.mockReset();
  db.rpc.mockClear();
  auth.getSession.mockResolvedValue(deviceSession);
  sessionStorage.clear();
  localStorage.clear();
  useFamilyStore.getState().clear();
  loadProfile = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
  loadSave = vi.fn<(id: string) => Promise<void>>(async () => {});
  flush = vi.fn<() => Promise<void>>(async () => {});
  clearSave = vi.fn<() => void>();
  useProfileStore.setState({ loadProfile });
  useSaveStore.setState({ load: loadSave, flush, clear: clearSave });
});

describe('familyScreen — the gates before the game, in order (#124)', () => {
  const kid = { id: 'k', name: 'Sam', icon: null, hasPin: true, birthYear: 2017, birthMonth: 3 };
  const noPin = { ...kid, id: 'old', hasPin: false };
  const ready = { status: 'ready' as const, consentAt: '2026-10-10', kids: [kid], activeKidId: 'k', grownUpsOpen: false };
  it.each([
    ['loading', { ...ready, status: 'loading' as const }],
    ['error', { ...ready, status: 'error' as const }],
    ['consent', { ...ready, consentAt: null, grownUpsOpen: true }],
    ['grownUps', { ...ready, grownUpsOpen: true, kids: [noPin] }],
    ['firstKid', { ...ready, kids: [], activeKidId: null }],
    ['kidSetup', { ...ready, kids: [kid, noPin] }],
    ['pick', { ...ready, activeKidId: null }],
    ['pick', { ...ready, activeKidId: 'removed-kid' }],
    ['play', ready],
    // A review alert's link (#147) opens Grown-ups even mid-game — but consent comes first.
    ['grownUps', { ...ready, reviewRequested: true }],
    ['consent', { ...ready, consentAt: null, reviewRequested: true }],
  ])('%s', (want, state) => {
    expect(familyScreen(state)).toBe(want);
  });

  it('closing Grown-ups forgets the review link and takes ?review off the address (#147)', () => {
    window.history.replaceState(null, '', '/?review&x=1');
    useFamilyStore.setState({ grownUpsOpen: true, reviewRequested: true });
    useFamilyStore.getState().setGrownUpsOpen(false);
    expect(useFamilyStore.getState().reviewRequested).toBe(false);
    expect(window.location.search).toBe('?x=1');
    window.history.replaceState(null, '', '/');
  });
});

describe('useFamilyStore', () => {
  it("load: reads the grown-up's consent, PIN flag and only their kids, oldest first", async () => {
    family('2026-10-10T10:00:00Z', [SAM, { ...KIT, has_pin: false }], true);
    await useFamilyStore.getState().load('grown-up-1');
    const s = useFamilyStore.getState();
    expect(s.status).toBe('ready');
    expect(s.consentAt).toBe('2026-10-10T10:00:00Z');
    expect(s.hasParentPin).toBe(true);
    expect(s.kids.map((k) => k.name)).toEqual(['Sam', 'Kit']);
    expect(s.kids[0]).toEqual({ id: 'kid-sam', name: 'Sam', icon: 'fox', hasPin: true, birthYear: 2017, birthMonth: 3 });
    expect(s.kids[1].hasPin).toBe(false);
    const kids = db.chains.find((c) => c.table === 'profiles')!;
    expect(kids.ops).toContainEqual(['eq', ['parent_id', 'grown-up-1']]);
    expect(kids.ops).toContainEqual(['order', ['created_at']]);
    expect(s.activeKidId).toBeNull(); // nobody plays until they're picked
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it('load: a grown-up with no row yet has not agreed', async () => {
    db.answer.mockImplementation((table) => (table === 'parents' ? { data: null, error: null } : { data: [], error: null }));
    await useFamilyStore.getState().load('grown-up-1');
    expect(useFamilyStore.getState().consentAt).toBeNull();
  });

  it('load: a failed read is an error to retry, in plain words — the raw error goes to the console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.answer.mockImplementation((table) =>
      table === 'profiles'
        ? { data: null, error: { message: 'permission denied for table profiles', code: '42501' } }
        : { data: { consent_at: 'x' }, error: null },
    );
    await useFamilyStore.getState().load('grown-up-1');
    expect(useFamilyStore.getState().status).toBe('error');
    expect(useFamilyStore.getState().error).toBe(
      `We couldn't open your family just now. Tap "Try again" — your players and their games are safe.`,
    );
    expect(warn).toHaveBeenCalledWith('Loading the family failed:', 'permission denied for table profiles [42501]');
    warn.mockRestore();
  });

  it('familyLoadMessage: the connection, a run-out sign-in, else a plain line', () => {
    expect(familyLoadMessage({ message: 'TypeError: Failed to fetch' })).toBe(
      `We couldn't reach Hazel Quest. Check your internet connection, then tap "Try again".`,
    );
    expect(familyLoadMessage({ message: 'JWT expired', code: 'PGRST301' })).toBe(SIGNED_OUT_MESSAGE);
    expect(familyLoadMessage({ message: 'relation "parents" does not exist', code: '42P01' })).toMatch(/^We couldn't open your family/);
    expect(familyLoadMessage({ message: 'x' })).not.toBe(NETWORK_MESSAGE);
  });

  it('choose: plays as that kid — their profile (seeded with their birth date) and save load', () => {
    useFamilyStore.setState({ userId: 'grown-up-1', status: 'ready', kids: [{ id: 'kid-sam', name: 'Sam', icon: 'fox', hasPin: true, birthYear: 2017, birthMonth: 3 }] });
    useFamilyStore.getState().choose('kid-sam');
    expect(useFamilyStore.getState().activeKidId).toBe('kid-sam');
    expect(loadProfile).toHaveBeenCalledWith('kid-sam', { birthYear: 2017, birthMonth: 3 });
    expect(loadSave).toHaveBeenCalledWith('kid-sam');
  });

  it('a reload keeps the kid who was playing in this tab', async () => {
    family('2026-10-10', [SAM, KIT]);
    await useFamilyStore.getState().load('grown-up-1');
    useFamilyStore.getState().choose('kid-kit');
    useFamilyStore.getState().clear(); // the page goes away…
    loadSave.mockClear();
    await useFamilyStore.getState().load('grown-up-1'); // …and comes back
    expect(useFamilyStore.getState().activeKidId).toBe('kid-kit');
    expect(loadSave).toHaveBeenCalledWith('kid-kit');
  });

  it('switchPlayer: saves first, then puts the game away and asks who is playing', async () => {
    family('2026-10-10', [SAM]);
    await useFamilyStore.getState().load('grown-up-1');
    useFamilyStore.getState().choose('kid-sam');
    const order: string[] = [];
    flush.mockImplementation(async () => void order.push('flush'));
    clearSave.mockImplementation(() => void order.push('clear'));
    await useFamilyStore.getState().switchPlayer();
    expect(order).toEqual(['flush', 'clear']);
    expect(useFamilyStore.getState().activeKidId).toBeNull();
    expect(useProfileStore.getState().profile).toBeNull();
    // …and a reload now asks again.
    useFamilyStore.getState().clear();
    await useFamilyStore.getState().load('grown-up-1');
    expect(useFamilyStore.getState().activeKidId).toBeNull();
  });

  it('addKid: inserts the kid (the database fills in the id and the grown-up), then sets their PIN', async () => {
    useFamilyStore.setState({ userId: 'grown-up-1', status: 'ready', kids: [] });
    db.answer.mockImplementation(() => ({ data: { ...SAM, has_pin: false }, error: null }));
    const kid = await useFamilyStore
      .getState()
      .addKid({ name: '  Sam ', icon: 'fox', pin: '4821', birthYear: 2017, birthMonth: 3 });
    const insert = db.chains[0].ops.find(([m]) => m === 'insert')!;
    // The PIN never goes in the row: only through set_kid_pin, which hashes it.
    expect(insert[1][0]).toEqual({ display_name: 'Sam', icon: 'fox', birth_year: 2017, birth_month: 3 });
    expect(db.rpc).toHaveBeenCalledWith('set_kid_pin', { p_kid: 'kid-sam', p_pin: '4821' });
    expect(kid).toMatchObject({ id: 'kid-sam', hasPin: true });
    expect(useFamilyStore.getState().kids).toEqual([kid]);
  });

  it("addKid: a PIN that didn't save leaves the kid listed without one (setup asks again)", async () => {
    useFamilyStore.setState({ userId: 'grown-up-1', status: 'ready', kids: [] });
    db.answer.mockImplementation(() => ({ data: { ...SAM, has_pin: false }, error: null }));
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } } as never);
    await expect(
      useFamilyStore.getState().addKid({ name: 'Sam', icon: 'fox', pin: '4821', birthYear: 2017, birthMonth: 3 }),
    ).rejects.toThrow(/Failed to fetch/);
    expect(useFamilyStore.getState().kids.map((k) => k.hasPin)).toEqual([false]);
  });

  it('addKid: a refused insert throws the reason to show', async () => {
    db.answer.mockImplementation(() => ({ data: null, error: { message: 'kid_limit: a family account can have up to 8 players' } }));
    await expect(
      useFamilyStore.getState().addKid({ name: 'Sam', icon: 'fox', pin: '4821', birthYear: 2017, birthMonth: 3 }),
    ).rejects.toThrow(/up to 8 players/);
    expect(useFamilyStore.getState().kids).toHaveLength(0);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('updateKid: a new PIN is set; a blank one keeps theirs', async () => {
    useFamilyStore.setState({ userId: 'grown-up-1', status: 'ready', kids: [{ id: 'old', name: null, icon: null, hasPin: false, birthYear: 2015, birthMonth: 1 }] });
    db.answer.mockImplementation(() => ({ data: null, error: null }));
    await useFamilyStore.getState().updateKid('old', { name: 'Ada', icon: 'bee', pin: '7777', birthYear: 2015, birthMonth: 1 });
    expect(db.rpc).toHaveBeenCalledWith('set_kid_pin', { p_kid: 'old', p_pin: '7777' });
    expect(useFamilyStore.getState().kids[0]).toMatchObject({ name: 'Ada', icon: 'bee', hasPin: true });
    db.rpc.mockClear();
    await useFamilyStore.getState().updateKid('old', { name: 'Ada B', icon: 'bee', birthYear: 2015, birthMonth: 1 });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(useFamilyStore.getState().kids[0]).toMatchObject({ name: 'Ada B', hasPin: true });
  });

  it('PINs are checked by the database\'s count (#124c): a kid\'s, and the grown-up\'s (which can also be set)', async () => {
    db.rpc.mockResolvedValueOnce({ data: { ok: true, tries_left: 5, wait_seconds: 0 }, error: null } as never);
    expect(await useFamilyStore.getState().checkKidPin('kid-sam', '4821')).toEqual({ ok: true, triesLeft: 5, waitSeconds: 0, limited: true });
    expect(db.rpc).toHaveBeenLastCalledWith('try_kid_pin', { p_kid: 'kid-sam', p_pin: '4821' });
    db.rpc.mockResolvedValueOnce({ data: { ok: false, tries_left: 0, wait_seconds: 60 }, error: null } as never);
    expect(await useFamilyStore.getState().checkParentPin('0000')).toMatchObject({ ok: false, waitSeconds: 60 });
    expect(db.rpc).toHaveBeenLastCalledWith('try_parent_pin', { p_pin: '0000' });
    await useFamilyStore.getState().setParentPin('9090');
    expect(db.rpc).toHaveBeenLastCalledWith('set_parent_pin', { p_pin: '9090' });
    expect(useFamilyStore.getState().hasParentPin).toBe(true);
    // The code and details stay on the error for the console; the screen shows the words.
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline', code: 'X1', details: 'more' } } as never);
    const err = await useFamilyStore.getState().checkKidPin('kid-sam', '1111').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ message: 'offline', code: 'X1', details: 'more' });
  });

  it('before migration 0022 (no try_* yet) kids still get in, through the old check', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.rpc
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.try_kid_pin' } } as never)
      .mockResolvedValueOnce({ data: true, error: null } as never);
    expect(await useFamilyStore.getState().checkKidPin('kid-sam', '4821')).toEqual({ ok: true, triesLeft: null, waitSeconds: 0, limited: false });
    expect(db.rpc).toHaveBeenLastCalledWith('check_kid_pin', { p_kid: 'kid-sam', p_pin: '4821' });
    db.rpc
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.try_parent_pin' } } as never)
      .mockResolvedValueOnce({ data: false, error: null } as never);
    expect(await useFamilyStore.getState().checkParentPin('0000')).toMatchObject({ ok: false, limited: false });
    expect(db.rpc).toHaveBeenLastCalledWith('check_parent_pin', { p_pin: '0000' });
    // Any other error isn't a missing migration: no unlimited fallback.
    db.rpc.mockClear();
    db.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied' } } as never);
    await expect(useFamilyStore.getState().checkKidPin('kid-sam', '1')).rejects.toThrow(/permission denied/);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('a new PIN forgets a lock this tab remembered (the database unlocks it too)', async () => {
    useFamilyStore.setState({ userId: 'grown-up-1', status: 'ready', kids: [{ id: 'kid-sam', name: 'Sam', icon: 'fox', hasPin: true, birthYear: 2017, birthMonth: 3 }] });
    rememberLock(kidLockKey('kid-sam'), 300);
    rememberLock(grownUpLockKey('grown-up-1'), 60);
    db.answer.mockImplementation(() => ({ data: null, error: null }));
    await useFamilyStore.getState().updateKid('kid-sam', { name: 'Sam', icon: 'fox', pin: '1234', birthYear: 2017, birthMonth: 3 });
    expect(lockLeft(kidLockKey('kid-sam'))).toBe(0);
    await useFamilyStore.getState().setParentPin('9090');
    expect(lockLeft(grownUpLockKey('grown-up-1'))).toBe(0);
    forgetAllLocks();
  });

  it("a remembered grown-up lock is that login's alone, and signing out forgets every lock (#124c review)", () => {
    rememberLock(grownUpLockKey('grown-up-a'), 3600);
    rememberLock(kidLockKey('kid-sam'), 900);
    expect(lockLeft(grownUpLockKey('grown-up-b'))).toBe(0);
    expect(lockLeft(grownUpLockKey('grown-up-a'))).toBeGreaterThan(0);
    // useAuthInit clears the family on sign-out.
    useFamilyStore.getState().clear();
    expect(lockLeft(grownUpLockKey('grown-up-a'))).toBe(0);
    expect(lockLeft(kidLockKey('kid-sam'))).toBe(0);
  });

  it('pinLocks: what the database has locked now; null when it can\'t say (#124c review)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.rpc.mockResolvedValueOnce({ data: { kids: { 'kid-sam': 299.2, 'kid-kit': 0 }, grown_up: 60 }, error: null } as never);
    expect(await useFamilyStore.getState().pinLocks()).toEqual({ kids: { 'kid-sam': 300 }, grownUp: 60 });
    expect(db.rpc).toHaveBeenLastCalledWith('pin_lock_status');
    db.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.pin_lock_status' } } as never);
    expect(await useFamilyStore.getState().pinLocks()).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    db.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch') as never);
    expect(await useFamilyStore.getState().pinLocks()).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('load: a run-out sign-in is marked, so the error screen offers "Sign in again"; signInAgain signs out here only', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.answer.mockImplementation(() => ({ data: null, error: { message: 'JWT expired', code: 'PGRST301' } }));
    await useFamilyStore.getState().load('grown-up-1');
    expect(useFamilyStore.getState()).toMatchObject({ status: 'error', sessionGone: true, error: SIGNED_OUT_MESSAGE });
    db.answer.mockImplementation(() => ({ data: null, error: { message: 'boom', code: 'XX000' } }));
    await useFamilyStore.getState().load('grown-up-1');
    expect(useFamilyStore.getState()).toMatchObject({ status: 'error', sessionGone: false });
    auth.signOut.mockClear();
    await signInAgain();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    warn.mockRestore();
  });

  it('closeAccount (#124b): the function closes it, then this device forgets the family and signs out', async () => {
    family('2026-10-10', [SAM, KIT]);
    await useFamilyStore.getState().load('grown-up-1');
    localStorage.setItem('hazel-save-kid-sam', '{}');
    localStorage.setItem('hazel-profile-kid-kit', '{}');
    sessionStorage.setItem('hazel-active-kid-grown-up-1', 'kid-sam');
    useAuthStore.setState({ user: { id: 'grown-up-1', email: 'mum@example.com' } as never });
    functions.invoke.mockResolvedValueOnce({ data: { ok: true, kids: 2 }, error: null });
    await useFamilyStore.getState().closeAccount('hunter22');
    expect(checkAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'mum@example.com', password: 'hunter22' });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(functions.invoke).toHaveBeenCalledWith('delete-account', { body: { confirm: 'DELETE', session: DEVICE_SESSION }, headers: { Authorization: 'Bearer fresh-token' } });
    expect(localStorage.getItem('hazel-save-kid-sam')).toBeNull();
    expect(localStorage.getItem('hazel-profile-kid-kit')).toBeNull();
    expect(sessionStorage.getItem('hazel-active-kid-grown-up-1')).toBeNull();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(takeAccountClosedNotice()).toBe('Your account and all its data are gone.');
  });

  it('closeAccount: a refusal keeps everything and signs nobody out', async () => {
    family('2026-10-10', [SAM]);
    await useFamilyStore.getState().load('grown-up-1');
    localStorage.setItem('hazel-save-kid-sam', '{}');
    auth.signOut.mockClear();
    useAuthStore.setState({ user: { id: 'grown-up-1', email: 'mum@example.com' } as never });
    functions.invoke.mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify({ error: 'data_not_deleted' }), { status: 500 })),
    });
    await expect(useFamilyStore.getState().closeAccount('hunter22')).rejects.toMatchObject({ code: 'data_not_deleted' });
    expect(localStorage.getItem('hazel-save-kid-sam')).toBe('{}');
    expect(useFamilyStore.getState().kids).toHaveLength(1);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(takeAccountClosedNotice()).toBeNull();
  });

  it('closeAccount: after login_not_deleted the family is gone here too — copies, kids, grown-up PIN, locks (#124b review)', async () => {
    family('2026-10-10', [SAM, KIT], true);
    await useFamilyStore.getState().load('grown-up-1');
    localStorage.setItem('hazel-save-kid-sam', '{}');
    localStorage.setItem('hazel-profile-kid-kit', '{}');
    sessionStorage.setItem('hazel-active-kid-grown-up-1', 'kid-sam');
    rememberLock(kidLockKey('kid-sam'), 900);
    auth.signOut.mockClear();
    useAuthStore.setState({ user: { id: 'grown-up-1', email: 'mum@example.com' } as never });
    functions.invoke.mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify({ error: 'login_not_deleted' }), { status: 500 })),
    });
    await expect(useFamilyStore.getState().closeAccount('hunter22')).rejects.toMatchObject({ code: 'login_not_deleted' });
    expect(localStorage.getItem('hazel-save-kid-sam')).toBeNull();
    expect(localStorage.getItem('hazel-profile-kid-kit')).toBeNull();
    expect(sessionStorage.getItem('hazel-active-kid-grown-up-1')).toBeNull();
    expect(useFamilyStore.getState()).toMatchObject({ kids: [], activeKidId: null, hasParentPin: false, consentAt: '2026-10-10' });
    expect(lockLeft(kidLockKey('kid-sam'))).toBe(0);
    // Signed in still: "Close account for good" again finishes it.
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(takeAccountClosedNotice()).toBeNull();
  });

  it('closeAccount: a sign-out the server can\'t hear still signs out here — never stuck on "Closing your account…" (#124b review round 2)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    family('2026-10-10', [SAM]);
    await useFamilyStore.getState().load('grown-up-1');
    useAuthStore.setState({ user: { id: 'grown-up-1', email: 'mum@example.com' } as never });
    functions.invoke.mockResolvedValueOnce({ data: { ok: true, kids: 1 }, error: null });
    auth.signOut.mockClear();
    forgetStoredSession.mockClear();
    // supabase-js keeps the session when /logout fails; with it dropped, the second ask needs no server.
    auth.signOut.mockResolvedValueOnce({ error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' } });
    await useFamilyStore.getState().closeAccount('hunter22');
    expect(forgetStoredSession).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledTimes(2);
    expect(auth.signOut.mock.invocationCallOrder[1]).toBeGreaterThan(forgetStoredSession.mock.invocationCallOrder[0]);
    expect(takeAccountClosedNotice()).toBe('Your account and all its data are gone.');
    warn.mockRestore();
  });

  it('signOutHere: signed out here whatever happens — the stored session dropped, and if even that fails, the stores cleared by hand', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    auth.signOut.mockClear();
    forgetStoredSession.mockClear();
    // All well: one ask, nothing dropped by hand.
    await signOutHere('Testing');
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(forgetStoredSession).not.toHaveBeenCalled();
    // Both asks fail (a thrown error too): the auth and family stores are cleared here.
    family('2026-10-10', [SAM]);
    await useFamilyStore.getState().load('grown-up-1');
    useAuthStore.setState({ user: { id: 'grown-up-1' } as never, session: { access_token: 'x' } as never });
    auth.signOut.mockClear().mockResolvedValueOnce({ error: { status: 503, message: 'Service Unavailable' } }).mockRejectedValueOnce(new Error('storage broken'));
    await signOutHere('Testing');
    expect(auth.signOut).toHaveBeenCalledTimes(2);
    expect(forgetStoredSession).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ user: null, session: null });
    expect(useFamilyStore.getState()).toMatchObject({ userId: null, status: 'idle', kids: [] });
    expect(clearSave).toHaveBeenCalled();
    // "Sign in again" (App's error screen, the pads, the family forms) goes the same way.
    auth.signOut.mockClear().mockResolvedValueOnce({ error: { status: 429, message: 'Too many requests' } });
    forgetStoredSession.mockClear();
    await signInAgain();
    expect(auth.signOut).toHaveBeenCalledTimes(2);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(forgetStoredSession).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("removeKid: deletes the kid and the copies of their game on this device", async () => {
    family('2026-10-10', [SAM, KIT]);
    await useFamilyStore.getState().load('grown-up-1');
    localStorage.setItem('hazel-save-kid-sam', '{}');
    localStorage.setItem('hazel-profile-kid-sam', '{}');
    localStorage.setItem('hazel-save-kid-kit', '{}');
    db.answer.mockImplementation(() => ({ data: null, error: null }));
    await useFamilyStore.getState().removeKid('kid-sam');
    const del = db.chains.at(-1)!;
    expect(del.table).toBe('profiles');
    expect(del.ops).toContainEqual(['delete', []]);
    expect(del.ops).toContainEqual(['eq', ['id', 'kid-sam']]);
    expect(useFamilyStore.getState().kids.map((k) => k.id)).toEqual(['kid-kit']);
    expect(localStorage.getItem('hazel-save-kid-sam')).toBeNull();
    expect(localStorage.getItem('hazel-profile-kid-sam')).toBeNull();
    expect(localStorage.getItem('hazel-save-kid-kit')).toBe('{}');
  });

  it('agree: records consent to this version of the notice', async () => {
    await useFamilyStore.getState().agree();
    expect(db.rpc).toHaveBeenCalledWith('record_consent', { p_version: CONSENT_VERSION });
    expect(useFamilyStore.getState().consentAt).not.toBeNull();
  });
});

describe('👪 Grown-ups enforced by the database (#167)', () => {
  const LOCKED = { code: 'HQ001', message: 'grown_ups_locked: open 👪 Grown-ups first' };

  beforeEach(async () => {
    const { resetGrownUps } = await import('./grownUpsStore');
    resetGrownUps();
    db.rpc.mockImplementation(async () => ({ data: null, error: null }));
  });

  it('load: a family still being set up opens 👪 Grown-ups on the fresh sign-in, before anything shows (the first run needs no gate)', async () => {
    const { useGrownUpsStore } = await import('./grownUpsStore');
    for (const [consent, kids] of [
      [null, []],
      ['2026-10-10', []],
      ['2026-10-10', [{ ...SAM, has_pin: false }]],
    ] as const) {
      db.rpc.mockClear();
      family(consent, [...kids]);
      await useFamilyStore.getState().load('grown-up-1');
      expect(db.rpc, JSON.stringify([consent, kids])).toHaveBeenCalledWith('unlock_grown_ups');
      expect(useFamilyStore.getState().status).toBe('ready');
    }
    expect(useGrownUpsStore.getState().wasOpen).toBe(true);
  });

  it('load: a set-up family opens nothing — the gate does that', async () => {
    family('2026-10-10', [SAM]);
    await useFamilyStore.getState().load('grown-up-1');
    expect(db.rpc).not.toHaveBeenCalledWith('unlock_grown_ups');
  });

  it('load: a sign-in that isn\'t fresh is refused quietly, and the family still loads', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { useGrownUpsStore } = await import('./grownUpsStore');
    db.rpc.mockImplementation(async () => ({ data: null, error: { code: 'HQ002', message: 'reauth_required' } }));
    family(null, []);
    await useFamilyStore.getState().load('grown-up-1');
    expect(useFamilyStore.getState().status).toBe('ready');
    expect(useGrownUpsStore.getState().wasOpen).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a refused grown-up action asks for the gate and runs again once it opens (consent here)', async () => {
    const { unlockedAgain, useGrownUpsStore } = await import('./grownUpsStore');
    let calls = 0;
    db.rpc.mockImplementation(async (fn: string) => {
      if (fn !== 'record_consent') return { data: null, error: null };
      calls += 1;
      return calls === 1 ? { data: null, error: LOCKED } : { data: null, error: null };
    });
    const agreeing = useFamilyStore.getState().agree();
    await vi.waitFor(() => expect(useGrownUpsStore.getState().asked).toBe(true));
    unlockedAgain();
    await agreeing;
    expect(calls).toBe(2);
    expect(useFamilyStore.getState().consentAt).not.toBeNull();
  });

  it('"Not now" on a remove leaves the kid, and says it was locked', async () => {
    const { unlockCancelled, useGrownUpsStore } = await import('./grownUpsStore');
    const { GrownUpsLockedError } = await import('../lib/grownUpsGate');
    family('2026-10-10', [SAM, KIT]);
    await useFamilyStore.getState().load('grown-up-1');
    db.answer.mockImplementation(() => ({ data: null, error: LOCKED }));
    const removing = useFamilyStore.getState().removeKid('kid-sam');
    await vi.waitFor(() => expect(useGrownUpsStore.getState().asked).toBe(true));
    unlockCancelled();
    await expect(removing).rejects.toBeInstanceOf(GrownUpsLockedError);
    expect(useFamilyStore.getState().kids.map((k) => k.id)).toEqual(['kid-sam', 'kid-kit']);
  });

  it('closeAccount: the function refusing "grown_ups_locked" asks for the gate; "Not now" is a close refusal that deleted nothing', async () => {
    const { unlockCancelled, useGrownUpsStore } = await import('./grownUpsStore');
    useAuthStore.setState({ user: { id: 'grown-up-1', email: 'mum@example.com' } as never });
    family('2026-10-10', [SAM]);
    await useFamilyStore.getState().load('grown-up-1');
    functions.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify({ error: 'grown_ups_locked', detail: 'x' }), { status: 403 })),
    });
    auth.signOut.mockClear();
    const closing = useFamilyStore.getState().closeAccount('hunter22');
    await vi.waitFor(() => expect(useGrownUpsStore.getState().asked).toBe(true));
    unlockCancelled();
    await expect(closing).rejects.toMatchObject({ name: 'CloseAccountFailure', code: 'grown_ups_locked' });
    expect(useFamilyStore.getState().kids).toHaveLength(1);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('signing out (clear) ends anything waiting on the gate', async () => {
    const { askToUnlock, useGrownUpsStore } = await import('./grownUpsStore');
    const waiting = askToUnlock();
    useFamilyStore.getState().clear();
    await expect(waiting).rejects.toMatchObject({ code: 'grown_ups_locked' });
    expect(useGrownUpsStore.getState().asked).toBe(false);
  });

  it("a grown-up's Sign out never waits long on shutting 👪 Grown-ups", async () => {
    const { signOutGrownUp, LOCK_BEFORE_SIGN_OUT_MS } = await import('./familyStore');
    vi.useFakeTimers();
    try {
      db.rpc.mockImplementation(() => new Promise(() => {}));
      auth.signOut.mockClear();
      const out = signOutGrownUp();
      await vi.advanceTimersByTimeAsync(LOCK_BEFORE_SIGN_OUT_MS);
      await out;
      expect(auth.signOut).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a grown-up's Sign out shuts 👪 Grown-ups on this sign-in first", async () => {
    const { signOutGrownUp } = await import('./familyStore');
    await signOutGrownUp();
    expect(db.rpc).toHaveBeenCalledWith('lock_grown_ups');
    expect(db.rpc.mock.invocationCallOrder.at(-1)!).toBeLessThan(auth.signOut.mock.invocationCallOrder.at(-1)!);
  });
});
