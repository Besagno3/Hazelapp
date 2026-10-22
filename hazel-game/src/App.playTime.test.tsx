import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';

// The session, family, profile and save are set by hand; nothing reaches Supabase.
vi.mock('./features/auth/useAuthInit', () => ({ useAuthInit: () => {} }));
const rpc = vi.hoisted(() => vi.fn(async () => ({ data: 1, error: null })));
vi.mock('./lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() }, from: vi.fn(), rpc } }));
vi.mock('./features/world/WorldScreen', () => ({ default: () => <p>Welcome to Lumina</p> }));

const { default: App } = await import('./App');
const { useAuthStore } = await import('./store/authStore');
const { useFamilyStore } = await import('./store/familyStore');
const { useSaveStore } = await import('./store/saveStore');
const { useProfileStore } = await import('./store/profileStore');
const { useSettingsStore } = await import('./store/settingsStore');
const { defaultSave } = await import('./lib/save');
const { forgetPlayDays, notePlayDay, pendingPlayDays, playDayRecords } = await import('./lib/playDays');
const { MINUTE_MS } = await import('./lib/activeMinutes');
const { todayIso } = await import('./lib/streak');

// No music in jsdom (it has no audio playback).
useSettingsStore.getState().setMusic(false);

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

function playingInTheWorld() {
  useAuthStore.setState({ session: { user: { id: 'grown-up' } } as unknown as Session, user: { id: 'grown-up' } as Session['user'], initialized: true });
  useFamilyStore.setState({
    userId: 'grown-up',
    status: 'ready',
    consentAt: '2026-10-10T10:00:00Z',
    kids: [{ id: 'kid-1', name: 'Mia', icon: 'fox', hasPin: true, birthYear: 2017, birthMonth: 1 }],
    activeKidId: 'kid-1',
    grownUpsOpen: false,
  });
  useSaveStore.setState({ userId: 'kid-1', status: 'ready', save: { ...defaultSave(), worldUnlocked: true, avatarId: 'a1' } });
  useProfileStore.setState({
    profile: { id: 'kid-1', birthYear: 2017, birthMonth: 1, skillLevels: {}, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
  });
}

describe('App notes the minutes a kid really plays, and sends their day when the tab is hidden (#172, #29)', () => {
  it('a minute with a key pressed in the game counts; the same minute in 👪 Grown-ups does not', async () => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    playingInTheWorld();
    render(<App />);
    await screen.findByText('Welcome to Lumina');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    act(() => {
      vi.advanceTimersByTime(MINUTE_MS);
    });
    expect(playDayRecords('kid-1')).toEqual([{ day: todayIso(), xp: 0, minutes: 1, topics: {} }]);
    act(() => {
      useFamilyStore.setState({ grownUpsOpen: true });
    });
    fireEvent.keyDown(window, { key: 'a' });
    act(() => {
      vi.advanceTimersByTime(MINUTE_MS);
    });
    expect(playDayRecords('kid-1')[0].minutes).toBe(1);
  });

  it("the tab going out of view sends the kid's day at once", async () => {
    localStorage.clear();
    playingInTheWorld();
    render(<App />);
    await screen.findByText('Welcome to Lumina');
    await notePlayDay('kid-1', todayIso()); // sent, so the next send waits a couple of minutes…
    rpc.mockClear();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    useProfileStore.getState().noteAnswer({ id: 'bank-q', topic: 'math', level: 4 }, true);
    expect(rpc).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange')); // …unless the tab is hidden
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('note_play_history', expect.objectContaining({ p_kid: 'kid-1' })));
  });

  it('a day the profile already counts as played (the tablet, this morning): the minutes walked here go up on a hidden tab, with no round or XP (review round 2)', async () => {
    localStorage.clear();
    forgetPlayDays('kid-1');
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    playingInTheWorld();
    useProfileStore.setState({ profile: { ...useProfileStore.getState().profile!, lastPlayedOn: todayIso(), currentStreak: 1 } });
    render(<App />);
    await screen.findByText('Welcome to Lumina');
    rpc.mockClear();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    act(() => {
      vi.advanceTimersByTime(MINUTE_MS);
    });
    expect(pendingPlayDays('kid-1')).toEqual([todayIso()]);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('note_play_history', { p_kid: 'kid-1', p_days: [{ day: todayIso(), xp: 0, minutes: 1, topics: {}, noted: true }] }),
    );
  });
});
