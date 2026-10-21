import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';

// The session, family and save are set by hand below; nothing reaches Supabase.
vi.mock('./features/auth/useAuthInit', () => ({ useAuthInit: () => {} }));
vi.mock('./lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() }, from: vi.fn(), rpc: vi.fn() } }));
// The world itself is a stand-in: what matters here is its file failing to load.
vi.mock('./features/world/WorldScreen', () => ({ default: () => <p>Welcome to Lumina</p> }));
const chunk = vi.hoisted(() => ({ fail: 0 }));
vi.mock('./lib/lazyRetry', async (original) => {
  const real = await original<typeof import('./lib/lazyRetry')>();
  return {
    ...real,
    retryableLazy: ((load: Parameters<typeof real.retryableLazy>[0]) =>
      real.retryableLazy(() => {
        if (chunk.fail > 0) {
          chunk.fail -= 1;
          return Promise.reject<Awaited<ReturnType<typeof load>>>(
            new TypeError('Failed to fetch dynamically imported module: http://localhost/src/features/world/WorldScreen.tsx'),
          );
        }
        return load();
      })) as typeof real.retryableLazy,
  };
});

const { default: App } = await import('./App');
const { useAuthStore } = await import('./store/authStore');
const { useFamilyStore } = await import('./store/familyStore');
const { useSaveStore } = await import('./store/saveStore');
const { useSettingsStore } = await import('./store/settingsStore');
const { defaultSave } = await import('./lib/save');

// No music in jsdom (it has no audio playback).
useSettingsStore.getState().setMusic(false);

const quiet = (e: ErrorEvent) => e.preventDefault();
beforeEach(() => window.addEventListener('error', quiet));
afterEach(() => {
  window.removeEventListener('error', quiet);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the world's file not loading (#29 review round 1)", () => {
  it('shows its own screen, not the crash screen; offline it asks a grown-up and keeps the game; Try again goes in once it loads', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    chunk.fail = 2;
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, href: 'http://localhost/play/', reload });
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    useAuthStore.setState({ session: { user: { id: 'grown-up' } } as unknown as Session, user: { id: 'grown-up' } as Session['user'], initialized: true });
    useFamilyStore.setState({
      userId: 'grown-up',
      status: 'ready',
      consentAt: '2026-10-10T10:00:00Z',
      kids: [{ id: 'kid-1', name: 'Mia', icon: 'fox', hasPin: true, birthYear: 2017, birthMonth: 1 }],
      activeKidId: 'kid-1',
      grownUpsOpen: false,
    });
    useSaveStore.setState({ status: 'ready', save: { ...defaultSave(), worldUnlocked: true, avatarId: 'a1' } });
    render(<App />);
    expect(await screen.findByRole('heading', { name: "The world didn't load" })).toBeInTheDocument();
    expect(screen.getByText('Tap "Try again" to go back in. Your adventure is saved as you play.')).toBeInTheDocument();
    expect(screen.queryByText(/tripped over/)).toBeNull();
    // The server out of reach: no reload (it would lose the game), a grown-up asked to check.
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(`We couldn't reach Hazel Quest. Ask a grown-up to check the internet, then tap "Try again".`)).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    // Back online: in it goes.
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Welcome to Lumina')).toBeInTheDocument();
  });
});
