import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const sendFlow = vi.fn();
vi.mock('../../machines/gameFlow', async (orig) => ({
  ...(await orig<typeof import('../../machines/gameFlow')>()),
  sendFlow: (...args: unknown[]) => sendFlow(...args),
}));

const { default: MenuOverlay } = await import('./MenuOverlay');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { defaultSave } = await import('../../lib/save');
const { SECRETS_BADGE } = await import('../../content/secrets');

beforeEach(() => {
  sendFlow.mockClear();
  useProfileStore.setState({ profile: null });
  useSaveStore.setState({ userId: null, status: 'ready', remoteError: null, save: defaultSave() });
});

describe('MenuOverlay', () => {
  it('Escape is "Back to the world", like ✕ (#110o)', () => {
    render(<MenuOverlay />);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Menu' }), { key: 'Escape' });
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
  });

  it('the Secret Seeker trophy sits on the shelf with its name (#80b)', () => {
    useSaveStore.setState({ save: { ...defaultSave(), badges: [SECRETS_BADGE] } });
    render(<MenuOverlay />);
    expect(screen.getByText('Secret Seeker')).toBeInTheDocument();
    expect(screen.getByText('🔍')).toBeInTheDocument();
  });
});
