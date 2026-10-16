import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';

// The session is set by hand below; nothing should reach Supabase.
vi.mock('./features/auth/useAuthInit', () => ({ useAuthInit: () => {} }));

const { default: App } = await import('./App');
const { useAuthStore } = await import('./store/authStore');
const { useSettingsStore } = await import('./store/settingsStore');

// No music in jsdom (it has no audio playback).
useSettingsStore.getState().setMusic(false);

afterEach(() => {
  window.history.replaceState(null, '', '/');
  useAuthStore.setState({ session: null, user: null, initialized: false });
});

describe('App and the public site\'s ?signup (#146)', () => {
  it('drops ?signup for someone already signed in, so a later sign-out opens on Sign in', () => {
    window.history.replaceState(null, '', '/play/?signup');
    useAuthStore.setState({
      session: { user: { id: 'grown-up' } } as unknown as Session,
      user: { id: 'grown-up' } as Session['user'],
      initialized: true,
    });
    render(<App />);
    expect(window.location.search).toBe('');
  });

  it('leaves it for the sign-in page when no one is signed in', () => {
    window.history.replaceState(null, '', '/play/?signup');
    useAuthStore.setState({ session: null, user: null, initialized: false });
    render(<App />);
    expect(window.location.search).toBe('?signup');
  });
});
