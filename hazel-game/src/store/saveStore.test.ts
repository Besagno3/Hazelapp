import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSaveStore, watchPageForSaves } from './saveStore';
import {
  defaultSave,
  normalizeSave,
  revisionOf,
  saveKey,
  SAVE_REVISION_CONFLICT,
  SAVE_VERSION,
  SAVE_VERSION_CONFLICT,
} from '../lib/save';
import { CURRENT_ABOARD, FINALE_NOT_ACT2, V1, V2_FIRST_BUILD, V2_PRE_14A, V2_PRE_ITEM10 } from '../test/saveFixtures';

type Row = { profile_id: string; data: Record<string, unknown>; updated_at: string };

// The Supabase `saves` table, faked: a row per kid (as the server would —
// migration 0011 + 0020's rules apply to every upsert), the upserts made the
// normal way and the `keepalive` ones, and errors to fail with.
const remote = vi.hoisted(() => ({
  rows: {} as Record<string, { data: Record<string, unknown> }>,
  upserts: [] as Row[],
  beacons: [] as Row[],
  /** The error every upsert fails with (null = the rules decide). */
  upsertError: null as unknown,
  /** The error reads fail with (null = they succeed). */
  readError: null as unknown,
  /** No keepalive request possible (no session / too big): `upsertSaveKeepalive` gives null. */
  noBeacon: false,
  /** The error each keepalive request fails with (a 401, a dropped request); null = the rules decide. */
  beaconError: null as unknown,
  /** While true, each upsert waits until the test calls the next gate. */
  hold: false,
  gates: [] as (() => void)[],
  /** While true, each read waits until the test calls its gate. */
  holdReads: false,
  readGates: [] as (() => void)[],
  /** What the server would answer; set below, once `revisionOf` is in scope. */
  apply: null as unknown as (row: Row) => { error: unknown },
}));

remote.apply = (row) => {
  if (remote.upsertError) return { error: remote.upsertError };
  const old = remote.rows[row.profile_id]?.data;
  if (old) {
    const vOld = typeof old.version === 'number' ? old.version : 1;
    const vNew = typeof row.data.version === 'number' ? row.data.version : 1;
    if (vNew < vOld) return { error: { message: `${SAVE_VERSION_CONFLICT}: newer version (v${vOld}), refusing v${vNew}`, code: 'P0001' } };
    const rOld = revisionOf(old);
    const rNew = revisionOf(row.data);
    const same = JSON.stringify(old) === JSON.stringify(row.data);
    if (rOld !== null && (rNew === null || rNew < rOld || (rNew === rOld && !same))) {
      return {
        error: {
          message: `${SAVE_VERSION_CONFLICT}: a newer save is already stored (revision ${rOld}), refusing revision ${rNew ?? 'none'}`,
          details: SAVE_REVISION_CONFLICT,
          hint: 'Refresh the page to load the newest save.',
          code: 'P0001',
        },
      };
    }
  }
  remote.rows[row.profile_id] = { data: JSON.parse(JSON.stringify(row.data)) };
  return { error: null };
};

async function serve(row: Row): Promise<{ error: unknown }> {
  if (remote.hold) await new Promise<void>((go) => remote.gates.push(go));
  return remote.apply(row);
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: (columns: string) => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: async () => {
            if (remote.holdReads) await new Promise<void>((go) => remote.readGates.push(go));
            if (remote.readError) return { data: null, error: remote.readError };
            const row = remote.rows[id];
            if (!row) return { data: null, error: null };
            // `revision:data->revision` reads just the revision.
            if (columns.startsWith('revision')) return { data: { revision: row.data.revision ?? null }, error: null };
            return { data: row, error: null };
          },
        }),
      }),
      upsert: (r: Row) => {
        remote.upserts.push(r);
        return serve(r);
      },
    }),
  },
}));
vi.mock('../lib/saveKeepalive', () => ({
  upsertSaveKeepalive: (r: Row) => {
    if (remote.noBeacon) return null;
    remote.beacons.push(r);
    if (remote.beaconError) return Promise.resolve({ error: remote.beaconError });
    return serve(r);
  },
}));
import { ROUNDS_TO_UNLOCK } from '../lib/utils';
import type { Question, SaveData } from '../types';

