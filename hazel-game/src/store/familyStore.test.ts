import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  return { chains, answer, from, rpc };
});
vi.mock('../lib/supabase', () => ({ supabase: { from: db.from, rpc: db.rpc } }));

const { useFamilyStore, familyScreen } = await import('./familyStore');
const { useProfileStore } = await import('./profileStore');
const { useSaveStore } = await import('./saveStore');
const { CONSENT_VERSION } = await import('../content/family');

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

describe('familyScreen — the gates before the game, in order (#118)', () => {
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
  ])('%s', (want, state) => {
    expect(familyScreen(state)).toBe(want);
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

  it('load: a failed read is an error to retry, not an empty family', async () => {
    db.answer.mockImplementation((table) =>
      table === 'profiles' ? { data: null, error: { message: 'permission denied' } } : { data: { consent_at: 'x' }, error: null },
    );
    await useFamilyStore.getState().load('grown-up-1');
    expect(useFamilyStore.getState().status).toBe('error');
    expect(useFamilyStore.getState().error).toMatch(/permission denied/);
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

  it('PINs are checked by the database: a kid\'s, and the grown-up\'s (which can also be set)', async () => {
    db.rpc.mockResolvedValueOnce({ data: true, error: null } as never);
    expect(await useFamilyStore.getState().checkKidPin('kid-sam', '4821')).toBe(true);
    expect(db.rpc).toHaveBeenLastCalledWith('check_kid_pin', { p_kid: 'kid-sam', p_pin: '4821' });
    db.rpc.mockResolvedValueOnce({ data: false, error: null } as never);
    expect(await useFamilyStore.getState().checkParentPin('0000')).toBe(false);
    expect(db.rpc).toHaveBeenLastCalledWith('check_parent_pin', { p_pin: '0000' });
    await useFamilyStore.getState().setParentPin('9090');
    expect(db.rpc).toHaveBeenLastCalledWith('set_parent_pin', { p_pin: '9090' });
    expect(useFamilyStore.getState().hasParentPin).toBe(true);
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } } as never);
    await expect(useFamilyStore.getState().checkKidPin('kid-sam', '1111')).rejects.toThrow(/offline/);
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
