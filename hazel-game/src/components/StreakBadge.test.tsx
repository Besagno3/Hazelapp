import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import StreakBadge from './StreakBadge';
import { useProfileStore } from '../store/profileStore';
import type { Profile } from '../types';

function setProfile(overrides: Partial<Profile> = {}) {
  useProfileStore.setState({
    profile: {
      id: 'u1',
      birthYear: 2014,
      birthMonth: 6,
      skillLevels: {},
      xp: 0,
      powerUps: {},
      currentStreak: 0,
      longestStreak: 0,
      lastPlayedOn: null,
      ...overrides,
    },
  });
}

describe('StreakBadge', () => {
  beforeEach(() => {
    useProfileStore.getState().clearProfile();
  });

  it('renders nothing without a profile', () => {
    const { container } = render(<StreakBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on day zero (kid has never played)', () => {
    setProfile({ currentStreak: 0 });
    const { container } = render(<StreakBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the current streak in days (singular at 1)', () => {
    setProfile({ currentStreak: 1, longestStreak: 1 });
    render(<StreakBadge />);
    expect(screen.getByText('1 day')).toBeInTheDocument();
  });

  it('pluralises beyond a 1-day streak', () => {
    setProfile({ currentStreak: 5, longestStreak: 7 });
    render(<StreakBadge />);
    expect(screen.getByText('5 days')).toBeInTheDocument();
    // Not a new record — should show the plain "Streak" label.
    expect(screen.getByText('Streak')).toBeInTheDocument();
  });

  it('calls out a tie with the longest streak ("Best streak!")', () => {
    setProfile({ currentStreak: 10, longestStreak: 10 });
    render(<StreakBadge />);
    expect(screen.getByText(/best streak/i)).toBeInTheDocument();
  });
});
