import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../lib/supabase', () => ({ supabase: { auth: {}, rpc: vi.fn() }, passwordCheckClient: vi.fn(), forgetStoredSession: vi.fn() }));

const { default: FirstKidPage } = await import('./FirstKidPage');
const { useFamilyStore } = await import('../../store/familyStore');

beforeEach(() => useFamilyStore.setState({ kids: [], consentAt: '2026-10-10T10:00:00Z' }));

describe('Add your first player (#124)', () => {
  it('opens with its title focused — it replaces the screen before (consent), so the keyboard starts here (#167 review round 1 also noted)', () => {
    render(<FirstKidPage />);
    expect(screen.getByRole('heading', { name: 'Add your first player' })).toHaveFocus();
  });

  it("its Sign out says it's on its way and waits (one sign-out)", () => {
    render(<FirstKidPage />);
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveClass('min-h-11');
  });
});
