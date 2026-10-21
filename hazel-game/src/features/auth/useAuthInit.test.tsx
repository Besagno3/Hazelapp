import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';

// The auth client, stubbed: no session to start with, and auth events sent by hand.
type Listener = (event: string, session: Session | null) => void;
const auth = vi.hoisted(() => ({
  listener: null as Listener | null,
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn((cb: Listener) => {
    auth.listener = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  }),
}));
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));

const { useAuthInit } = await import('./useAuthInit');
const { useFamilyStore } = await import('../../store/familyStore');

const session = (id: string) => ({ user: { id } }) as unknown as Session;
// Loading a family records whose it is, as the real `load` does first.
const load = vi.fn(async (id: string) => {
  useFamilyStore.setState({ userId: id });
});

beforeEach(() => {
  load.mockClear();
  useFamilyStore.getState().clear();
  useFamilyStore.setState({ load });
});

describe('useAuthInit (#124, #124b review round 2)', () => {
  it('loads the family on a sign-in, not on a token refresh — and again after a family cleared without an event', async () => {
    renderHook(() => useAuthInit());
    await act(async () => {});
    act(() => auth.listener?.('SIGNED_IN', session('grown-up-1')));
    expect(load).toHaveBeenCalledTimes(1);
    act(() => auth.listener?.('TOKEN_REFRESHED', session('grown-up-1')));
    expect(load).toHaveBeenCalledTimes(1);
    // A sign-out the server never heard clears the stores by hand (`signOutHere`'s last resort):
    // the same grown-up signing in again gets their family back.
    act(() => useFamilyStore.getState().clear());
    act(() => auth.listener?.('SIGNED_IN', session('grown-up-1')));
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenLastCalledWith('grown-up-1');
  });

  it('a sign-out clears the family; another grown-up gets their own', async () => {
    renderHook(() => useAuthInit());
    await act(async () => {});
    act(() => auth.listener?.('SIGNED_IN', session('grown-up-1')));
    act(() => auth.listener?.('SIGNED_OUT', null));
    expect(useFamilyStore.getState().userId).toBeNull();
    act(() => auth.listener?.('SIGNED_IN', session('grown-up-2')));
    expect(load).toHaveBeenLastCalledWith('grown-up-2');
  });
});
