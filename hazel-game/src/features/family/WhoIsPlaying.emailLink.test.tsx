import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Kid } from '../../types';

const take = vi.hoisted(() => vi.fn());
vi.mock('../auth/linkError', async (original) => ({
  ...(await original<typeof import('../auth/linkError')>()),
  takeEmailLinkNotice: take,
}));

const { default: WhoIsPlaying } = await import('./WhoIsPlaying');
const { useFamilyStore } = await import('../../store/familyStore');
const { useAuthStore } = await import('../../store/authStore');

const sam: Kid = { id: 'kid-sam', name: 'Sam', icon: 'fox', hasPin: true, birthYear: 2017, birthMonth: 3 };

beforeEach(() => {
  take.mockReset().mockReturnValue(null);
  useFamilyStore.setState({ kids: [sam] });
  useAuthStore.setState({ user: { id: 'grown-up-1', email: 'new@example.com' } as never });
});

describe("Who's playing? after an email-change link (#124d, #167 review round 1)", () => {
  it('the second link: says the sign-in email is now the new one, focused so it is heard', () => {
    take.mockReturnValue('email-changed');
    render(<WhoIsPlaying />);
    const notice = screen.getByText('Your sign-in email is now new@example.com.');
    expect(notice).toHaveFocus();
    expect(take).toHaveBeenCalledTimes(1);
  });

  it('the first of two: says to tap the other one', () => {
    take.mockReturnValue('other-email');
    render(<WhoIsPlaying />);
    expect(screen.getByText(/Nearly done! Now tap the link in the other email we sent/)).toHaveFocus();
  });

  it('a link that failed says nothing changed and where to ask again', () => {
    take.mockReturnValue('link-failed');
    render(<WhoIsPlaying />);
    expect(screen.getByText(/so nothing changed\. Need a new one\? Ask again in 👪 Grown-ups\./)).toBeInTheDocument();
  });

  it('no link, no notice', () => {
    render(<WhoIsPlaying />);
    expect(screen.queryByText(/sign-in email/)).toBeNull();
    expect(screen.getByRole('heading', { name: "Who's playing?" })).toBeInTheDocument();
  });
});
