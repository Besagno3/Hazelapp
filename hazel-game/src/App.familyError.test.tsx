import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';

// The session and the family are set by hand below.
vi.mock('./features/auth/useAuthInit', () => ({ useAuthInit: () => {} }));
const auth = vi.hoisted(() => ({ signOut: vi.fn(async () => ({ error: null })) }));
vi.mock('./lib/supabase', () => ({ supabase: { auth } }));

const { default: App } = await import('./App');
const { useAuthStore } = await import('./store/authStore');
const { useFamilyStore } = await import('./store/familyStore');
const { useSettingsStore } = await import('./store/settingsStore');
const { SIGNED_OUT_MESSAGE } = await import('./lib/errors');

// No music in jsdom (it has no audio playback).
useSettingsStore.getState().setMusic(false);

function signedIn() {
  useAuthStore.setState({
    session: { user: { id: 'grown-up' } } as unknown as Session,
    user: { id: 'grown-up' } as Session['user'],
    initialized: true,
  });
}

afterEach(() => {
  useAuthStore.setState({ session: null, user: null, initialized: false });
  useFamilyStore.getState().clear();
});

describe("App's family error screen (#124 review)", () => {
  it('a run-out sign-in offers what the words ask for: "Sign in again", which signs out here', async () => {
    signedIn();
    useFamilyStore.setState({ userId: 'grown-up', status: 'error', error: SIGNED_OUT_MESSAGE, sessionGone: true });
    render(<App />);
    expect(screen.getByText(SIGNED_OUT_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    await act(async () => {});
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('any other failure keeps "Try again"', () => {
    signedIn();
    useFamilyStore.setState({ userId: 'grown-up', status: 'error', error: 'We couldn\'t open your family just now.', sessionGone: false });
    render(<App />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in again' })).toBeNull();
  });
});