const q: Question = {
  id: 'q1',
  topic: 'math',
  level: 3,
  text: '?',
  options: ['a', 'b', 'c', 'd'],
  correctIndex: 0,
};

/** A current-version save with this revision and these coins. */
const copy = (revision: number | undefined, coins: number) => ({ ...defaultSave(), revision, coins });
const local = (userId: string) => JSON.parse(localStorage.getItem(saveKey(userId))!) as SaveData;
const pushed = () => [...remote.upserts, ...remote.beacons];
/** Lets queued promise callbacks (the fake server's answers) run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

function resetRemote() {
  remote.rows = {};
  remote.upserts = [];
  remote.beacons = [];
  remote.upsertError = null;
  remote.readError = null;
  remote.noBeacon = false;
  remote.beaconError = null;
  remote.hold = false;
  remote.gates = [];
  remote.holdReads = false;
  remote.readGates = [];
}

// userId stays null in these tests → no localStorage/Supabase writes,
// pure in-memory behavior.
beforeEach(() => {
  useSaveStore.setState({ userId: null, save: defaultSave(), status: 'ready', remoteError: null, syncedRevision: null, outdatedReason: null });
});

describe('saveStore.update', () => {
  it('applies a mutation to the save', () => {
    useSaveStore.getState().update((s) => ({ ...s, coins: 99 }));
    expect(useSaveStore.getState().save?.coins).toBe(99);
  });

  it('every change is the next revision; no change, no new revision (#151)', () => {
    const { update } = useSaveStore.getState();
    update((s) => ({ ...s, coins: 1 }));
    update((s) => ({ ...s, coins: 2 }));
    expect(useSaveStore.getState().save?.revision).toBe(2);
    // A mutation can't set the revision itself.
    update((s) => ({ ...s, coins: 3, revision: 99 }));
    expect(useSaveStore.getState().save?.revision).toBe(3);
    update((s) => s);
    expect(useSaveStore.getState().save?.revision).toBe(3);
  });
});

describe('saveStore.recordQuizRound', () => {
  it('counts passed rounds and unlocks the world at the threshold', () => {
    const store = useSaveStore.getState();
    for (let i = 0; i < ROUNDS_TO_UNLOCK; i++) {
      expect(useSaveStore.getState().save?.worldUnlocked).toBe(false);
      store.recordQuizRound(true, []);
    }
    expect(useSaveStore.getState().save?.passedRounds).toBe(ROUNDS_TO_UNLOCK);
    expect(useSaveStore.getState().save?.worldUnlocked).toBe(true);
  });

  it('failed rounds do not count toward the unlock', () => {
    for (let i = 0; i < ROUNDS_TO_UNLOCK; i++) {
      useSaveStore.getState().recordQuizRound(false, []);
    }
    expect(useSaveStore.getState().save?.worldUnlocked).toBe(false);
  });

  it('queues misses into the library', () => {
    useSaveStore.getState().recordQuizRound(false, [{ question: q, picked: 2 }]);
    expect(useSaveStore.getState().save?.library).toHaveLength(1);
    expect(useSaveStore.getState().save?.library[0].question.id).toBe('q1');
  });
});

describe('saveStore.clear', () => {
  it('drops the save and user', () => {
    useSaveStore.getState().clear();
    expect(useSaveStore.getState().save).toBeNull();
    expect(useSaveStore.getState().status).toBe('idle');
  });
});

describe('saveStore.load', () => {
  beforeEach(() => {
    resetRemote();
    localStorage.clear();
  });

  it('upgrades a v1 save from the server and saves it back as today\'s version (#75 items 8, 15b)', async () => {
    remote.rows.u1 = { data: { version: 1, zoneId: 'lumina-field', pos: { x: 5, y: 5 }, coins: 7, sageEquipped: 'math' } };
    await useSaveStore.getState().load('u1');
    const { save, status } = useSaveStore.getState();
    expect(status).toBe('ready');
    expect(save).toMatchObject({ version: SAVE_VERSION, zoneId: 'lumina-village', pos: null, coins: 7 });
    expect(local('u1').version).toBe(SAVE_VERSION);
    expect(remote.upserts).toHaveLength(1);
  });

  // #75 item 14b: every save shape since v1, served by the server, loads and is written back as today's version.
  it.each([
    ['v1 on Lumina Field', V1],
    ['v2 from its first build', V2_FIRST_BUILD],
    ['v2 in the Depths vault', V2_PRE_ITEM10],
    ['v2 with an inn, before the boat', V2_PRE_14A],
    ['today, afloat', CURRENT_ABOARD],
    ['the finale seen, Act II not', FINALE_NOT_ACT2],
  ])('loads %s from the server, ready to play, and writes it back once as today\'s version', async (_name, raw) => {
    remote.rows['u-fixture'] = { data: raw as Record<string, unknown> };
    await useSaveStore.getState().load('u-fixture');
    const { save, status, remoteError } = useSaveStore.getState();
    // From before revisions: written back as revision 1, like any change (#151).
    const expected = { ...normalizeSave(raw), revision: 1 };
    expect(status).toBe('ready');
    expect(remoteError).toBeNull();
    expect(save).toEqual(expected);
    expect(local('u-fixture')).toEqual(expected);
    await vi.waitFor(() => expect(remote.upserts).toHaveLength(1));
    const row = remote.upserts[0];
    expect(row.profile_id).toBe('u-fixture');
    expect(row.data).toEqual(expected);
    expect(row.data.version).toBe(SAVE_VERSION);
    // …and only once.
    await new Promise((r) => setTimeout(r, 50));
    expect(remote.upserts).toHaveLength(1);
  });

  it('a v2 save kept only on this device (no server row) loads the same, and goes to the server', async () => {
    localStorage.setItem(saveKey('u-local'), JSON.stringify(V2_PRE_14A));
    await useSaveStore.getState().load('u-local');
    expect(useSaveStore.getState().status).toBe('ready');
    expect(useSaveStore.getState().save).toEqual(normalizeSave(V2_PRE_14A));
    await vi.waitFor(() => expect(remote.upserts).toHaveLength(1));
  });

  it('refuses a save from a newer version: nothing loaded, nothing written back', async () => {
    const newer = { version: SAVE_VERSION + 1, zoneId: 'somewhere-new', coins: 999 };
    remote.rows.u2 = { data: newer };
    await useSaveStore.getState().load('u2');
    expect(useSaveStore.getState().status).toBe('outdated');
    expect(useSaveStore.getState().outdatedReason).toBe('update');
    expect(useSaveStore.getState().save).toBeNull();
    expect(localStorage.getItem(saveKey('u2'))).toBeNull();
    expect(remote.upserts).toHaveLength(0);
  });

  it('refuses a newer local copy too (no server row)', async () => {
    const newer = JSON.stringify({ version: SAVE_VERSION + 1, coins: 5 });
    localStorage.setItem(saveKey('u3'), newer);
    await useSaveStore.getState().load('u3');
    expect(useSaveStore.getState().status).toBe('outdated');
    expect(localStorage.getItem(saveKey('u3'))).toBe(newer);
    expect(remote.upserts).toHaveLength(0);
  });

  it('refuses a newer local copy even when the server has a current one: neither is touched (#151)', async () => {
    const newer = JSON.stringify({ version: SAVE_VERSION + 1, revision: 9, coins: 5 });
    localStorage.setItem(saveKey('u3b'), newer);
    remote.rows.u3b = { data: copy(4, 4) };
    await useSaveStore.getState().load('u3b');
    expect(useSaveStore.getState()).toMatchObject({ status: 'outdated', outdatedReason: 'update', save: null });
    expect(localStorage.getItem(saveKey('u3b'))).toBe(newer);
    expect(remote.upserts).toHaveLength(0);
  });

  it('a second load before the first answers wins: the first kid\'s late answer is dropped', async () => {
    localStorage.setItem(saveKey('kid-a'), JSON.stringify(copy(1, 111)));
    localStorage.setItem(saveKey('kid-b'), JSON.stringify(copy(1, 222)));
    remote.holdReads = true;
    const first = useSaveStore.getState().load('kid-a');
    const second = useSaveStore.getState().load('kid-b');
    await settle();
    remote.readGates[1](); // kid B's answer first…
    await second;
    remote.readGates[0](); // …then kid A's, late
    await first;
    expect(useSaveStore.getState()).toMatchObject({ userId: 'kid-b', status: 'ready' });
    expect(useSaveStore.getState().save?.coins).toBe(222);
  });
});

describe('which copy wins on load (#151)', () => {
  beforeEach(() => {
    resetRemote();
    localStorage.clear();
  });

  it('this device\'s copy is newer (progress made offline): it is kept and sent to the server', async () => {
    remote.rows.k = { data: copy(3, 30) };
    localStorage.setItem(saveKey('k'), JSON.stringify(copy(5, 50)));
    await useSaveStore.getState().load('k');
    expect(useSaveStore.getState().save).toMatchObject({ revision: 5, coins: 50 });
    await vi.waitFor(() => expect(remote.rows.k?.data).toMatchObject({ revision: 5, coins: 50 }));
    expect(remote.upserts).toHaveLength(1);
    expect(useSaveStore.getState()).toMatchObject({ syncedRevision: 5, remoteError: null });
  });

  it('the server\'s copy is newer (played on another device): it is used, and kept on this device', async () => {
    remote.rows.k = { data: copy(7, 70) };
    localStorage.setItem(saveKey('k'), JSON.stringify(copy(5, 50)));
    await useSaveStore.getState().load('k');
    expect(useSaveStore.getState().save).toMatchObject({ revision: 7, coins: 70 });
    expect(local('k')).toMatchObject({ revision: 7, coins: 70 });
    await settle();
    expect(remote.upserts).toHaveLength(0); // the server has it already
    expect(useSaveStore.getState().syncedRevision).toBe(7);
  });

  it('a tie goes to the server\'s copy, and nothing is sent', async () => {
    remote.rows.k = { data: copy(5, 55) };
    localStorage.setItem(saveKey('k'), JSON.stringify(copy(5, 50)));
    await useSaveStore.getState().load('k');
    expect(useSaveStore.getState().save).toMatchObject({ revision: 5, coins: 55 });
    await settle();
    expect(remote.upserts).toHaveLength(0);
  });

  it('neither copy has a revision (saved before #151): the server\'s wins, as before, and gets revision 1', async () => {
    remote.rows.k = { data: copy(undefined, 9) };
    localStorage.setItem(saveKey('k'), JSON.stringify(copy(undefined, 4)));
    await useSaveStore.getState().load('k');
    expect(useSaveStore.getState().save).toMatchObject({ revision: 1, coins: 9 });
    await vi.waitFor(() => expect(remote.rows.k?.data).toMatchObject({ revision: 1, coins: 9 }));
  });

  it('a local copy with a revision beats a server copy from before revisions', async () => {
    remote.rows.k = { data: copy(undefined, 9) };
    localStorage.setItem(saveKey('k'), JSON.stringify(copy(2, 20)));
    await useSaveStore.getState().load('k');
    expect(useSaveStore.getState().save).toMatchObject({ revision: 2, coins: 20 });
    await vi.waitFor(() => expect(remote.rows.k?.data).toMatchObject({ revision: 2, coins: 20 }));
  });

  it('the server can\'t be reached: this device\'s copy is played, and sent with the next change', async () => {
    remote.rows.k = { data: copy(3, 30) };
    remote.readError = { message: 'Failed to fetch' };
    localStorage.setItem(saveKey('k'), JSON.stringify(copy(5, 50)));
    await useSaveStore.getState().load('k');
    expect(useSaveStore.getState()).toMatchObject({ status: 'ready', syncedRevision: null });
    expect(useSaveStore.getState().save).toMatchObject({ revision: 5, coins: 50 });
    expect(useSaveStore.getState().remoteError).toContain('Failed to fetch');
    expect(remote.upserts).toHaveLength(0);
    remote.readError = null;
    useSaveStore.getState().setFlag('back-online');
    await useSaveStore.getState().flush();
    expect(remote.rows.k?.data).toMatchObject({ revision: 6, coins: 50 });
  });
});

describe('saveStore.flush', () => {
  beforeEach(() => {
    resetRemote();
    localStorage.clear();
  });

  it('a newer save on the server (migration 0011 refuses ours) stops saving and asks for a refresh (#101h)', async () => {
    await useSaveStore.getState().load('u4');
    remote.upsertError = {
      message: `${SAVE_VERSION_CONFLICT}: this save was written by a newer version of the game (v${SAVE_VERSION + 1}), refusing v${SAVE_VERSION}`,
      code: 'P0001',
      hint: 'Refresh the page to update the game.',
    };
    useSaveStore.getState().setFlag('after-the-update');
    await useSaveStore.getState().flush();
    expect(useSaveStore.getState().status).toBe('outdated');
    expect(useSaveStore.getState().outdatedReason).toBe('update');
    expect(useSaveStore.getState().save).toBeNull();
    // Nothing more to push: later changes are dropped, not retried over the newer save.
    const count = remote.upserts.length;
    useSaveStore.getState().setFlag('another');
    await useSaveStore.getState().flush();
    expect(remote.upserts).toHaveLength(count);
  });

  it('any other server error keeps local play going and just reports it', async () => {
    await useSaveStore.getState().load('u5');
    remote.upsertError = { message: 'relation "public.saves" does not exist', code: '42P01' };
    useSaveStore.getState().setFlag('offline-change');
    await useSaveStore.getState().flush();
    expect(useSaveStore.getState().status).toBe('ready');
    expect(useSaveStore.getState().save).not.toBeNull();
    expect(useSaveStore.getState().remoteError).toContain('does not exist');
    // …and it's sent again next time.
    remote.upsertError = null;
    await useSaveStore.getState().flush();
    expect(remote.rows.u5?.data).toMatchObject({ revision: 1, flags: { 'offline-change': true } });
    expect(useSaveStore.getState().remoteError).toBeNull();
  });

  it('nothing new, nothing sent: a second flush (save crystal, menu Save) doesn\'t resend the same copy (#151)', async () => {
    await useSaveStore.getState().load('u6');
    await vi.waitFor(() => expect(useSaveStore.getState().syncedRevision).toBe(0));
    const count = remote.upserts.length;
    await useSaveStore.getState().flush();
    await useSaveStore.getState().flush();
    expect(remote.upserts).toHaveLength(count);
    expect(useSaveStore.getState().status).toBe('ready');
  });

  it('two devices both at revision 10: the first to save 11 wins, the second is told to reload (#151)', async () => {
    remote.rows.twins = { data: copy(10, 100) };
    await useSaveStore.getState().load('twins');
    // The other device saves its 11 first.
    remote.rows.twins = { data: copy(11, 111) };
    useSaveStore.getState().setFlag('mine');
    await useSaveStore.getState().flush();
    expect(useSaveStore.getState()).toMatchObject({ status: 'outdated', outdatedReason: 'elsewhere', save: null });
    expect(useSaveStore.getState().remoteError).toContain(SAVE_REVISION_CONFLICT);
    expect(remote.rows.twins.data).toMatchObject({ revision: 11, coins: 111 }); // theirs is kept
    // Reloading picks up the other device's progress.
    await useSaveStore.getState().load('twins');
    expect(useSaveStore.getState().save).toMatchObject({ revision: 11, coins: 111 });
  });

  it('a refused copy can\'t win the reload, even after more changes here (its copy is marked revision 0)', async () => {
    remote.rows.late = { data: copy(10, 100) };
    await useSaveStore.getState().load('late');
    remote.rows.late = { data: copy(11, 111) }; // the other device
    remote.hold = true;
    useSaveStore.getState().setFlag('a'); // 11
    const flushing = useSaveStore.getState().flush();
    await settle();
    useSaveStore.getState().update((s) => ({ ...s, coins: 999 })); // 12, before the answer
    expect(local('late').revision).toBe(12);
    remote.gates.shift()!();
    await flushing;
    expect(useSaveStore.getState().status).toBe('outdated');
    expect(local('late')).toMatchObject({ revision: 0, coins: 999 });
    remote.hold = false;
    await useSaveStore.getState().load('late');
    expect(useSaveStore.getState().save).toMatchObject({ revision: 11, coins: 111 });
  });

  it('a refused push leaves another tab\'s newer copy on this device alone: it wins the reload (review round 2)', async () => {
    remote.rows.k = { data: copy(10, 100) };
    await useSaveStore.getState().load('k');
    remote.rows.k = { data: copy(12, 120) }; // another device saved meanwhile
    useSaveStore.getState().setFlag('mine'); // 11
    // Another tab on this browser played on further, not sent yet.
    const theirs = JSON.stringify(copy(13, 130));
    localStorage.setItem(saveKey('k'), theirs);
    await useSaveStore.getState().flush(); // our 11 is refused: the server holds 12
    expect(useSaveStore.getState()).toMatchObject({ status: 'outdated', outdatedReason: 'elsewhere' });
    expect(localStorage.getItem(saveKey('k'))).toBe(theirs); // not marked revision 0
    await useSaveStore.getState().load('k');
    expect(useSaveStore.getState().save).toMatchObject({ revision: 13, coins: 130 });
  });

  it('only our newest push\'s answer counts: an older one refused because the newer landed first is ignored', async () => {
    await useSaveStore.getState().load('race');
    await vi.waitFor(() => expect(useSaveStore.getState().syncedRevision).toBe(0));
    remote.hold = true;
    useSaveStore.getState().setFlag('one'); // 1
    const flushing = useSaveStore.getState().flush();
    await settle();
    useSaveStore.getState().setFlag('two'); // 2
    useSaveStore.getState().flushOnHide(); // sent alongside
    await settle();
    expect(remote.gates).toHaveLength(2);
    remote.gates[1](); // the hide push (2) lands first…
    await settle();
    remote.gates[0](); // …so 1 is refused
    await flushing;
    expect(useSaveStore.getState()).toMatchObject({ status: 'ready', syncedRevision: 2 });
    expect(remote.rows.race?.data).toMatchObject({ revision: 2 });
  });
});

describe('an answer for the last kid, after the game was put away (#151 review round 2)', () => {
  beforeEach(() => {
    resetRemote();
    localStorage.clear();
    remote.rows.a = { data: copy(10, 100) };
    remote.rows.b = { data: copy(5, 50) };
    localStorage.setItem(saveKey('b'), JSON.stringify(copy(5, 50)));
  });

  it.each([
    ['lands', 'lands'],
    ['is refused (another device saved kid A)', 'refused'],
    ['fails (a dropped request)', 'failed'],
  ])('kid A\'s hide push that %s after sign-out and kid B\'s pick changes nothing for kid B', async (_name, answer) => {
    await useSaveStore.getState().load('a');
    if (answer === 'refused') remote.rows.a = { data: copy(12, 120) };
    remote.hold = true;
    useSaveStore.getState().setFlag('a-move'); // 11
    useSaveStore.getState().flushOnHide(); // out, and held
    await settle();
    expect(remote.gates).toHaveLength(1);
    // Signed out in another tab (the game is put away without a flush), then kid B picked.
    useSaveStore.getState().clear();
    remote.hold = false;
    await useSaveStore.getState().load('b');
    if (answer === 'failed') remote.upsertError = { message: 'Failed to fetch' };
    remote.gates.shift()!(); // kid A's answer, late
    await settle();
    remote.upsertError = null;
    if (answer === 'lands') expect(remote.rows.a.data).toMatchObject({ revision: 11, flags: { 'a-move': true } });
    // Kid B plays on as if nothing came back: not stopped, no error, its copy here untouched…
    expect(useSaveStore.getState()).toMatchObject({
      userId: 'b',
      status: 'ready',
      outdatedReason: null,
      remoteError: null,
      syncedRevision: 5,
    });
    expect(local('b')).toMatchObject({ revision: 5, coins: 50 });
    // …and kid B's next change reaches the server (kid A's 11 isn't taken as kid B's).
    useSaveStore.getState().setFlag('b-move'); // 6
    await useSaveStore.getState().flush();
    expect(remote.rows.b.data).toMatchObject({ revision: 6, flags: { 'b-move': true } });
  });

  it('a "back in view" check for kid A answered after kid B was picked can\'t stop kid B', async () => {
    await useSaveStore.getState().load('a');
    remote.rows.a = { data: copy(50, 500) }; // kid A played on elsewhere
    remote.holdReads = true;
    const checking = useSaveStore.getState().checkForNewer(); // held
    await settle();
    useSaveStore.getState().clear();
    const loading = useSaveStore.getState().load('b'); // its read is held too
    await settle();
    expect(remote.readGates).toHaveLength(2);
    remote.readGates[1](); // kid B's load answers first…
    await loading;
    remote.readGates[0](); // …then kid A's check, late
    await checking;
    expect(useSaveStore.getState()).toMatchObject({ userId: 'b', status: 'ready', outdatedReason: null });
    expect(useSaveStore.getState().save).toMatchObject({ revision: 5, coins: 50 });
  });
});

describe('the page hides, closes, comes back (#151)', () => {
  let unwatch: () => void;
  let visibility: DocumentVisibilityState = 'visible';
  const showAs = (state: DocumentVisibilityState) => {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  };

  beforeEach(async () => {
    resetRemote();
    localStorage.clear();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    visibility = 'visible';
    unwatch = watchPageForSaves(window);
    await useSaveStore.getState().load('p');
    await vi.waitFor(() => expect(useSaveStore.getState().syncedRevision).toBe(0));
    remote.upserts = [];
  });
  afterEach(() => {
    unwatch();
    vi.useRealTimers();
  });

  it('hidden: the change waiting on the 2 s debounce goes now, as a keepalive request — once', async () => {
    vi.useFakeTimers();
    useSaveStore.getState().setFlag('just-now');
    showAs('hidden');
    expect(remote.beacons).toHaveLength(1);
    expect(remote.beacons[0].data).toMatchObject({ revision: 1, flags: { 'just-now': true } });
    window.dispatchEvent(new Event('pagehide')); // closing right after: already on its way
    await vi.advanceTimersByTimeAsync(3000); // and the debounce was cancelled
    expect(pushed()).toHaveLength(1);
    expect(useSaveStore.getState().syncedRevision).toBe(1);
  });

  it('closed (pagehide) without being hidden first: saved the same way', async () => {
    useSaveStore.getState().setFlag('closing');
    window.dispatchEvent(new Event('pagehide'));
    expect(remote.beacons).toHaveLength(1);
    await settle();
    expect(remote.rows.p?.data).toMatchObject({ revision: 1 });
  });

  it('nothing new: hiding sends nothing', async () => {
    showAs('hidden');
    window.dispatchEvent(new Event('pagehide'));
    await settle();
    expect(pushed()).toHaveLength(0);
  });

  it('no keepalive possible (no session, too big): saved the normal way instead', async () => {
    remote.noBeacon = true;
    useSaveStore.getState().setFlag('big');
    showAs('hidden');
    expect(remote.upserts).toHaveLength(1);
    await settle();
    expect(remote.rows.p?.data).toMatchObject({ revision: 1 });
  });

  it('a hide push that fails (a refused token, a dropped request) goes again the normal way if the page lives on', async () => {
    vi.useFakeTimers();
    remote.beaconError = { message: 'JWT expired', code: 'PGRST301' };
    useSaveStore.getState().setFlag('hidden-then-back');
    showAs('hidden');
    expect(remote.beacons).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(useSaveStore.getState().remoteError).toContain('JWT expired');
    expect(remote.upserts).toHaveLength(0);
    // The debounce hiding cancelled is back: the normal push sends it.
    await vi.advanceTimersByTimeAsync(2000);
    expect(remote.upserts).toHaveLength(1);
    expect(remote.rows.p?.data).toMatchObject({ revision: 1, flags: { 'hidden-then-back': true } });
    expect(useSaveStore.getState()).toMatchObject({ status: 'ready', syncedRevision: 1, remoteError: null });
    // …once: nothing more goes out after it landed.
    await vi.advanceTimersByTimeAsync(5000);
    expect(pushed()).toHaveLength(2);
  });

  it('a hide push that is refused (a newer copy elsewhere) stops the tab: nothing is sent again', async () => {
    vi.useFakeTimers();
    remote.rows.p = { data: copy(5, 50) }; // another device saved meanwhile
    useSaveStore.getState().setFlag('mine'); // 1
    showAs('hidden');
    await vi.advanceTimersByTimeAsync(0);
    expect(useSaveStore.getState()).toMatchObject({ status: 'outdated', outdatedReason: 'elsewhere' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(pushed()).toHaveLength(1);
    expect(remote.rows.p.data).toMatchObject({ revision: 5, coins: 50 });
  });

  it('back in view with a newer copy on the server (another device): stops and asks for a reload', async () => {
    showAs('hidden');
    remote.rows.p = { data: copy(4, 40) };
    showAs('visible');
    await vi.waitFor(() => expect(useSaveStore.getState().status).toBe('outdated'));
    expect(useSaveStore.getState().outdatedReason).toBe('elsewhere');
  });

  it('restored from the back-forward cache with a newer copy on the server: stops (review round 2)', async () => {
    remote.rows.p = { data: copy(4, 40) }; // another device saved while the page sat in the cache
    const restored = new Event('pageshow');
    Object.defineProperty(restored, 'persisted', { value: true });
    window.dispatchEvent(restored);
    await vi.waitFor(() => expect(useSaveStore.getState().status).toBe('outdated'));
    expect(useSaveStore.getState().outdatedReason).toBe('elsewhere');
  });

  it('a normal push that fails isn\'t retried on a timer, only a hide push is: no loop while offline (review round 2)', async () => {
    vi.useFakeTimers();
    remote.upsertError = { message: 'Failed to fetch' };
    useSaveStore.getState().setFlag('offline'); // 1, on the debounce
    await vi.advanceTimersByTimeAsync(2000); // the debounced push goes, and fails
    expect(remote.upserts).toHaveLength(1);
    expect(useSaveStore.getState().remoteError).toContain('Failed to fetch');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(remote.upserts).toHaveLength(1); // nothing more until the next change, hide or crystal
    // A hide push that fails is tried again once, the normal way — and that one isn't retried.
    remote.beaconError = { message: 'Failed to fetch' };
    showAs('hidden');
    expect(remote.beacons).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(remote.upserts).toHaveLength(2);
    expect(useSaveStore.getState().status).toBe('ready');
  });

  it('back in view and the server has nothing newer: play on', async () => {
    useSaveStore.getState().setFlag('x'); // 1, not yet sent
    showAs('visible');
    await settle();
    await settle();
    expect(useSaveStore.getState().status).toBe('ready');
  });

  it('another tab on this browser saves newer progress: this one stops, and leaves that copy alone', () => {
    const theirs = JSON.stringify(copy(3, 33));
    localStorage.setItem(saveKey('p'), theirs);
    window.dispatchEvent(new StorageEvent('storage', { key: saveKey('p'), newValue: theirs }));
    expect(useSaveStore.getState()).toMatchObject({ status: 'outdated', outdatedReason: 'elsewhere' });
    expect(localStorage.getItem(saveKey('p'))).toBe(theirs);
  });

  it('another tab\'s older or equal copy, or another kid\'s save, changes nothing', () => {
    useSaveStore.getState().setFlag('x'); // 1
    for (const [key, value] of [
      [saveKey('p'), JSON.stringify(copy(1, 1))],
      [saveKey('p'), JSON.stringify(copy(0, 0))],
      [saveKey('p'), null],
      [saveKey('someone-else'), JSON.stringify(copy(9, 9))],
    ] as const) {
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }));
    }
    expect(useSaveStore.getState().status).toBe('ready');
  });
});
