import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import LevelBadge from './LevelBadge';
import { useProfileStore } from '../store/profileStore';

describe('LevelBadge', () => {
  beforeEach(() => {
    useProfileStore.getState().clearProfile();
  });

  it('falls back to level 1 / 0 XP when no profile is loaded', () => {
    render(<LevelBadge />);
    expect(screen.getByText('Level 1')).toBeInTheDocument();
    expect(screen.getByText('0/100 XP')).toBeInTheDocument();
  });

  it('uses a top-center placement in battle (clears the combatant panels)', () => {
    const { container } = render(<LevelBadge placement="top-center" />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('left-1/2');
    expect(badge.className).not.toContain('left-3');
  });

  it('shows the level derived from the profile XP', () => {
    useProfileStore.setState({
      profile: {
        id: 'u1',
        birthYear: 2014,
        birthMonth: 6,
        skillLevels: {},
        xp: 250,
        powerUps: {},
        currentStreak: 0,
        longestStreak: 0,
        lastPlayedOn: null,
      },
    });
    render(<LevelBadge />);
    // 250 XP → floor(250/100) + 1 = level 3
    expect(screen.getByText('Level 3')).toBeInTheDocument();
    expect(screen.getByText('50/100 XP')).toBeInTheDocument();
  });
});
